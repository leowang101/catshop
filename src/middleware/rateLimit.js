"use strict";

function normalizeIp(ip) {
  if (typeof ip !== "string") return "0.0.0.0";
  const s = ip.trim();
  return s.startsWith("::ffff:") ? s.slice(7) : s;
}

function isLoopback(ip) {
  if (!ip) return false;
  const n = normalizeIp(ip);
  return n === "127.0.0.1" || n === "::1" || ip === "::1";
}

function getClientIp(req) {
  const fromLoopback = isLoopback(req.socket?.remoteAddress);
  if (fromLoopback && req.headers["x-real-ip"]) {
    return normalizeIp(req.headers["x-real-ip"]);
  }
  if (req.socket?.remoteAddress) {
    return normalizeIp(req.socket.remoteAddress);
  }
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0].trim();
    return normalizeIp(first);
  }
  return "0.0.0.0";
}

function createRateLimit(opts) {
  const windowMs = opts.windowMs ?? 60000;
  const max = opts.max ?? 30;
  const message = opts.message ?? "请求过于频繁，请稍后再试";
  const store = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of store.entries()) {
      if (v.resetAt <= now) store.delete(key);
    }
  }, 5 * 60 * 1000).unref();

  return function rateLimitMiddleware(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();
    let entry = store.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.status(429).json({ ok: false, message });
      return;
    }
    next();
  };
}

function createConcurrencyLimit(maxConcurrent, message) {
  const msg = message ?? "服务繁忙，请稍后再试";
  let concurrent = 0;

  return function concurrencyLimitMiddleware(req, res, next) {
    if (concurrent >= maxConcurrent) {
      res.status(503).json({ ok: false, message: msg });
      return;
    }
    concurrent++;
    let done = false;
    const onDone = () => {
      if (done) return;
      done = true;
      concurrent--;
      res.removeListener("finish", onDone);
      res.removeListener("close", onDone);
    };
    res.once("finish", onDone);
    res.once("close", onDone);
    next();
  };
}

module.exports = { createRateLimit, createConcurrencyLimit };
