"use strict";

const { AsyncLocalStorage } = require("async_hooks");
const { logger } = require("./logger");

const requestStore = new AsyncLocalStorage();

function generateRequestId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function trackDbTime(ms) {
  const store = requestStore.getStore();
  if (!store) return;
  store.dbMs += ms;
  store.dbCount += 1;
}

function isPromiseLike(value) {
  if (!value || typeof value !== "object") return false;
  return typeof value.catch === "function";
}

function withHandler(name, handler) {
  return function handlerWrapper(req, res, next) {
    req.handlerName = name;
    const store = requestStore.getStore();
    if (store) store.handlerName = name;
    const result = handler(req, res, next);
    if (isPromiseLike(result)) result.catch(next);
  };
}

function requestContext(req, res, next) {
  const requestId = generateRequestId();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const store = {
    requestId,
    startAt: process.hrtime.bigint(),
    dbMs: 0, dbCount: 0,
    handlerName: "-",
    method: req.method,
    path: String(req.originalUrl || req.url || "").split("?")[0],
  };

  requestStore.run(store, () => {
    res.on("finish", () => {
      try {
        const totalMs = Math.round(Number(process.hrtime.bigint() - store.startAt) / 1e6);
        const status = res.statusCode || 0;
        const logData = { requestId, method: store.method, path: store.path, statusCode: status, totalMs, dbMs: Math.round(store.dbMs), handler: store.handlerName };
        if (status >= 500) logger.error(logData, `Request error: ${store.method} ${store.path}`);
        else if (totalMs >= 500) logger.warn(logData, `Slow request: ${store.method} ${store.path}`);
        else logger.info(logData, `${store.method} ${store.path}`);
      } catch {}
    });
    next();
  });
}

module.exports = { requestContext, withHandler, trackDbTime };
