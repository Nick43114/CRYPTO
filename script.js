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
    tf1d: "1 дн", tf7d: "7 дн", tf1m: "1 міс"
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
    tf1d: "1d", tf7d: "7d", tf1m: "1m"
  }
};

// Читаем язык из бота (?lang=ua / ?lang=en)
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
const klinesCache = {}; // Кэш: sym -> [candles]
let activeModalCoin = null;
let activeModalTF = "1d";

// Форматирование цены
function fmt(x) {
  if (x < 1) return "$" + x.toFixed(4);
  if (x < 10) return "$" + x.toFixed(3);
  return "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Загрузка свечей с Binance
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
    console.error("Ошибка свечей", e);
  }
  return [];
}

// Отрисовка мини-графика на карточке (Золотой стиль Binance как на Скриншоте 2)
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

  // Золотистый градиент Binance
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

  // Линия графика
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = "#F0B90B";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

// Отрисовка большого графика в модальном окне (Точь-в-точь Скриншот 2)
function drawBigChart(prices) {
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

  const pts = prices.map((p, i) => ({
    x: (i / (prices.length - 1)) * (w - 10) + 5,
    y: h - 15 - ((p - min) / range) * (h - 30)
  }));

  // Фоновая заливка градиентом
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(240, 185, 11, 0.4)");
  grad.addColorStop(1, "rgba(240, 185, 11, 0.0)");

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineTo(pts[pts.length - 1].x, h);
  ctx.lineTo(pts[0].x, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Линия
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = "#F0B90B";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // Горизонтальная пунктирная линия текущей цены
  const lastY = pts[pts.length - 1].y;
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.moveTo(0, lastY);
  ctx.lineTo(w, lastY);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.stroke();
  ctx.setLineDash([]);
}

// Открытие подробного графика по клику на карточку
async function openChartModal(sym, currentPrice) {
  activeModalCoin = sym;
  const modal = document.getElementById("chartModal");
  document.getElementById("modalCoinName").textContent = `${sym.replace("USDT", "")}/USDT`;
  document.getElementById("modalCoinPrice").textContent = fmt(currentPrice);

  modal.classList.remove("hidden");
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");

  await updateBigChart();
}

async function updateBigChart() {
  if (!activeModalCoin) return;
  let interval = "1h", limit = 24;
  if (activeModalTF === "7d") { interval = "4h"; limit = 42; }
  if (activeModalTF === "1m") { interval = "1d"; limit = 30; }

  const prices = await fetchKlines(activeModalCoin, interval, limit);
  drawBigChart(prices);
}

// Вердикт
function verdict(s) {
  const price = parseFloat(s.lastPrice);
  const low = parseFloat(s.lowPrice);
  const high = parseFloat(s.highPrice);
  const t = I18N[currentLang];

  if (price <= low * (1 + LOW_ZONE / 100)) return ["buy", t.signalBuy];
  if (price >= high * (1 - HIGH_ZONE / 100)) return ["sell", t.signalSell];
  return ["wait", t.signalWait];
}

// Запрос котировок Binance
async function load() {
  const refreshBtn = document.getElementById("refreshBtn");
  refreshBtn.classList.add("spinning");

  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr");
    const all = await res.json();
    const map = {};
    all.forEach(item => {
      if (COINS.includes(item.symbol)) map[item.symbol] = item;
    });

    lastMarketData = COINS.map(s => map[s]).filter(Boolean);
    render(lastMarketData);
  } catch (e) {
    document.getElementById("updated").textContent = I18N[currentLang].networkError;
  } finally {
    setTimeout(() => refreshBtn.classList.remove("spinning"), 500);
  }
}

// Отрисовка карточек
function render(items) {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  const t = I18N[currentLang];

  items.forEach(s => {
    const sym = s.symbol;
    const name = sym.replace("USDT", "");
    const price = parseFloat(s.lastPrice);
    const low = parseFloat(s.lowPrice);
    const high = parseFloat(s.highPrice);
    const chg = parseFloat(s.priceChangePercent);
    const isUp = chg >= 0;
    const [cls, text] = verdict(s);

    let rangePct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-top">
        <span class="coin-symbol">${name}</span>
        <span class="coin-pair">/USDT</span>
      </div>
      <div class="price">${fmt(price)}</div>
      <div class="change ${isUp ? "up" : "down"}">${isUp ? "+ " : ""}${chg.toFixed(2)}%</div>

      <!-- Золотистый график в карточке -->
      <div class="card-chart-wrap">
        <canvas class="mini-chart-canvas" id="chart-${sym}"></canvas>
      </div>

      <div class="signal-badge ${cls}">${text}</div>
      <div class="range-container">
        <div class="range-bar-bg">
          <div class="range-bar-fill" style="width: ${rangePct}%;"></div>
        </div>
        <div class="range-labels">
          <span>L: ${fmt(low)}</span>
          <span>H: ${fmt(high)}</span>
        </div>
      </div>
    `;

    // Клик открывает график на весь экран
    card.onclick = () => openChartModal(sym, price);

    grid.appendChild(card);

    // Рисуем мини-график
    fetchKlines(sym, "1h", 24).then(prices => {
      drawMiniSparkline(`chart-${sym}`, prices);
    });
  });

  const now = new Date();
  document.getElementById("updated").textContent =
    t.updated + " " + now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function selectLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("user_lang", lang);
  document.getElementById("langModal").classList.add("hidden");
  document.getElementById("currentLangLabel").textContent = I18N[currentLang].langShort;
  if (lastMarketData.length) render(lastMarketData);
}

// Привязка кнопок таймфреймов в модальном окне
document.querySelectorAll(".tf-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tf-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeModalTF = btn.dataset.tf;
    updateBigChart();
  };
});

document.getElementById("closeChartBtn").onclick = () => {
  document.getElementById("chartModal").classList.add("hidden");
};

document.getElementById("langSwitchBtn").onclick = () => {
  document.getElementById("langModal").classList.remove("hidden");
};

document.getElementById("refreshBtn").onclick = () => load();

// Старт
document.getElementById("currentLangLabel").textContent = I18N[currentLang].langShort;
load();
setInterval(load, REFRESH_MS);