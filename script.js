// Интеграция с Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0b0e14');
  tg.setBackgroundColor('#0b0e14');
}

const COINS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
  "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT"
];

const LOW_ZONE = 2;   // % от низа (зона покупки)
const HIGH_ZONE = 2;  // % от верха (зона продажи)
const REFRESH_MS = 10000;

// Форматирование цены в зависимости от величины
function fmt(x) {
  if (x < 1) return "$" + x.toFixed(4);
  if (x < 10) return "$" + x.toFixed(3);
  return "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Определение биржевого сигнала
function verdict(s) {
  const price = parseFloat(s.lastPrice);
  const low = parseFloat(s.lowPrice);
  const high = parseFloat(s.highPrice);

  if (price <= low * (1 + LOW_ZONE / 100)) {
    return ["buy", "● ПОКУПАТЬ"];
  }
  if (price >= high * (1 - HIGH_ZONE / 100)) {
    return ["sell", "● ПРОДАВАТЬ"];
  }
  return ["wait", "● ОЖИДАНИЕ"];
}

// Запрос данных из Binance API
async function load() {
  const refreshBtn = document.getElementById("refreshBtn");
  refreshBtn.classList.add("spinning");

  try {
    const symbols = encodeURIComponent(JSON.stringify(COINS));
    const response = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbols=" + symbols);
    const data = await response.json();
    render(Array.isArray(data) ? data : []);
  } catch (e) {
    document.getElementById("updated").textContent = "Ошибка сети Binance...";
  } finally {
    setTimeout(() => refreshBtn.classList.remove("spinning"), 500);
  }
}

// Отрисовка карточек
function render(items) {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  const map = {};
  items.forEach(i => map[i.symbol] = i);

  COINS.forEach(sym => {
    const s = map[sym];
    if (!s) return;

    const name = sym.replace("USDT", "");
    const price = parseFloat(s.lastPrice);
    const low = parseFloat(s.lowPrice);
    const high = parseFloat(s.highPrice);
    const chg = parseFloat(s.priceChangePercent);
    const [cls, text] = verdict(s);

    // Расчет процента позиции цены между 24h Low и High
    let rangePct = ((price - low) / (high - low)) * 100;
    rangePct = Math.max(0, Math.min(100, rangePct));

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-top">
        <span class="coin-symbol">${name}</span>
        <span class="coin-pair">/USDT</span>
      </div>
      <div class="price">${fmt(price)}</div>
      <div class="change ${chg >= 0 ? "up" : "down"}">
        ${chg >= 0 ? "+ " : ""}${chg.toFixed(2)}%
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

    // Тактильный виброотклик Telegram при клике
    card.onclick = () => {
      if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred("light");
      }
    };

    grid.appendChild(card);
  });

  const now = new Date();
  document.getElementById("updated").textContent =
    "Обновлено " + now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Клик по кнопке обновления
document.getElementById("refreshBtn").onclick = () => {
  if (tg?.HapticFeedback) {
    tg.HapticFeedback.impactOccurred("medium");
  }
  load();
};

// Старт и автообновление каждые 10 секунд
load();
setInterval(load, REFRESH_MS);