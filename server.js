const http = require("node:http");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");

loadEnvFile(path.join(__dirname, ".env"));

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const CRYPTOCOMPARE_API_BASE = "https://min-api.cryptocompare.com/data";
const CRYPTOCOMPARE_API_KEY = process.env.CRYPTOCOMPARE_API_KEY || "";
const EXTRA_PARAMS = "IfYouBought";

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const CACHE_TTL_MS = {
  "all/coinlist": 2 * 60_000,
  "price": 15_000,
  "pricemulti": 15_000,
  "pricemultifull": 15_000,
  "v2/histoday": 30 * 60_000,
};

const COIN_META = {
  BTC: { name: "Bitcoin", colors: ["#f5b33a", "#ff7a00"] },
  ETH: { name: "Ethereum", colors: ["#b388ff", "#51d2ff"] },
  SOL: { name: "Solana", colors: ["#27f2ac", "#7c3aed"] },
  BNB: { name: "BNB", colors: ["#f3ba2f", "#f8e08b"] },
  XRP: { name: "XRP", colors: ["#ebf0ff", "#6b7280"] },
  ADA: { name: "Cardano", colors: ["#51d2ff", "#0f5af6"] },
  DOGE: { name: "Dogecoin", colors: ["#c2a633", "#f5d56b"] },
  AVAX: { name: "Avalanche", colors: ["#ff5b7f", "#e84142"] },
  LINK: { name: "Chainlink", colors: ["#51d2ff", "#295ada"] },
  DOT: { name: "Polkadot", colors: ["#ff5c93", "#d22664"] },
  SUI: { name: "Sui", colors: ["#8de7ff", "#2aa9ff"] },
  PEPE: { name: "Pepe", colors: ["#84cc16", "#22c55e"] },
};

const cache = new Map();
let indexTemplatePromise = null;

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

      if (process.env.LOG_REQUESTS === "1") {
        console.log(`[route] ${requestUrl.pathname}${requestUrl.search}`);
      }

      if (requestUrl.pathname.startsWith("/api/market/")) {
        await handleMarketProxy(requestUrl, res);
        return;
      }

      if (requestUrl.pathname === "/og/share.svg") {
        await handleOgImage(req, requestUrl, res);
        return;
      }

      await handleStatic(req, requestUrl, res);
    } catch (error) {
      respondJson(res, 500, {
        Response: "Error",
        Message: error instanceof Error ? error.message : "Unexpected server error.",
      });
    }
  });
}

async function handleMarketProxy(requestUrl, res) {
  const upstreamPath = requestUrl.pathname.replace(/^\/api\/market\//, "");
  const allowedPaths = new Set(["all/coinlist", "price", "pricemulti", "pricemultifull", "v2/histoday"]);

  if (!allowedPaths.has(upstreamPath)) {
    respondJson(res, 404, {
      Response: "Error",
      Message: "Unknown market endpoint.",
    });
    return;
  }

  const params = new URLSearchParams(requestUrl.search);
  params.set("extraParams", EXTRA_PARAMS);

  if (CRYPTOCOMPARE_API_KEY && !params.has("api_key")) {
    params.set("api_key", CRYPTOCOMPARE_API_KEY);
  }

  const upstreamUrl = `${CRYPTOCOMPARE_API_BASE}/${upstreamPath}?${params.toString()}`;
  const cacheKey = `${upstreamPath}?${params.toString()}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    respondJson(res, 200, cached.payload, {
      "X-IfYouBought-Cache": "HIT",
    });
    return;
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "IfYouBought/1.0",
    },
  });

  const payload = await upstreamResponse.json().catch(() => ({
    Response: "Error",
    Message: "Failed to parse upstream market data.",
  }));

  if (!upstreamResponse.ok) {
    respondJson(res, upstreamResponse.status, {
      Response: "Error",
      Message: payload.Message || "Market data request failed.",
    });
    return;
  }

  if (payload.Response && payload.Response !== "Success") {
    respondJson(res, 502, {
      Response: "Error",
      Message: payload.Message || "Market data provider returned an error.",
    });
    return;
  }

  cache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + (CACHE_TTL_MS[upstreamPath] || 15_000),
  });

  respondJson(res, 200, payload, {
    "X-IfYouBought-Cache": "MISS",
  });
}

async function handleStatic(req, requestUrl, res) {
  const pathname = requestUrl.pathname;

  if (pathname === "/" || pathname === "/index.html" || pathname === "/share") {
    const html = await renderIndexHtml(req, requestUrl);
    respondHtml(res, html);
    return;
  }

  const normalizedPath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const targetPath = path.join(ROOT, normalizedPath);

  if (!targetPath.startsWith(ROOT)) {
    respondText(res, 403, "Forbidden");
    return;
  }

  try {
    const content = await fsPromises.readFile(targetPath);
    const extension = path.extname(targetPath).toLowerCase();
    const contentType = STATIC_TYPES[extension] || "application/octet-stream";
    const cacheControl = new Set([".html", ".css", ".js"]).has(extension)
      ? "no-cache"
      : "public, max-age=300";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    });
    res.end(content);
  } catch (error) {
    if (!path.extname(pathname)) {
      const html = await renderIndexHtml(req, requestUrl);
      respondHtml(res, html);
      return;
    }

    respondText(res, 404, "Not found");
  }
}

async function handleOgImage(req, requestUrl, res) {
  const preview = getSharePreviewData(requestUrl.searchParams);
  const svg = buildOgImage(preview);

  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  });
  res.end(svg);
}

async function renderIndexHtml(req, requestUrl) {
  const template = await getIndexTemplate();
  const dynamicMeta = buildSeoMeta(req, requestUrl);
  return template.replace(
    /<!-- SEO_META_START -->[\s\S]*?<!-- SEO_META_END -->/,
    `<!-- SEO_META_START -->\n${dynamicMeta}\n    <!-- SEO_META_END -->`
  );
}

function buildSeoMeta(req, requestUrl) {
  const preview = getSharePreviewData(requestUrl.searchParams);
  const baseUrl = getBaseUrl(req);
  const pageUrl = `${baseUrl}${requestUrl.pathname}${requestUrl.search}`;
  const imageUrl = `${baseUrl}/og/share.svg${requestUrl.search}`;

  const title = preview
    ? `IfYouBought | ${formatSocialCurrency(preview.amount)} into ${preview.coinName} -> ${formatHeroCurrency(
        preview.exitValue
      )}`
    : "IfYouBought | Replay the trade you still think about";

  const description = preview
    ? `${formatCurrencyPrecise(preview.amount)} into ${preview.coinName} on ${formatLongDate(
        preview.buyDate
      )} could have become ${formatHeroCurrency(preview.exitValue)} ${describeExitForMeta(preview)}.`
    : "Pick a coin, set the buy date, and see what that crypto bet could be worth today, at ATH, or on a custom exit.";

  return [
    `    <meta name="description" content="${escapeHtml(description)}" />`,
    '    <meta name="theme-color" content="#060912" />',
    '    <meta property="og:type" content="website" />',
    `    <meta property="og:title" content="${escapeHtml(title)}" />`,
    `    <meta property="og:description" content="${escapeHtml(description)}" />`,
    `    <meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    `    <meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    '    <meta name="twitter:card" content="summary_large_image" />',
    `    <meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `    <meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`,
  ].join("\n");
}

function getSharePreviewData(searchParams) {
  const symbol = (searchParams.get("c") || searchParams.get("coin") || "").toUpperCase();
  const amount = Number(searchParams.get("a") || searchParams.get("amount"));
  const buyDate = decodeDateParam(searchParams.get("b") || searchParams.get("buy"));
  const mode = decodeSellMode(searchParams.get("m") || searchParams.get("mode") || "today");
  const sellDate = decodeDateParam(searchParams.get("s") || searchParams.get("sell"));
  const exitDate = decodeDateParam(searchParams.get("x"));
  const exitValue = Number(searchParams.get("v"));
  const roi = Number(searchParams.get("r"));

  if (!symbol || !Number.isFinite(amount) || !buyDate || !Number.isFinite(exitValue)) {
    return null;
  }

  const coinMeta = COIN_META[symbol] || {
    name: symbol,
    colors: ["#f5b33a", "#51d2ff"],
  };

  return {
    symbol,
    coinName: coinMeta.name,
    amount,
    buyDate,
    mode,
    sellDate,
    exitDate,
    exitValue,
    roi: Number.isFinite(roi) ? roi : 0,
    colors: coinMeta.colors,
  };
}

function buildOgImage(preview) {
  const theme = preview || {
    coinName: "IfYouBought",
    symbol: "IYB",
    amount: 1000,
    buyDate: "2016-01-01",
    mode: "today",
    sellDate: "",
    exitDate: "",
    exitValue: 53100000,
    roi: 530566,
    colors: ["#f5b33a", "#51d2ff"],
  };

  const profit = theme.exitValue - theme.amount;
  const multiplier = theme.amount > 0 ? theme.exitValue / theme.amount : 0;
  const visual = getShareVisualState(theme, profit, multiplier);
  const accentA = visual.accentA;
  const accentB = visual.accentB;
  const scenarioLine = buildCleanScenarioLine(theme);
  const leadLine = buildCleanLeadLine(theme, profit);
  const supportLine = buildCleanSupportLine(theme, multiplier);
  const valueLine = formatHeroCurrency(theme.exitValue);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="IfYouBought share preview">
  <defs>
    <radialGradient id="bgGlow" cx="16%" cy="16%" r="92%">
      <stop offset="0%" stop-color="${escapeXml(accentB)}" stop-opacity="0.28"/>
      <stop offset="45%" stop-color="#09111f" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#04070f"/>
    </radialGradient>
    <radialGradient id="edgeGlow" cx="84%" cy="14%" r="66%">
      <stop offset="0%" stop-color="${escapeXml(accentA)}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${escapeXml(accentA)}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="frameGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${escapeXml(accentA)}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${escapeXml(accentB)}" stop-opacity="0.22"/>
    </linearGradient>
    <linearGradient id="valueFill" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f8fbff"/>
      <stop offset="100%" stop-color="${escapeXml(accentB)}"/>
    </linearGradient>
    <linearGradient id="chartStroke" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${escapeXml(accentA)}"/>
      <stop offset="100%" stop-color="${escapeXml(accentB)}"/>
    </linearGradient>
    <linearGradient id="chartArea" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${escapeXml(accentB)}" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="${escapeXml(accentB)}" stop-opacity="0"/>
    </linearGradient>
    <pattern id="gridDots" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.08)"/>
    </pattern>
    <linearGradient id="lineGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${escapeXml(accentA)}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${escapeXml(accentB)}" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="${escapeXml(accentA)}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bgGlow)"/>
  <rect width="1200" height="630" fill="url(#edgeGlow)"/>
  <rect x="0" y="0" width="1200" height="630" fill="url(#gridDots)" opacity="0.25"/>
  <circle cx="1000" cy="120" r="174" fill="${escapeXml(accentA)}" fill-opacity="0.08"/>
  <circle cx="180" cy="560" r="220" fill="${escapeXml(accentB)}" fill-opacity="0.10"/>
  <rect x="58" y="46" width="1084" height="538" rx="40" fill="#07101c" fill-opacity="0.92" stroke="rgba(255,255,255,0.10)"/>
  <rect x="84" y="72" width="1032" height="486" rx="32" fill="none" stroke="rgba(255,255,255,0.04)"/>

  <rect x="524" y="82" width="152" height="40" rx="20" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)"/>
  <text x="600" y="108" fill="rgba(255,255,255,0.94)" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700">IfYouBought</text>

  <rect x="918" y="82" width="176" height="40" rx="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)"/>
  <text x="1006" y="108" fill="${escapeXml(accentA)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="2">${escapeXml(
    visual.label
  )}</text>

  <rect x="357" y="168" width="486" height="40" rx="20" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.08)"/>
  <text x="600" y="194" fill="rgba(232,237,245,0.78)" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700">${escapeXml(
    truncateText(scenarioLine, 34)
  )}</text>

  <text x="600" y="290" fill="rgba(255,255,255,0.94)" text-anchor="middle" font-family="Arial, sans-serif" font-size="62" font-weight="700">${escapeXml(
    truncateText(leadLine, 26)
  )}</text>
  <text x="600" y="430" fill="url(#valueFill)" text-anchor="middle" font-family="Arial, sans-serif" font-size="144" font-weight="700">${escapeXml(
    valueLine
  )}</text>

  <line x1="232" y1="470" x2="968" y2="470" stroke="url(#lineGlow)" stroke-width="2"/>

  <text x="600" y="518" fill="rgba(232,237,245,0.80)" text-anchor="middle" font-family="Arial, sans-serif" font-size="26">${escapeXml(
    truncateText(supportLine, 40)
  )}</text>
  <text x="600" y="548" fill="rgba(232,237,245,0.54)" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" letter-spacing="2">${escapeXml(
    visual.eyebrow
  )}</text>
</svg>`;
}

function buildChartPath(roi, frame) {
  const { x, y, width, height } = frame;
  const amplitude = Math.max(height * 0.24, Math.min(height * 0.78, 18 + Math.log10(Math.abs(roi) + 12) * 24));
  const startX = x;
  const endX = x + width;
  const baseY = y + height;
  const startY = baseY - height * 0.12;
  const midY = startY - amplitude * 0.38;
  const peakY = startY - amplitude;
  const endY = startY - amplitude * 0.62;

  return {
    line: `M ${startX} ${startY} C ${startX + width * 0.18} ${startY - 4}, ${startX + width * 0.34} ${midY + 14}, ${startX + width * 0.46} ${midY} S ${startX + width * 0.73} ${peakY + 24}, ${startX + width * 0.82} ${peakY} S ${startX + width * 0.95} ${endY + 14}, ${endX} ${endY}`,
    area: `M ${startX} ${startY} C ${startX + width * 0.18} ${startY - 4}, ${startX + width * 0.34} ${midY + 14}, ${startX + width * 0.46} ${midY} S ${startX + width * 0.73} ${peakY + 24}, ${startX + width * 0.82} ${peakY} S ${startX + width * 0.95} ${endY + 14}, ${endX} ${endY} L ${endX} ${baseY} L ${startX} ${baseY} Z`,
    lastX: endX,
    lastY: endY,
  };
}

async function getIndexTemplate() {
  if (!indexTemplatePromise) {
    indexTemplatePromise = fsPromises.readFile(path.join(ROOT, "index.html"), "utf8");
  }

  return indexTemplatePromise;
}

function respondHtml(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(html);
}

function respondJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function respondText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(message);
}

function getBaseUrl(req) {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || `${HOST}:${PORT}`;
  return `${protocol}://${host}`;
}

function describeExitForMeta(preview) {
  if (preview.mode === "ath") {
    return `at the post-entry ATH on ${formatLongDate(preview.exitDate || preview.buyDate)}`;
  }

  if (preview.mode === "today") {
    return "if held to today";
  }

  return `if sold on ${formatLongDate(preview.sellDate || preview.buyDate)}`;
}

function describeExitForImage(preview) {
  if (preview.mode === "ath") {
    return preview.exitDate ? `ATH | ${formatShareDate(preview.exitDate)}` : "Post-entry ATH";
  }

  if (preview.mode === "today") {
    return "Hold to today";
  }

  return `Custom | ${formatShareDate(preview.sellDate)}`;
}

function describeExitForCard(preview) {
  if (preview.mode === "ath") {
    return preview.exitDate ? `ATH exit ${formatShareDate(preview.exitDate)}` : "ATH exit";
  }

  if (preview.mode === "today") {
    return "Held to today";
  }

  return `Sold ${formatShareDate(preview.sellDate || preview.buyDate)}`;
}

function buildExitCardLabel(preview) {
  if (preview.mode === "ath") {
    return "ATH EXIT";
  }

  if (preview.mode === "today") {
    return "HOLD TO TODAY";
  }

  return "CUSTOM EXIT";
}

function buildExitCardDate(preview) {
  if (preview.mode === "today") {
    return "Today";
  }

  return formatShortShareDate(preview.exitDate || preview.sellDate || preview.buyDate);
}

function buildChartRangeLine(preview) {
  const start = formatShortShareDate(preview.buyDate);

  if (preview.mode === "today") {
    return `${start} to Today`;
  }

  return `${start} to ${formatShortShareDate(preview.exitDate || preview.sellDate || preview.buyDate)}`;
}

function buildCleanScenarioLine(preview) {
  return `${preview.symbol} • ${formatSocialCurrency(preview.amount)} • ${formatShareDate(preview.buyDate)}`;
}

function buildCleanLeadLine(preview, profit) {
  if (profit < 0) {
    return "You'd be left with";
  }

  if (preview.mode === "today") {
    return "Held to today, you'd have";
  }

  if (preview.mode === "ath") {
    return "Sold at ATH, you'd have";
  }

  return "Sold then, you'd have";
}

function buildCleanSupportLine(preview, multiplier) {
  const exit =
    preview.mode === "today"
      ? "Held to today"
      : preview.mode === "ath"
        ? `ATH exit ${formatShortShareDate(preview.exitDate || preview.buyDate)}`
        : `Sold ${formatShortShareDate(preview.sellDate || preview.buyDate)}`;

  return `${exit} • ${formatPercent(preview.roi)} ROI • ${formatMultiplier(multiplier)}`;
}

function getShareVisualState(preview, profit, multiplier) {
  const isNegative = profit < 0;
  const isHuge = preview.exitValue >= 1_000_000 || preview.roi >= 10_000;
  const accentA = isNegative ? "#ff6b8f" : preview.colors[0];
  const accentB = isNegative ? "#f5b33a" : preview.colors[1];

  if (isNegative) {
    return {
      label: "PAINFUL TIMING",
      eyebrow: "THE EXIT THAT STUNG",
      subtitle: "The loss card everyone recognizes instantly.",
      accentA,
      accentB,
      metricColor: "#ffb1c3",
    };
  }

  if (preview.mode === "ath") {
    return {
      label: isHuge ? "PERFECT EXIT" : "CAUGHT THE PEAK",
      eyebrow: "THE CLEANEST POSSIBLE SELL",
      subtitle: "The clean hindsight number.",
      accentA,
      accentB,
      metricColor: "#8df4d0",
    };
  }

  if (isHuge) {
    return {
      label: "MISSED MILLIONS",
      eyebrow: "THE TRADE THAT GOT AWAY",
      subtitle: "The screenshot that stops the feed.",
      accentA,
      accentB,
      metricColor: "#8df4d0",
    };
  }

  if (multiplier >= 10) {
    return {
      label: "LEGENDARY HOLD",
      eyebrow: "CONVICTION AGED WELL",
      subtitle: "The unmistakable IfYouBought card.",
      accentA,
      accentB,
      metricColor: "#8df4d0",
    };
  }

  return {
    label: "WHAT IF",
    eyebrow: "REPLAY THE TRADE",
    subtitle: "The premium crypto what-if card.",
    accentA,
    accentB,
    metricColor: "#8df4d0",
  };
}

function buildShareHeadline(preview, profit) {
  const entryAmount = formatSocialCurrency(preview.amount);

  if (profit < 0) {
    return {
      lineOne: `YOUR ${entryAmount} IN ${preview.symbol}`,
      lineTwo: "WOULD BE LEFT AT",
    };
  }

  return {
    lineOne: `YOUR ${entryAmount} IN ${preview.symbol}`,
    lineTwo: "COULD HAVE BECOME",
  };
}

function decodeDateParam(rawValue) {
  if (!rawValue) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  if (/^\d{8}$/.test(rawValue)) {
    return `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}`;
  }

  return "";
}

function decodeSellMode(rawValue) {
  if (rawValue === "t") return "today";
  if (rawValue === "a") return "ath";
  if (rawValue === "c") return "custom";
  return rawValue;
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

function formatHeroCurrency(value) {
  if (Math.abs(value) >= 1000000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(value);
  }

  return formatCurrencyPrecise(value);
}

function formatSocialCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1000 ? "compact" : "standard",
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) >= 1000000 ? 1 : 0,
  }).format(value);
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

function formatSignedCompactCurrency(value) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatHeroCurrency(Math.abs(value))}`;
}

function formatLongDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatShareDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatShortShareDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(",", " '");
}

function truncateText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll("'", "&apos;");
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key]) {
      return;
    }

    process.env[key] = value;
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`IfYouBought running on http://${HOST}:${PORT}`);
  });
}

module.exports = {
  buildOgImage,
  buildSeoMeta,
  createServer,
  getSharePreviewData,
};
