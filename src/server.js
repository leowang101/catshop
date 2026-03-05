"use strict";

const express = require("express");
const compression = require("compression");
const path = require("path");
const fs = require("fs");
const { withCors } = require("./utils/respond");
const { requestContext } = require("./utils/observability");
const { ensureSchema } = require("./db/schema");
const { BUILD_TAG, PORT, SERVE_FRONTEND } = require("./utils/constants");
const { logger } = require("./utils/logger");

const shopRoutes = require("./routes/shop");
const adminRoutes = require("./routes/admin");

process.on("uncaughtException", (err) => {
  logger.fatal({ error: err.message, stack: err.stack }, "Uncaught exception — process will exit");
  setTimeout(() => process.exit(1), 1000);
});
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.error({ error: msg }, "Unhandled promise rejection");
});

const app = express();
let serverInstance = null;
let isShuttingDown = false;

function setupGracefulShutdown(server) {
  const shutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.warn({ signal }, "Shutdown signal received");
    const forceExitTimer = setTimeout(() => process.exit(1), 15000);
    forceExitTimer.unref();
    server.close((err) => {
      clearTimeout(forceExitTimer);
      if (err) { logger.error({ error: err.message }, "HTTP server close failed"); process.exit(1); }
      logger.info({ signal }, "HTTP server closed gracefully");
      process.exit(0);
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

app.use((req, res, next) => {
  withCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).send("");
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use(compression());
app.use("/api", requestContext);

app.use(shopRoutes);
app.use(adminRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, buildTag: BUILD_TAG });
});

// Public palette endpoint (for admin stock config)
const { PALETTE_ALL } = require("./utils/palette");
app.get("/api/public/palette", (req, res) => {
  res.json({ ok: true, data: PALETTE_ALL.map(c => ({ code: c.code, hex: c.hex, series: c.series })) });
});

if (SERVE_FRONTEND) {
  function injectHtml(html) {
    let out = html.replace(/__BUILD_TAG__/g, BUILD_TAG);
    if (fs.existsSync(path.join(__dirname, "..", "public", "js", "shop-app.min.js"))) {
      out = out.replace(/\/js\/shop-app\.js\?/g, "/js/shop-app.min.js?");
    }
    if (fs.existsSync(path.join(__dirname, "..", "public", "css", "shop.min.css"))) {
      out = out.replace(/\/css\/shop\.css\?/g, "/css/shop.min.css?");
    }
    return out;
  }

  // Admin subdomain handling
  app.get("*", (req, res, next) => {
    const hostname = req.hostname || req.get("host")?.split(":")[0] || "";
    const isAdmin = hostname.includes("admin-shopping") || hostname.includes("shop-admin");
    if (!isAdmin) return next();
    if (req.path.startsWith("/api/")) return next();
    if (/\.\w+$/.test(req.path) && req.path !== "/") return next();
    const htmlPath = path.join(__dirname, "..", "public", "admin.html");
    fs.readFile(htmlPath, "utf8", (err, html) => {
      if (err) { logger.error({ error: err.message }, "Failed to read admin.html"); return res.status(500).send("服务器内部错误"); }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(html);
    });
  });

  // Shop root
  app.get("/", (req, res) => {
    const htmlPath = path.join(__dirname, "..", "public", "index.html");
    fs.readFile(htmlPath, "utf8", (err, html) => {
      if (err) { logger.error({ error: err.message }, "Failed to read index.html"); return res.status(500).send("服务器内部错误"); }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(injectHtml(html));
    });
  });

  app.use("/", express.static(path.join(__dirname, "..", "public"), {
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      const base = path.basename(filePath || "");
      if (base === "index.html" || base === "admin.html") {
        res.setHeader("Cache-Control", "no-cache");
        return;
      }
      if (/\.(js|css)$/.test(base)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }
      if (/\.(jpg|jpeg|png|webp|gif|svg|woff|woff2)$/i.test(base)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));

  // SPA fallback for shop
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ ok: false, message: "Not found" });
    const htmlPath = path.join(__dirname, "..", "public", "index.html");
    fs.readFile(htmlPath, "utf8", (err, html) => {
      if (err) return res.status(500).send("服务器内部错误");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.send(injectHtml(html));
    });
  });
}

// Global error handler
app.use((err, req, res, _next) => {
  logger.error({ error: err.message, stack: err.stack, handler: req.handlerName }, "Unhandled route error");
  if (!res.headersSent) {
    res.status(500).json({ ok: false, message: "服务器内部错误" });
  }
});

async function startServer() {
  const { dbEnabled } = require("./db/pool");
  if (dbEnabled()) {
    try { await ensureSchema(); } catch (e) { logger.error({ error: e.message }, "ensureSchema failed"); }
  } else {
    logger.warn("DB not configured — running without database");
  }

  serverInstance = app.listen(PORT, () => {
    logger.info({ port: PORT, buildTag: BUILD_TAG }, `Catshop server started on port ${PORT}`);
  });
  setupGracefulShutdown(serverInstance);
}

module.exports = { app, startServer };
