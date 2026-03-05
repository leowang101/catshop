"use strict";

function sendJson(res, status, obj) {
  if (status >= 500) {
    try {
      res.locals = res.locals || {};
      if (obj && typeof obj.message !== "undefined") res.locals._errorMessage = String(obj.message);
    } catch {}
  }
  res.status(status).json(obj);
}

const _DEFAULT_ORIGINS = [
  "https://shopping.aidoucang.cn",
  "https://admin-shopping.aidoucang.cn",
  "https://shopping.leobeads.xyz",
  "https://admin-shopping.leobeads.xyz",
  "https://shop-admin.leobeads.xyz",
];

const ALLOWED_ORIGINS = new Set(
  process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
    : _DEFAULT_ORIGINS
);

if (process.env.NODE_ENV !== "production") {
  ALLOWED_ORIGINS.add("http://localhost:3020");
  ALLOWED_ORIGINS.add("http://127.0.0.1:3020");
}

function withCors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,authorization");
}

module.exports = { sendJson, withCors };
