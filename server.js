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
  ".svg": "image/svg+xml",
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

const cache = new Map();

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (requestUrl.pathname.startsWith("/api/market/")) {
      await handleMarketProxy(requestUrl, res);
      return;
    }

    await handleStatic(requestUrl, res);
  } catch (error) {
    respondJson(res, 500, {
      Response: "Error",
      Message: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`IfYouBought running on http://${HOST}:${PORT}`);
});

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

async function handleStatic(requestUrl, res) {
  let pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  pathname = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const targetPath = path.join(ROOT, pathname);

  if (!targetPath.startsWith(ROOT)) {
    respondText(res, 403, "Forbidden");
    return;
  }

  try {
    const content = await fsPromises.readFile(targetPath);
    const extension = path.extname(targetPath).toLowerCase();
    const contentType = STATIC_TYPES[extension] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=300",
    });
    res.end(content);
  } catch (error) {
    if (pathname !== "/index.html") {
      const indexHtml = await fsPromises.readFile(path.join(ROOT, "index.html"));
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(indexHtml);
      return;
    }

    respondText(res, 404, "Not found");
  }
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
