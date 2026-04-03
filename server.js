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
  "price": 15_000,
  "pricemulti": 15_000,
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
  const allowedPaths = new Set(["price", "pricemulti", "v2/histoday"]);

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

  const introLine = preview
    ? `${theme.coinName} | ${formatSocialCurrency(theme.amount)} entry`
    : "Replay the trade you still think about";
  const exitLine = preview ? describeExitForImage(theme) : "Today, ATH, or any custom exit";
  const exactLine = preview
    ? `${formatCurrencyPrecise(theme.amount)} on ${formatLongDate(theme.buyDate)}`
    : "Live crypto what-if calculator";
  const roiLine = preview ? formatPercent(theme.roi) : "+530,566%";
  const valueLine = formatHeroCurrency(theme.exitValue);
  const chartPath = buildChartPath(theme.roi);
  const colorA = theme.colors[0];
  const colorB = theme.colors[1];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="IfYouBought share preview">
  <defs>
    <radialGradient id="bgGlow" cx="18%" cy="18%" r="90%">
      <stop offset="0%" stop-color="${escapeXml(colorB)}" stop-opacity="0.34"/>
      <stop offset="50%" stop-color="#07101d" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#04070f"/>
    </radialGradient>
    <linearGradient id="cardGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${escapeXml(colorA)}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${escapeXml(colorB)}" stop-opacity="0.28"/>
    </linearGradient>
    <linearGradient id="valueFill" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f8fbff"/>
      <stop offset="100%" stop-color="${escapeXml(colorB)}"/>
    </linearGradient>
    <linearGradient id="chartStroke" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${escapeXml(colorA)}"/>
      <stop offset="100%" stop-color="${escapeXml(colorB)}"/>
    </linearGradient>
    <linearGradient id="chartArea" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${escapeXml(colorB)}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${escapeXml(colorB)}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bgGlow)"/>
  <circle cx="950" cy="110" r="170" fill="${escapeXml(colorA)}" fill-opacity="0.12"/>
  <circle cx="180" cy="520" r="220" fill="${escapeXml(colorB)}" fill-opacity="0.16"/>
  <rect x="52" y="46" width="1096" height="538" rx="38" fill="#09101d" fill-opacity="0.82" stroke="rgba(255,255,255,0.12)"/>
  <rect x="72" y="66" width="1056" height="498" rx="32" fill="none" stroke="rgba(255,255,255,0.05)"/>
  <rect x="94" y="96" width="62" height="62" rx="20" fill="url(#cardGlow)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="113" y="111" width="24" height="32" rx="8" fill="#f8fbff"/>
  <text x="182" y="120" fill="rgba(255,255,255,0.92)" font-family="Arial, sans-serif" font-size="22" font-weight="700">IfYouBought</text>
  <text x="182" y="150" fill="rgba(232,237,245,0.68)" font-family="Arial, sans-serif" font-size="18">${escapeXml(
    truncateText(introLine, 42)
  )}</text>
  <rect x="860" y="98" width="216" height="46" rx="23" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)"/>
  <text x="888" y="127" fill="rgba(232,237,245,0.82)" font-family="Arial, sans-serif" font-size="20" font-weight="700">${escapeXml(
    truncateText(exitLine, 22)
  )}</text>
  <text x="96" y="238" fill="${escapeXml(colorA)}" font-family="Arial, sans-serif" font-size="18" letter-spacing="6">THE RESULT</text>
  <text x="96" y="304" fill="rgba(255,255,255,0.96)" font-family="Arial, sans-serif" font-size="72" font-weight="700">${escapeXml(
    truncateText(preview ? `${theme.coinName} could have become` : "Replay the trade you missed", 28)
  )}</text>
  <text x="96" y="394" fill="url(#valueFill)" font-family="Arial, sans-serif" font-size="110" font-weight="700">${escapeXml(
    valueLine
  )}</text>
  <text x="96" y="438" fill="rgba(232,237,245,0.74)" font-family="Arial, sans-serif" font-size="24">${escapeXml(
    exactLine
  )}</text>
  <rect x="96" y="474" width="214" height="70" rx="24" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)"/>
  <text x="124" y="503" fill="rgba(232,237,245,0.58)" font-family="Arial, sans-serif" font-size="18" letter-spacing="2">ROI</text>
  <text x="124" y="533" fill="#8df4d0" font-family="Arial, sans-serif" font-size="34" font-weight="700">${escapeXml(
    roiLine
  )}</text>
  <rect x="334" y="474" width="260" height="70" rx="24" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)"/>
  <text x="362" y="503" fill="rgba(232,237,245,0.58)" font-family="Arial, sans-serif" font-size="18" letter-spacing="2">SCENARIO</text>
  <text x="362" y="533" fill="rgba(255,255,255,0.9)" font-family="Arial, sans-serif" font-size="28" font-weight="700">${escapeXml(
    truncateText(exitLine, 18)
  )}</text>
  <rect x="704" y="214" width="360" height="268" rx="28" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)"/>
  <path d="${chartPath.area}" fill="url(#chartArea)"/>
  <path d="${chartPath.line}" fill="none" stroke="url(#chartStroke)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="1028" cy="286" r="14" fill="${escapeXml(colorB)}" fill-opacity="0.18"/>
  <circle cx="1028" cy="286" r="5" fill="#f8fbff"/>
  <text x="734" y="252" fill="rgba(232,237,245,0.58)" font-family="Arial, sans-serif" font-size="18" letter-spacing="2">PORTFOLIO CURVE</text>
  <text x="734" y="282" fill="rgba(255,255,255,0.88)" font-family="Arial, sans-serif" font-size="28" font-weight="700">${escapeXml(
    truncateText(preview ? `${formatShareDate(theme.buyDate)} to ${exitLine}` : "Buy to exit", 24)
  )}</text>
  <text x="734" y="440" fill="rgba(232,237,245,0.6)" font-family="Arial, sans-serif" font-size="18">${escapeXml(
    preview ? formatCurrencyPrecise(theme.amount) : "$1,000"
  )}</text>
  <text x="956" y="440" fill="rgba(232,237,245,0.92)" font-family="Arial, sans-serif" font-size="18">${escapeXml(
    formatHeroCurrency(theme.exitValue)
  )}</text>
</svg>`;
}

function buildChartPath(roi) {
  const amplitude = Math.max(48, Math.min(180, 54 + Math.log10(Math.abs(roi) + 12) * 38));
  const startY = 426;
  const midY = startY - amplitude * 0.38;
  const peakY = startY - amplitude;
  const endY = startY - amplitude * 0.62;

  return {
    line: `M 734 ${startY} C 790 ${startY - 4}, 832 ${midY + 18}, 888 ${midY} S 982 ${peakY + 30}, 1028 ${peakY} S 1084 ${endY + 16}, 1110 ${endY}`,
    area: `M 734 ${startY} C 790 ${startY - 4}, 832 ${midY + 18}, 888 ${midY} S 982 ${peakY + 30}, 1028 ${peakY} S 1084 ${endY + 16}, 1110 ${endY} L 1110 454 L 734 454 Z`,
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
