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
// Аліас для сумісності (якщо в браузері збереглося 'ua')
I18N.ua = I18N.uk;

const urlParams = new URLSearchParams(window.location.search);
let paramLang = urlParams.get('lang') || tg?.initDataUnsafe?.start_param?.replace('lang_', '') || localStorage.getItem("user_lang") || "uk";

let currentLang = (paramLang === 'en') ? 'en' : 'uk';
localStorage.setItem("user_lang", currentLang);

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

let currentBigPrices = [];
let lastHapticIndex = -1;
let latestModalPrice = 0;

function fmt(x) {
  if (x < 1) return "$" + x.toFixed(4);
  if (x < 10) return "$" + x.toFixed(3);
  return "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Завантаження свічок з резервними серверами Binance
async function fetchKlines(sym, interval = "1h", limit = 24) {
  const cacheKey = `${sym}_${interval}_${limit}`;
  if (klinesCache[cacheKey]) return klinesCache[cacheKey];

  const hosts = [
    "https://data-api.binance.vision",
    "https://api.binance.com",
    "https://api1.binance.com"
  ];

  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const prices = data.map(k => parseFloat(k[4]));
          klinesCache[cacheKey] = prices;
          return prices;
        }
      }
    } catch (e) {}
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

// Великий інтерактивний графік
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

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = "#F0B90B";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < pts.length) {
    const selPt = pts[selectedIndex];

    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(selPt.x, 0);
    ctx.lineTo(selPt.x, h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(selPt.x, selPt.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(240, 185, 11, 0.28)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(selPt.x, selPt.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#F0B90B";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(selPt.x, selPt.y, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
  } else {
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

  if (index !== lastHapticIndex) {
    lastHapticIndex = index;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.selectionChanged();
    } else if (navigator.vibrate) {
      navigator.vibrate(8);
    }
  }

  const inspectedPrice = currentBigPrices[index];
  const priceEl = document.getElementById("modalCoinPrice");
  if (priceEl) {
    priceEl.textContent = fmt(inspectedPrice);
    priceEl.classList.add("inspecting");
  }

  drawBigChart(currentBigPrices, index);
}

function handleTouchEnd() {
  lastHapticIndex = -1;
  setTimeout(() => {
    if (lastHapticIndex === -1 && latestModalPrice) {
      const priceEl = document.getElementById("modalCoinPrice");
      if (priceEl) {
        priceEl.textContent = fmt(latestModalPrice);
        priceEl.classList.remove("inspecting");
      }
      drawBigChart(currentBigPrices, null);
    }
  }, 800);
}

async function openChartModal(sym, currentPrice) {
  activeModalCoin = sym;
  latestModalPrice = currentPrice;
  const modal = document.getElementById("chartModal");
  document.getElementById("modalCoinName").textContent = `${sym.replace("USDT", "")}/USDT`;
  document.getElementById("modalCoinPrice").textContent = fmt(currentPrice);

  modal.classList.remove("hidden");
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");

  await updateBigChart();
}

async function updateBigChart() {
  if (!activeModalCoin) return;
  const t = I18N[currentLang] || I18N.uk;

  let interval = "1h", limit = 24;
  let timeLabels = ["00:00", "06:00", "12:00", "18:00", t.now];

  if (activeModalTF === "7d") {
    interval = "4h"; limit = 42;
    timeLabels = ["7д", "5д", "3д", "1д", t.now];
  } else if (activeModalTF === "1m") {
    interval = "1d"; limit = 30;
    timeLabels = ["30д", "20д", "10д", "5д", t.now];
  } else if (activeModalTF === "1y") {
    interval = "1d"; limit = 365;
    timeLabels = [currentLang === 'uk' ? "1 р тому" : "1y ago", "9м", "6м", "3м", t.now];
  } else if (activeModalTF === "2y") {
    interval = "1d"; limit = 730;
    timeLabels = [currentLang === 'uk' ? "2 р тому" : "2y ago", "1.5р", "1р", "6м", t.now];
  } else if (activeModalTF === "5y") {
    interval = "1w"; limit = 260;
    timeLabels = [currentLang === 'uk' ? "5 р тому" : "5y ago", "4р", "2.5р", "1р", t.now];
  }

  const labelsRow = document.getElementById("timeLabelsRow");
  if (labelsRow) {
    labelsRow.innerHTML = timeLabels.map(l => `<span>${l}</span>`).join("");
  }

  currentBigPrices = await fetchKlines(activeModalCoin, interval, limit);
  drawBigChart(currentBigPrices, null);
}

function verdict(s) {
  const price = parseFloat(s.lastPrice);
  const low = parseFloat(s.lowPrice);
  const high = parseFloat(s.highPrice);
  const t = I18N[currentLang] || I18N.uk;

  if (price <= low * (1 + LOW_ZONE / 100)) return ["buy", t.signalBuy];
  if (price >= high * (1 - HIGH_ZONE / 100)) return ["sell", t.signalSell];
  return ["wait", t.signalWait];
}

// Завантаження котирувань 10 монет (Миттєве виконання)
async function load() {
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) refreshBtn.classList.add("spinning");

  const symbolsParam = encodeURIComponent(JSON.stringify(COINS));
  const urls = [
    `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${symbolsParam}`,
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsParam}`,
    `https://api1.binance.com/api/v3/ticker/24hr?symbols=${symbolsParam}`
  ];

  let data = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        data = await res.json();
        if (Array.isArray(data) && data.length > 0) break;
      }
    } catch (e) {}
  }

  if (data && Array.isArray(data)) {
    const map = {};
    data.forEach(item => { map[item.symbol] = item; });
    lastMarketData = COINS.map(s => map[s]).filter(Boolean);
    render(lastMarketData);
  } else {
    const t = I18N[currentLang] || I18N.uk;
    document.getElementById("updated").textContent = t.networkError;
  }

  if (refreshBtn) {
    setTimeout(() => refreshBtn.classList.remove("spinning"), 500);
  }
}

function render(items) {
  const grid = document.getElementById("grid");
  if (!grid) return;
  grid.innerHTML = "";
  const t = I18N[currentLang] || I18N.uk;

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

    card.onclick = () => openChartModal(sym, price);
    grid.appendChild(card);

    fetchKlines(sym, "1h", 24).then(prices => {
      drawMiniSparkline(`chart-${sym}`, prices);
    });
  });

  const now = new Date();
  document.getElementById("updated").textContent =
    t.updated + " " + now.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function selectLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("user_lang", lang);
  document.getElementById("langModal").classList.add("hidden");
  document.getElementById("currentLangLabel").textContent = (I18N[currentLang] || I18N.uk).langShort;
  if (lastMarketData.length) render(lastMarketData);
}

// Прив'язка подій після завантаження DOM
document.addEventListener("DOMContentLoaded", () => {
  const chartCanvas = document.getElementById("bigChartCanvas");
  if (chartCanvas) {
    chartCanvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      handleTouchMove(e);
    }, { passive: false });

    chartCanvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      handleTouchMove(e);
    }, { passive: false });

    chartCanvas.addEventListener("touchend", handleTouchEnd);
    chartCanvas.addEventListener("touchcancel", handleTouchEnd);

    let isMouseDown = false;
    chartCanvas.addEventListener("mousedown", (e) => { isMouseDown = true; handleTouchMove(e); });
    window.addEventListener("mousemove", (e) => { if (isMouseDown) handleTouchMove(e); });
    window.addEventListener("mouseup", () => { if (isMouseDown) { isMouseDown = false; handleTouchEnd(); } });
  }

  document.querySelectorAll(".tf-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tf-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeModalTF = btn.dataset.tf;
      if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
      updateBigChart();
    };
  });

  const closeBtn = document.getElementById("closeChartBtn");
  if (closeBtn) closeBtn.onclick = () => document.getElementById("chartModal").classList.add("hidden");

  const langBtn = document.getElementById("langSwitchBtn");
  if (langBtn) langBtn.onclick = () => document.getElementById("langModal").classList.remove("hidden");

  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) refreshBtn.onclick = () => load();

  const langLabel = document.getElementById("currentLangLabel");
  if (langLabel) langLabel.textContent = (I18N[currentLang] || I18N.uk).langShort;
});

// Запуск
load();
setInterval(load, REFRESH_MS);
