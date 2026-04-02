const API_BASE = "/api/market";
const EXTRA_PARAMS = "IfYouBought";
const DAY_SECONDS = 86400;
const LIVE_TICKERS = ["BTC", "ETH", "SOL"];

const COINS = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    note: "Digital reserve asset",
    launch: "2010-07-17",
    colors: ["#f5b33a", "#ff7a00"],
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    note: "Smart contract layer",
    launch: "2015-08-07",
    colors: ["#b388ff", "#51d2ff"],
  },
  {
    symbol: "SOL",
    name: "Solana",
    note: "High-speed ecosystem",
    launch: "2020-04-10",
    colors: ["#27f2ac", "#7c3aed"],
  },
  {
    symbol: "BNB",
    name: "BNB",
    note: "Exchange network token",
    launch: "2017-07-25",
    colors: ["#f3ba2f", "#f8e08b"],
  },
  {
    symbol: "XRP",
    name: "XRP",
    note: "Cross-border payments",
    launch: "2013-08-04",
    colors: ["#ebf0ff", "#6b7280"],
  },
  {
    symbol: "ADA",
    name: "Cardano",
    note: "Research-led chain",
    launch: "2017-10-01",
    colors: ["#51d2ff", "#0f5af6"],
  },
  {
    symbol: "DOGE",
    name: "Dogecoin",
    note: "Meme coin icon",
    launch: "2013-12-15",
    colors: ["#c2a633", "#f5d56b"],
  },
  {
    symbol: "AVAX",
    name: "Avalanche",
    note: "Subnets and DeFi",
    launch: "2020-09-23",
    colors: ["#ff5b7f", "#e84142"],
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    note: "Oracle network",
    launch: "2017-09-20",
    colors: ["#51d2ff", "#295ada"],
  },
  {
    symbol: "DOT",
    name: "Polkadot",
    note: "Multi-chain protocol",
    launch: "2020-08-20",
    colors: ["#ff5c93", "#d22664"],
  },
  {
    symbol: "SUI",
    name: "Sui",
    note: "Consumer-speed L1",
    launch: "2023-05-03",
    colors: ["#8de7ff", "#2aa9ff"],
  },
  {
    symbol: "PEPE",
    name: "Pepe",
    note: "Viral meme beta",
    launch: "2023-04-17",
    colors: ["#84cc16", "#22c55e"],
  },
];

const PRESETS = [
  {
    title: "$1,000 into Bitcoin in 2013",
    copy: "The classic crypto ghost story. One early BTC entry and the number usually stops the scroll.",
    coin: "BTC",
    amount: 1000,
    buyDate: "2013-07-06",
    sellMode: "today",
    glow: "rgba(245, 179, 58, 0.28)",
  },
  {
    title: "$1,000 into Ethereum in 2016",
    copy: "Before DeFi, before NFTs, before the world priced in what Ethereum could become.",
    coin: "ETH",
    amount: 1000,
    buyDate: "2016-01-08",
    sellMode: "today",
    glow: "rgba(179, 136, 255, 0.24)",
  },
  {
    title: "$1,000 into Solana near launch",
    copy: "One early conviction trade before the breakout move that rewired the entire narrative.",
    coin: "SOL",
    amount: 1000,
    buyDate: "2020-05-15",
    sellMode: "ath",
    glow: "rgba(39, 242, 172, 0.24)",
  },
  {
    title: "$1,000 into Dogecoin before 2021",
    copy: "The trade that turned irony into real money and screenshot culture into a market force.",
    coin: "DOGE",
    amount: 1000,
    buyDate: "2020-01-01",
    sellMode: "ath",
    glow: "rgba(194, 166, 51, 0.26)",
  },
  {
    title: "$5,000 into BNB before the run",
    copy: "A utility token entry that quietly became one of crypto's most painful hindsight charts.",
    coin: "BNB",
    amount: 5000,
    buyDate: "2018-01-10",
    sellMode: "today",
    glow: "rgba(243, 186, 47, 0.24)",
  },
  {
    title: "$1,000 into XRP before 2017 mania",
    copy: "A fast move, a perfect peak, and one of the most replayed exits in crypto history.",
    coin: "XRP",
    amount: 1000,
    buyDate: "2017-01-01",
    sellMode: "ath",
    glow: "rgba(235, 240, 255, 0.22)",
  },
  {
    title: "$1,000 into Avalanche in 2020",
    copy: "A sharp early entry into one of the more violent momentum phases of the last cycle.",
    coin: "AVAX",
    amount: 1000,
    buyDate: "2020-10-01",
    sellMode: "ath",
    glow: "rgba(255, 91, 127, 0.24)",
  },
  {
    title: "$1,000 into Chainlink in 2017",
    copy: "Before oracle infrastructure became mandatory and LINK became a conviction hold.",
    coin: "LINK",
    amount: 1000,
    buyDate: "2017-11-01",
    sellMode: "today",
    glow: "rgba(81, 210, 255, 0.24)",
  },
];

const dom = {};
const historyCache = new Map();
const liveCache = new Map();

const state = {
  selectedCoin: COINS[0],
  latestResult: null,
  shareText: "",
  shareUrl: "",
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheDom();
  initReveals();
  renderCoinOptions();
  renderPresets();
  bindEvents();
  seedDefaults();
  syncSelectedCoinUI();
  updateSellModeUI();
  setResultView("empty");
  hydrateSharedScenario();
  refreshLiveTicker();
  window.setInterval(refreshLiveTicker, 90000);
}

function cacheDom() {
  dom.form = document.querySelector("#calculatorForm");
  dom.amountInput = document.querySelector("#amountInput");
  dom.buyDateInput = document.querySelector("#buyDateInput");
  dom.sellDateInput = document.querySelector("#sellDateInput");
  dom.customDateGroup = document.querySelector("#customDateGroup");
  dom.calculateButton = document.querySelector("#calculateButton");
  dom.formError = document.querySelector("#formError");
  dom.quickPills = Array.from(document.querySelectorAll(".pill-button"));
  dom.modePills = Array.from(document.querySelectorAll(".mode-pill"));
  dom.coinTrigger = document.querySelector("#coinTrigger");
  dom.coinPanel = document.querySelector("#coinPanel");
  dom.coinSearch = document.querySelector("#coinSearch");
  dom.coinOptionList = document.querySelector("#coinOptionList");
  dom.selectedCoinName = document.querySelector("#selectedCoinName");
  dom.selectedCoinSymbol = document.querySelector("#selectedCoinSymbol");
  dom.selectedCoinOrb = document.querySelector("#selectedCoinOrb");
  dom.tickerItems = document.querySelector("#tickerItems");
  dom.liveDataBadge = document.querySelector("#liveDataBadge span:last-child");
  dom.resultCard = document.querySelector("#resultCard");
  dom.resultEmpty = document.querySelector("#resultEmpty");
  dom.resultLoading = document.querySelector("#resultLoading");
  dom.resultContent = document.querySelector("#resultContent");
  dom.resultLabel = document.querySelector("#resultLabel");
  dom.sentimentBadge = document.querySelector("#sentimentBadge");
  dom.holdingBadge = document.querySelector("#holdingBadge");
  dom.resultHeadline = document.querySelector("#resultHeadline");
  dom.resultValue = document.querySelector("#resultValue");
  dom.resultStory = document.querySelector("#resultStory");
  dom.statProfit = document.querySelector("#statProfit");
  dom.statRoi = document.querySelector("#statRoi");
  dom.statMultiplier = document.querySelector("#statMultiplier");
  dom.statCoins = document.querySelector("#statCoins");
  dom.statBuyPrice = document.querySelector("#statBuyPrice");
  dom.statSellPrice = document.querySelector("#statSellPrice");
  dom.chartTitle = document.querySelector("#chartTitle");
  dom.chartStartLabel = document.querySelector("#chartStartLabel");
  dom.chartEndLabel = document.querySelector("#chartEndLabel");
  dom.chartCanvas = document.querySelector("#chartCanvas");
  dom.sharePreview = document.querySelector("#sharePreview");
  dom.shareFeedback = document.querySelector("#shareFeedback");
  dom.shareXButton = document.querySelector("#shareXButton");
  dom.copyTextButton = document.querySelector("#copyTextButton");
  dom.copyLinkButton = document.querySelector("#copyLinkButton");
  dom.downloadImageButton = document.querySelector("#downloadImageButton");
  dom.presetGrid = document.querySelector("#presetGrid");
}

function initReveals() {
  const reveals = document.querySelectorAll("[data-reveal]");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  reveals.forEach((item) => observer.observe(item));
}

function bindEvents() {
  dom.form.addEventListener("submit", handleSubmit);

  dom.quickPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      dom.amountInput.value = pill.dataset.amount;
      setAmountPillState(dom.amountInput.value);
      clearMessage();
    });
  });

  dom.amountInput.addEventListener("input", () => {
    setAmountPillState(dom.amountInput.value);
    clearMessage();
  });

  dom.buyDateInput.addEventListener("input", clearMessage);
  dom.sellDateInput.addEventListener("input", clearMessage);

  dom.modePills.forEach((pill) => {
    const input = pill.querySelector("input");
    input.addEventListener("change", () => {
      updateSellModeUI();
      clearMessage();
    });
  });

  dom.coinTrigger.addEventListener("click", toggleCoinPanel);
  dom.coinSearch.addEventListener("input", () => renderCoinOptions(dom.coinSearch.value));

  dom.coinOptionList.addEventListener("click", (event) => {
    const option = event.target.closest("[data-coin-symbol]");
    if (!option) return;
    setSelectedCoin(option.dataset.coinSymbol);
    closeCoinPanel();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#coinPicker")) {
      closeCoinPanel();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCoinPanel();
    }
  });

  dom.presetGrid.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-preset-index]");
    if (!trigger) return;

    const preset = PRESETS[Number(trigger.dataset.presetIndex)];
    if (!preset) return;

    applyPreset(preset);
    document.querySelector(".hero").scrollIntoView({ behavior: "smooth", block: "start" });
    await runCalculation();
  });

  dom.shareXButton.addEventListener("click", shareToX);
  dom.copyTextButton.addEventListener("click", () => copyShare("text"));
  dom.copyLinkButton.addEventListener("click", () => copyShare("link"));
  dom.downloadImageButton.addEventListener("click", downloadShareCard);
}

function seedDefaults() {
  const today = getTodayIso();
  dom.buyDateInput.max = today;
  dom.sellDateInput.max = today;
  dom.amountInput.value = "1000";
  dom.buyDateInput.value = "2016-01-01";
  dom.sellDateInput.value = today;
  setAmountPillState(dom.amountInput.value);
}

function renderCoinOptions(filter = "") {
  const query = filter.trim().toLowerCase();
  const filteredCoins = COINS.filter((coin) =>
    `${coin.name} ${coin.symbol} ${coin.note}`.toLowerCase().includes(query)
  );

  if (!filteredCoins.length) {
    dom.coinOptionList.innerHTML =
      '<div class="coin-option-note" style="padding: 18px;">No coins match that search.</div>';
    return;
  }

  dom.coinOptionList.innerHTML = filteredCoins
    .map((coin) => {
      const isSelected = coin.symbol === state.selectedCoin.symbol;
      return `
        <button
          type="button"
          class="coin-option"
          data-coin-symbol="${coin.symbol}"
          role="option"
          aria-selected="${isSelected}"
        >
          <span class="coin-option-main">
            <span class="coin-orb" style="${buildOrbStyle(coin)}">${coin.symbol.slice(0, 2)}</span>
            <span class="coin-option-copy">
              <span class="coin-option-name">${coin.name}</span>
              <span class="coin-option-meta">${coin.symbol}</span>
            </span>
          </span>
          <span class="coin-option-note">${coin.note}</span>
        </button>
      `;
    })
    .join("");
}

function renderPresets() {
  dom.presetGrid.innerHTML = PRESETS.map(
    (preset, index) => `
      <button
        type="button"
        class="preset-button"
        data-preset-index="${index}"
        style="--preset-glow:${preset.glow}"
      >
        <span class="preset-kicker">${getCoinBySymbol(preset.coin).name}</span>
        <span class="preset-title">${preset.title}</span>
        <span class="preset-copy">${preset.copy}</span>
        <span class="preset-meta">
          <span>${formatCompactCurrency(preset.amount)}</span>
          <span>${formatLongDate(preset.buyDate, { month: "short", day: "numeric", year: "numeric" })}</span>
          <span>${preset.sellMode === "ath" ? "ATH exit" : "Hold to today"}</span>
        </span>
      </button>
    `
  ).join("");
}

function toggleCoinPanel() {
  const isOpen = dom.coinTrigger.getAttribute("aria-expanded") === "true";
  if (isOpen) {
    closeCoinPanel();
    return;
  }

  dom.coinPanel.hidden = false;
  dom.coinTrigger.setAttribute("aria-expanded", "true");
  dom.coinSearch.focus();
  dom.coinSearch.select();
}

function closeCoinPanel() {
  dom.coinTrigger.setAttribute("aria-expanded", "false");
  dom.coinPanel.hidden = true;
}

function setSelectedCoin(symbol) {
  const coin = getCoinBySymbol(symbol);
  if (!coin) return;

  state.selectedCoin = coin;
  syncSelectedCoinUI();

  if (dom.buyDateInput.value && dom.buyDateInput.value < coin.launch) {
    dom.buyDateInput.value = coin.launch;
  }

  if (dom.sellDateInput.value && dom.sellDateInput.value < coin.launch) {
    dom.sellDateInput.value = coin.launch;
  }

  clearMessage();
  renderCoinOptions(dom.coinSearch.value);
}

function syncSelectedCoinUI() {
  dom.selectedCoinName.textContent = state.selectedCoin.name;
  dom.selectedCoinSymbol.textContent = state.selectedCoin.symbol;
  dom.selectedCoinOrb.textContent = state.selectedCoin.symbol.slice(0, 2);
  dom.selectedCoinOrb.style.cssText = buildOrbStyle(state.selectedCoin);
  dom.buyDateInput.min = state.selectedCoin.launch;
  dom.sellDateInput.min = state.selectedCoin.launch;
}

function updateSellModeUI() {
  const mode = getSellMode();
  dom.modePills.forEach((pill) => {
    const input = pill.querySelector("input");
    pill.classList.toggle("active", input.checked);
  });

  const isCustom = mode === "custom";
  dom.customDateGroup.classList.toggle("hidden", !isCustom);
  dom.sellDateInput.required = isCustom;
}

function setAmountPillState(amountValue) {
  dom.quickPills.forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.amount === String(Math.round(Number(amountValue))));
  });
}

function applyPreset(preset) {
  setSelectedCoin(preset.coin);
  dom.amountInput.value = String(preset.amount);
  dom.buyDateInput.value = preset.buyDate;
  dom.sellDateInput.value = getTodayIso();
  dom.modePills.forEach((pill) => {
    const input = pill.querySelector("input");
    input.checked = input.value === preset.sellMode;
  });
  updateSellModeUI();
  setAmountPillState(preset.amount);
}

function hydrateSharedScenario() {
  const params = new URLSearchParams(window.location.search);
  const sharedCoin = params.get("coin");
  const sharedAmount = params.get("amount");
  const sharedBuyDate = params.get("buy");
  const sharedMode = params.get("mode");
  const sharedSellDate = params.get("sell");

  if (!sharedCoin || !sharedAmount || !sharedBuyDate) {
    return;
  }

  if (getCoinBySymbol(sharedCoin)) {
    setSelectedCoin(sharedCoin);
  }

  if (sharedAmount) {
    dom.amountInput.value = sharedAmount;
    setAmountPillState(sharedAmount);
  }

  if (sharedBuyDate) {
    dom.buyDateInput.value = sharedBuyDate;
  }

  if (sharedMode && ["today", "ath", "custom"].includes(sharedMode)) {
    dom.modePills.forEach((pill) => {
      const input = pill.querySelector("input");
      input.checked = input.value === sharedMode;
    });
    updateSellModeUI();
  }

  if (sharedSellDate) {
    dom.sellDateInput.value = sharedSellDate;
  }

  runCalculation();
}

async function handleSubmit(event) {
  event.preventDefault();
  await runCalculation();
}

async function runCalculation() {
  clearMessage();

  let scenario;

  try {
    scenario = readScenario();
  } catch (error) {
    showError(error.message);
    return;
  }

  setLoading(true);

  try {
    const result = await calculateScenario(scenario);
    state.latestResult = result;
    renderResult(result);
    updateShareState(result);
    setResultView("content");
  } catch (error) {
    showError(humanizeError(error));
    setResultView(state.latestResult ? "content" : "empty");
  } finally {
    setLoading(false);
  }
}

function readScenario() {
  const amount = Number(dom.amountInput.value);
  const buyDate = dom.buyDateInput.value;
  const sellMode = getSellMode();
  const sellDate = dom.sellDateInput.value;

  if (!state.selectedCoin) {
    throw new Error("Choose a coin first.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid USD amount.");
  }

  if (!buyDate) {
    throw new Error("Choose a buy date.");
  }

  if (sellMode === "custom" && !sellDate) {
    throw new Error("Choose a custom sell date.");
  }

  return {
    coin: state.selectedCoin,
    amount,
    buyDate,
    sellMode,
    sellDate,
  };
}

async function calculateScenario({ coin, amount, buyDate, sellMode, sellDate }) {
  const history = await getHistory(coin);
  const firstPoint = history[0];
  const todayIso = getTodayIso();
  const todayStart = isoToUtcDay(todayIso);
  const buyTime = isoToUtcDay(buyDate);

  if (buyTime > todayStart) {
    throw new Error("Buy date cannot be in the future.");
  }

  if (buyTime < firstPoint.time) {
    throw new Error(`${coin.name} price data starts on ${formatLongDate(firstPoint.date)}.`);
  }

  const buyPoint = getPointOnOrAfter(history, buyTime);
  if (!buyPoint) {
    throw new Error(`No buy price was found for ${coin.name} on ${formatLongDate(buyDate)}.`);
  }

  let exitPrice = 0;
  let exitTimestamp = 0;
  let exitDateText = "";
  let exitDescriptor = "";
  let resultLabel = "";
  let chartTitle = "";
  let livePrice = null;

  if (sellMode === "today") {
    livePrice = await getLivePrice(coin.symbol);
    exitPrice = livePrice;
    exitTimestamp = Math.floor(Date.now() / 1000);
    exitDateText = "Today";
    exitDescriptor = "held to today";
    resultLabel = "If you held";
    chartTitle = "How the position would look right now";
  }

  if (sellMode === "custom") {
    const customTime = isoToUtcDay(sellDate);
    if (customTime > todayStart) {
      throw new Error("Custom sell date cannot be in the future.");
    }
    if (customTime < buyPoint.time) {
      throw new Error("Custom sell date has to be on or after the buy date.");
    }

    if (sellDate === todayIso) {
      livePrice = await getLivePrice(coin.symbol);
      exitPrice = livePrice;
      exitTimestamp = Math.floor(Date.now() / 1000);
    } else {
      const sellPoint = getPointOnOrBefore(history, customTime);
      if (!sellPoint) {
        throw new Error(`No sell price was found for ${formatLongDate(sellDate)}.`);
      }
      exitPrice = sellPoint.close;
      exitTimestamp = sellPoint.time;
    }

    exitDateText = formatLongDate(sellDate);
    exitDescriptor = `sold on ${formatLongDate(sellDate)}`;
    resultLabel = "If you sold";
    chartTitle = "How the trade would have finished";
  }

  if (sellMode === "ath") {
    const athPoint = history
      .filter((point) => point.time > buyPoint.time)
      .reduce((currentBest, point) => {
        if (!currentBest || point.high > currentBest.high) {
          return point;
        }
        return currentBest;
      }, null);

    if (!athPoint) {
      throw new Error("ATH mode needs at least one full trading day after the buy date.");
    }

    exitPrice = athPoint.high;
    exitTimestamp = athPoint.time;
    exitDateText = formatLongDate(athPoint.date);
    exitDescriptor = `sold into the highest daily high after entry on ${exitDateText}`;
    resultLabel = "If you sold at ATH";
    chartTitle = "The cleanest exit after your entry";
  }

  const coinsAcquired = amount / buyPoint.close;
  const exitValue = coinsAcquired * exitPrice;
  const profit = exitValue - amount;
  const roi = (profit / amount) * 100;
  const multiplier = exitValue / amount;
  const holdDays = Math.max(1, Math.round((exitTimestamp - buyPoint.time) / DAY_SECONDS));
  const tone = profit >= 0 ? "positive" : "negative";
  const sentiment = getSentimentLabel(multiplier, roi, profit);
  const series = buildPortfolioSeries({
    history,
    buyTime: buyPoint.time,
    exitTimestamp,
    coinsAcquired,
    exitValue,
    exitPrice,
    sellMode,
    livePrice,
  });

  return {
    coin,
    amount,
    buyDate,
    sellMode,
    sellDate,
    buyPrice: buyPoint.close,
    buyTimestamp: buyPoint.time,
    exitPrice,
    exitTimestamp,
    exitValue,
    exitDateText,
    exitDescriptor,
    resultLabel,
    chartTitle,
    coinsAcquired,
    profit,
    roi,
    multiplier,
    holdDays,
    tone,
    sentiment,
    series,
  };
}

function buildPortfolioSeries({
  history,
  buyTime,
  exitTimestamp,
  coinsAcquired,
  exitValue,
  exitPrice,
  sellMode,
  livePrice,
}) {
  const endBoundary = floorToUtcDay(exitTimestamp);
  const series = history
    .filter((point) => point.time >= buyTime && point.time <= endBoundary)
    .map((point) => ({
      time: point.time,
      value: point.close * coinsAcquired,
    }));

  if (!series.length) {
    return [{ time: buyTime, value: exitValue }];
  }

  if (sellMode === "ath") {
    const lastPoint = series[series.length - 1];
    const lastValue = lastPoint ? lastPoint.value : 0;
    if (Math.abs(lastValue - exitValue) > exitValue * 0.002) {
      series.push({
        time: exitTimestamp + 1,
        value: exitValue,
      });
    }
  }

  if (sellMode === "today" || (sellMode === "custom" && livePrice)) {
    series.push({
      time: Math.max(exitTimestamp, series[series.length - 1].time + 1),
      value: exitPrice * coinsAcquired,
    });
  }

  if (series.length === 1) {
    series.push({
      time: series[0].time + DAY_SECONDS,
      value: series[0].value,
    });
  }

  return downsampleSeries(series, 72);
}

function renderResult(result) {
  dom.resultCard.dataset.tone = result.tone;
  dom.resultLabel.textContent = result.resultLabel;
  dom.sentimentBadge.textContent = result.sentiment;
  dom.holdingBadge.textContent = `Held ${formatHoldDuration(result.holdDays)}`;
  dom.resultHeadline.textContent = buildHeadline(result);
  dom.resultStory.textContent = buildStory(result);
  dom.chartTitle.textContent = result.chartTitle;
  dom.chartStartLabel.textContent = formatCompactCurrency(result.amount);
  dom.chartEndLabel.textContent = formatCompactCurrency(result.exitValue);

  animateValue(dom.resultValue, result.exitValue, formatCurrencyPrecise);
  animateValue(dom.statProfit, result.profit, formatSignedCurrency);
  animateValue(dom.statRoi, result.roi, formatPercent);
  animateValue(dom.statMultiplier, result.multiplier, formatMultiplier);

  dom.statProfit.classList.toggle("positive", result.profit >= 0);
  dom.statProfit.classList.toggle("negative", result.profit < 0);
  dom.statRoi.classList.toggle("positive", result.roi >= 0);
  dom.statRoi.classList.toggle("negative", result.roi < 0);
  dom.statMultiplier.classList.toggle("positive", result.multiplier >= 1);
  dom.statMultiplier.classList.toggle("negative", result.multiplier < 1);

  dom.statCoins.textContent = formatCoinAmount(result.coinsAcquired);
  dom.statBuyPrice.textContent = formatCurrencyPrecise(result.buyPrice);
  dom.statSellPrice.textContent = formatCurrencyPrecise(result.exitPrice);

  renderChart(result.series, result);
}

function renderChart(series, result) {
  const width = 760;
  const height = 280;
  const padding = { top: 20, right: 20, bottom: 28, left: 20 };
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(max, 1);
  const usableWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;
  const denominator = Math.max(1, series.length - 1);

  const points = series.map((point, index) => {
    const x = padding.left + (index / denominator) * usableWidth;
    const y = height - padding.bottom - ((point.value - min) / range) * usableHeight;
    return { x, y, value: point.value, time: point.time };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${(
    height - padding.bottom
  ).toFixed(2)} L ${points[0].x.toFixed(2)} ${(height - padding.bottom).toFixed(2)} Z`;
  const gradientTail = result.tone === "negative" ? ["#ff668a", "#f5b33a"] : ["#27f2ac", "#51d2ff"];
  const gridLines = [0, 1, 2, 3]
    .map((step) => {
      const y = padding.top + (step / 3) * usableHeight;
      return `<line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" />`;
    })
    .join("");

  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  dom.chartCanvas.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Portfolio chart">
      <defs>
        <linearGradient id="portfolioStroke" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${gradientTail[0]}" />
          <stop offset="100%" stop-color="${gradientTail[1]}" />
        </linearGradient>
        <linearGradient id="portfolioArea" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${gradientTail[1]}" stop-opacity="0.28" />
          <stop offset="100%" stop-color="${gradientTail[1]}" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLines}
      <path class="chart-area" d="${areaPath}"></path>
      <path class="chart-line" d="${linePath}"></path>
      <circle class="chart-marker" cx="${lastPoint.x}" cy="${lastPoint.y}" r="14"></circle>
      <circle class="chart-marker-inner" cx="${lastPoint.x}" cy="${lastPoint.y}" r="5"></circle>
      <text class="chart-caption" x="${padding.left}" y="${padding.top - 2}">${formatCompactCurrency(max)}</text>
      <text class="chart-caption" x="${padding.left}" y="${height - padding.bottom - 10}">${formatCompactCurrency(min)}</text>
      <text class="chart-caption" x="${Math.max(padding.left, firstPoint.x - 8)}" y="${height - 4}">${formatChartDate(result.buyDate)}</text>
      <text class="chart-caption chart-caption-strong" x="${Math.max(padding.left, lastPoint.x - 48)}" y="${height - 4}">${result.exitDateText}</text>
    </svg>
  `;

  const line = dom.chartCanvas.querySelector(".chart-line");
  if (line && !prefersReducedMotion()) {
    const lineLength = line.getTotalLength();
    line.style.strokeDasharray = `${lineLength}`;
    line.style.strokeDashoffset = `${lineLength}`;
    requestAnimationFrame(() => {
      line.style.transition = "stroke-dashoffset 1.05s cubic-bezier(0.22, 1, 0.36, 1)";
      line.style.strokeDashoffset = "0";
    });
  }
}

function updateShareState(result) {
  state.shareText = buildShareText(result);
  state.shareUrl = buildShareUrl(result);
  dom.sharePreview.textContent = state.shareText;
}

function buildShareText(result) {
  const exitLine =
    result.sellMode === "ath"
      ? `sold at the post-entry ATH`
      : result.sellMode === "today"
        ? `held until today`
        : `sold on ${formatLongDate(result.sellDate)}`;

  return `${formatCompactCurrency(result.amount)} into ${result.coin.name} on ${formatLongDate(
    result.buyDate
  )}, ${exitLine}, could have become ${formatCompactCurrency(result.exitValue)} on IfYouBought.`;
}

function buildShareUrl(result) {
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  params.set("coin", result.coin.symbol);
  params.set("amount", String(result.amount));
  params.set("buy", result.buyDate);
  params.set("mode", result.sellMode);
  if (result.sellMode === "custom" && result.sellDate) {
    params.set("sell", result.sellDate);
  }
  url.search = params.toString();
  return url.toString();
}

async function shareToX() {
  if (!state.latestResult) {
    flashShareFeedback("Run a scenario before you share it.");
    return;
  }

  const text = `${state.shareText} ${state.shareUrl}`;
  const shareTarget = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(shareTarget, "_blank", "noopener,noreferrer");
}

async function copyShare(type) {
  if (!state.latestResult) {
    flashShareFeedback("Run a scenario before you copy it.");
    return;
  }

  const payload = type === "link" ? state.shareUrl : state.shareText;

  try {
    await navigator.clipboard.writeText(payload);
    flashShareFeedback(type === "link" ? "Share link copied." : "Share text copied.");
  } catch (error) {
    flashShareFeedback("Clipboard access is blocked in this browser.");
  }
}

async function downloadShareCard() {
  if (!state.latestResult) {
    flashShareFeedback("Run a scenario before you export the card.");
    return;
  }

  flashShareFeedback("Rendering share card...");

  try {
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(dom.resultCard, {
      backgroundColor: "#04070f",
      scale: 2,
      useCORS: true,
    });
    const link = document.createElement("a");
    link.download = `ifyoubought-${state.latestResult.coin.symbol.toLowerCase()}-${state.latestResult.sellMode}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    flashShareFeedback("Share card downloaded.");
  } catch (error) {
    flashShareFeedback("Image export failed. Try again in a moment.");
  }
}

async function loadHtml2Canvas() {
  if (window.html2canvas) {
    return window.html2canvas;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => reject(new Error("Unable to load html2canvas."));
    document.head.append(script);
  });
}

async function refreshLiveTicker() {
  const url = `${API_BASE}/pricemulti?fsyms=${LIVE_TICKERS.join(",")}&tsyms=USD&extraParams=${encodeURIComponent(
    EXTRA_PARAMS
  )}`;

  try {
    const payload = await fetchJson(url);
    dom.tickerItems.innerHTML = LIVE_TICKERS.map((symbol) => {
      const coin = getCoinBySymbol(symbol);
      const price = Number(payload[symbol]?.USD || 0);
      return `
        <div class="ticker-item">
          <strong>${coin.name} <span style="color: rgba(232, 237, 245, 0.48); font-size: 0.82rem;">${coin.symbol}</span></strong>
          <span>${price ? formatCurrencyPrecise(price) : "Unavailable"}</span>
        </div>
      `;
    }).join("");
    dom.liveDataBadge.textContent = `Powered by live market data | Updated ${formatClock(new Date())}`;
  } catch (error) {
    dom.tickerItems.innerHTML =
      '<span class="coin-option-note" style="padding: 4px 2px;">Live tape unavailable right now.</span>';
    dom.liveDataBadge.textContent = "Powered by live market data";
  }
}

async function getHistory(coin) {
  if (historyCache.has(coin.symbol)) {
    return historyCache.get(coin.symbol);
  }

  const url = `${API_BASE}/v2/histoday?fsym=${encodeURIComponent(
    coin.symbol
  )}&tsym=USD&allData=true&extraParams=${encodeURIComponent(EXTRA_PARAMS)}`;
  const payload = await fetchJson(url);
  const history = (payload.Data?.Data || [])
    .filter((point) => Number(point.close) > 0 || Number(point.high) > 0)
    .map((point) => ({
      time: Number(point.time),
      open: Number(point.open),
      high: Number(point.high),
      low: Number(point.low),
      close: Number(point.close),
      date: new Date(Number(point.time) * 1000).toISOString().slice(0, 10),
    }));

  if (!history.length) {
    throw new Error(`No historical data was returned for ${coin.name}.`);
  }

  historyCache.set(coin.symbol, history);
  return history;
}

async function getLivePrice(symbol) {
  const cached = liveCache.get(symbol);
  if (cached && Date.now() - cached.updatedAt < 60000) {
    return cached.price;
  }

  const url = `${API_BASE}/price?fsym=${encodeURIComponent(symbol)}&tsyms=USD&extraParams=${encodeURIComponent(
    EXTRA_PARAMS
  )}`;
  const payload = await fetchJson(url);
  const price = Number(payload.USD);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`No live price was returned for ${symbol}.`);
  }

  liveCache.set(symbol, {
    price,
    updatedAt: Date.now(),
  });

  return price;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Rate limit");
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (payload.Response && payload.Response !== "Success") {
    throw new Error(payload.Message || "Live market data failed.");
  }

  return payload;
}

function setLoading(isLoading) {
  dom.calculateButton.disabled = isLoading;
  dom.calculateButton.querySelector(".button-copy").textContent = isLoading
    ? "Pulling market data..."
    : "Reveal the outcome";
  if (isLoading) {
    setResultView("loading");
  }
}

function setResultView(view) {
  dom.resultLoading.hidden = view !== "loading";
  dom.resultEmpty.hidden = view !== "empty";
  dom.resultContent.hidden = view !== "content";
}

function showError(message) {
  dom.formError.hidden = false;
  dom.formError.textContent = message;
}

function clearMessage() {
  dom.formError.hidden = true;
  dom.formError.textContent = "";
}

function flashShareFeedback(message) {
  dom.shareFeedback.textContent = message;
  window.clearTimeout(flashShareFeedback.timer);
  flashShareFeedback.timer = window.setTimeout(() => {
    dom.shareFeedback.textContent = "";
  }, 2200);
}

function animateValue(element, targetValue, formatter) {
  const safeTarget = Number(targetValue);
  if (!Number.isFinite(safeTarget)) {
    element.textContent = formatter(0);
    element.dataset.value = "0";
    return;
  }

  if (prefersReducedMotion()) {
    element.textContent = formatter(safeTarget);
    element.dataset.value = String(safeTarget);
    return;
  }

  const startValue = Number(element.dataset.value || 0);
  const delta = safeTarget - startValue;
  const start = performance.now();
  const duration = 1050;

  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 4);
    const current = startValue + delta * eased;
    element.textContent = formatter(current);
    if (progress < 1) {
      requestAnimationFrame(step);
      return;
    }
    element.dataset.value = String(safeTarget);
    element.textContent = formatter(safeTarget);
  };

  requestAnimationFrame(step);
}

function buildHeadline(result) {
  const amount = formatCompactCurrency(result.amount);

  if (result.sellMode === "ath") {
    return result.profit >= 0
      ? `Your ${amount} could have peaked at...`
      : `Even the clean exit only reached...`;
  }

  if (result.sellMode === "custom") {
    return result.profit >= 0
      ? `Your ${amount} could have turned into...`
      : `That exit would have left you with...`;
  }

  return result.profit >= 0 ? `Your ${amount} could be worth...` : `That position would be worth...`;
}

function buildStory(result) {
  const intro = `${formatCompactCurrency(result.amount)} into ${result.coin.name} on ${formatLongDate(
    result.buyDate
  )} would have bought ${formatCoinAmount(result.coinsAcquired)} ${result.coin.symbol}.`;

  if (result.profit >= 0) {
    return `${intro} ${capitalize(result.exitDescriptor)} turns that into ${formatCompactCurrency(
      result.exitValue
    )}, printing ${formatPercent(result.roi)} and a ${formatMultiplier(result.multiplier)} return.`;
  }

  return `${intro} ${capitalize(result.exitDescriptor)} leaves the position at ${formatCompactCurrency(
    result.exitValue
  )}, down ${formatCompactCurrency(Math.abs(result.profit))}.`;
}

function getSentimentLabel(multiplier, roi, profit) {
  if (profit < 0 && roi <= -60) return "Painful timing";
  if (profit < 0) return "Underwater";
  if (multiplier >= 100) return "Legendary entry";
  if (multiplier >= 25) return "Elite conviction";
  if (multiplier >= 8) return "Serious move";
  if (multiplier >= 2) return "Strong hold";
  return "Still ahead";
}

function getPointOnOrAfter(history, timestamp) {
  return history.find((point) => point.time >= timestamp);
}

function getPointOnOrBefore(history, timestamp) {
  let match = null;
  history.forEach((point) => {
    if (point.time <= timestamp) {
      match = point;
    }
  });
  return match;
}

function buildOrbStyle(coin) {
  return `background: linear-gradient(135deg, ${coin.colors[0]}, ${coin.colors[1]}); color: #071019;`;
}

function getCoinBySymbol(symbol) {
  return COINS.find((coin) => coin.symbol === symbol);
}

function getSellMode() {
  return document.querySelector('input[name="sellMode"]:checked').value;
}

function downsampleSeries(series, target) {
  if (series.length <= target) {
    return series;
  }

  const sampled = [];
  const stride = (series.length - 1) / (target - 1);

  for (let index = 0; index < target; index += 1) {
    sampled.push(series[Math.round(index * stride)]);
  }

  return sampled;
}

function humanizeError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.toLowerCase().includes("rate limit")) {
    return "The market data provider rate limited the request. Give it a moment and try again.";
  }

  if (message.includes("Failed to fetch")) {
    return "Live market data could not be reached. Check the connection or try again.";
  }

  if (message.startsWith("HTTP")) {
    return "Live market data returned an unexpected response. Try again in a moment.";
  }

  return message;
}

function formatCurrencyPrecise(value) {
  const decimals = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatCompactCurrency(value) {
  if (Math.abs(value) >= 1000000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedCurrency(value) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatCurrencyPrecise(Math.abs(value))}`;
}

function formatPercent(value) {
  const safeValue = Math.abs(value) < 0.0001 ? 0 : value;
  return `${safeValue >= 0 ? "+" : "-"}${Math.abs(safeValue).toLocaleString("en-US", {
    maximumFractionDigits: Math.abs(safeValue) >= 100 ? 0 : 2,
  })}%`;
}

function formatMultiplier(value) {
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: value >= 100 ? 0 : 1,
    maximumFractionDigits: value >= 100 ? 1 : 2,
  })}x`;
}

function formatCoinAmount(value) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: value >= 1000 ? 2 : 6,
  });
}

function formatHoldDuration(days) {
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  const years = (days / 365).toFixed(days >= 3650 ? 0 : 1);
  return `${years} year${years === "1.0" ? "" : "s"}`;
}

function formatLongDate(dateString, options = {}) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: options.month || "long",
    day: options.day || "numeric",
    year: options.year || "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatClock(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatChartDate(dateString) {
  return formatLongDate(dateString, { month: "short", day: "numeric", year: "2-digit" });
}

function isoToUtcDay(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 1000);
}

function floorToUtcDay(timestamp) {
  const date = new Date(timestamp * 1000);
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
