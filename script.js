const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0b0e14');
  tg.setBackgroundColor('#0b0e14');
}

const I18N = {
  uk: {
    syncing: "Синхронізація...",
    updated: "Оновлено",
    connecting: "Завантаження котирувань...",
    networkError: "Помилка мережі...",
    signalBuy: "● КУПУВАТИ",
    signalSell: "● ПРОДАВАТИ",
    signalWait: "● ОЧІКУВАННЯ",
    langShort: "UA",
    now: "Зараз"
  },
  en: {
    syncing: "Syncing...",
    updated: "Updated",
    connecting: "Connecting to Binance...",
    networkError: "Network error...",
    signalBuy: "● BUY",
    signalSell: "● SELL",
    signalWait: "● WAIT",
    langShort: "EN",
    now: "Now"
  }
};

const urlParams = new URLSearchParams(window.location.search);
const paramLang = urlParams.get('lang') || tg?.initDataUnsafe?.start_param?.replace('lang_', '');

let currentLang = localStorage.getItem("user_lang") || "uk";
if (paramLang) {
  currentLang = (paramLang === 'en') ? 'en' : 'uk';
  localStorage.setItem("user_lang", currentLang);
}

const COINS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
  "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT"
];

const LOW_ZONE = 2;
const HIGH_ZONE = 2;
const REFRESH_MS = 10000;

let lastMarketData = [];
const klinesCache = {}; 
let activeModalCoin = null;
let activeModalTF = "1d";

// Змінні для інтерактивного графіка
let currentBigPrices = [];
let lastHapticIndex = -1;
let latestModalPrice = 0;

function fmt(x) {
  if (x < 1) return "$" + x.toFixed(4);
  if (x < 10) return "$" + x.toFixed(3);
  return "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Завантаження історичних свічок
async function fetchKlines(sym, interval = "1h", limit = 24) {
  const cacheKey = `${sym}_${interval}_${limit}`;
  if (klinesCache[cacheKey]) return klinesCache[cacheKey];

  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      const prices = data.map(k => parseFloat(k[4]));
      klinesCache[cacheKey] = prices;
      return prices;
    }
  } catch (e) {
    console.error("Помилка свічок", e);
  }
  return [];
}

// Міні-графік на картках
function drawMiniSparkline(canvasId, prices) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !prices || prices.length < 2) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 140;
  const h = rect.height || 40;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const pts = prices.map((p, i) => ({
    x: (i / (prices.length - 1)) * (w - 4) + 2,
    y: h - 4 - ((p - min) / range) * (h - 8)
  }));

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(240, 185, 11, 0.35)");
  grad.addColorStop(1, "rgba(240, 185, 11, 0.0)");

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineTo(pts[pts.length - 1].x, h);
  ctx.lineTo(pts[0].x, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = "#F0B90B";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

// Великий інтерактивний графік з точкою та прицілом
function drawBigChart(prices, selectedIndex = null) {
  const canvas = document.getElementById("bigChartCanvas");
  if (!canvas || !prices || prices.length < 2) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height || 220;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const startX = 6;
  const endX = w - 6;

  const pts = prices.map((p, i) => ({
    x: startX + (i / (prices.length - 1)) * (endX - startX),
    y: h - 15 - ((p - min) / range) * (h - 32)
  }));

  // Градієнт заливки
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(240, 185, 11, 0.38)");
  grad.addColorStop(1, "rgba(240, 185, 11, 0.0)");

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineTo(pts[pts.length - 1].x, h);
  ctx.lineTo(pts[0].x, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Основна лінія графіка
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = "#F0B90B";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // Якщо користувач веде пальцем — малюємо приціл і точку
  if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < pts.length) {
    const selPt = pts[selectedIndex];

    // 1. Вертикальна пунктирна лінія прицілу
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(selPt.x, 0);
    ctx.lineTo(selPt.x, h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Горизонтальна пунктирна лінія до ціни
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(0, selPt.y);
    ctx.lineTo(w, selPt.y);
    ctx.strokeStyle = "rgba(240, 185, 11, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Зовнішнє сяйво точки
    ctx.beginPath();
    ctx.arc(selPt.x, selPt.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(240, 185, 11, 0.28)";
    ctx.fill();

    // 4. Золоте кільце точки
    ctx.beginPath();
    ctx.arc(selPt.x, selPt.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#F0B90B";
    ctx.fill();

    // 5. Біле ядро всередині точки
    ctx.beginPath();
    ctx.arc(selPt.x, selPt.y, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

  } else {
    // Якщо палець відпущено — звичайна пунктирна лінія останньої ціни
    const lastPt = pts[pts.length - 1];
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(0, lastPt.y);
    ctx.lineTo(w, lastPt.y);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// Обробка торкання пальцем графіка з вібровідгуком
function handleTouchMove(e) {
  if (!currentBigPrices || currentBigPrices.length < 2) return;
  const canvas = document.getElementById("bigChartCanvas");
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const touchX = clientX - rect.left;

  const w = rect.width;
  const startX = 6;
  const endX = w - 6;
  const clampedX = Math.max(startX, Math.min(endX, touchX));

  const ratio = (clampedX - startX) / (endX - startX);
  const index = Math.round(ratio * (currentBigPrices.length - 1));

  // Якщо перейшли на нову точку — даємо тактильну вібрацію (клік)!
  if (index !== lastHapticIndex) {
    lastHapticIndex = index;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.selectionChanged(); // Легкий тактильний клік Telegram
    } else if (navigator.vibrate) {
      navigator.vibrate(8);
    }
  }

  // Оновлюємо ціну в заголовку на ціну обраної точки
  const inspectedPrice = currentBigPrices[index];
  document.getElementById("modalCoinPrice").textContent = fmt(inspectedPrice);
  document.getElementById("modalCoinPrice").classList.add("inspecting");

  drawBigChart(currentBigPrices, index);
}

function handleTouchEnd() {
  lastHapticIndex = -1;
  // Повертаємо останню актуальну ціну через 800 мс після відпускання
  setTimeout(() => {
    if (lastHapticIndex === -1 && latestModalPrice) {
      document.getElementById("modalCoinPrice").textContent = fmt(latestModalPrice);
      document.getElementById("modalCoinPrice").classList.remove("inspecting");
      drawBigChart(currentBigPrices, null);
    }
  }, 800);
}

// Прив'язка сенсорних подій до полотна графіка
const chartCanvas = document.getElementById("bigChartCanvas");
if (chartCanvas) {
  chartCanvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handl
