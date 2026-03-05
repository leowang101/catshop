"use strict";

const crypto = require("crypto");
const { sendJson } = require("../utils/respond");

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

/**
 * 管理后台认证工厂：为商城管理后台 / 会员管理后台等提供统一的认证、限流、Token 机制。
 *
 * @param {Object} opts
 * @param {string} opts.usernameEnv   - 用户名环境变量名
 * @param {string} opts.passwordEnv   - 密码环境变量名
 * @param {string} opts.tokenSecretEnv - Token 签名密钥环境变量名
 * @param {number} [opts.tokenMaxAge]  - Token 有效期（ms），默认 7 天
 * @param {string} [opts.tokenPrefix]  - Token payload 前缀，如 "admin" / "member-admin"
 * @param {string} [opts.label]        - 人类可读标签，用于日志和错误提示
 */
function createAdminAuth(opts) {
  const {
    usernameEnv,
    passwordEnv,
    tokenSecretEnv,
    tokenMaxAge = 7 * 24 * 60 * 60 * 1000,
    tokenPrefix = "admin",
    label = "管理后台",
  } = opts;

  const ADMIN_USERNAME = process.env[usernameEnv];
  const ADMIN_PASSWORD = process.env[passwordEnv];
  const TOKEN_SECRET = process.env[tokenSecretEnv];

  const configured = !!(ADMIN_USERNAME && ADMIN_PASSWORD && TOKEN_SECRET);
  if (!configured) {
    const missing = [
      !ADMIN_USERNAME && usernameEnv,
      !ADMIN_PASSWORD && passwordEnv,
      !TOKEN_SECRET && tokenSecretEnv,
    ].filter(Boolean);
    console.warn(`[WARN] ${label}未启用：缺少环境变量 ${missing.join(", ")}。所有${label} API 将返回 503。`);
  }

  // ====== 登录暴力破解防护（基于 IP 的内存计数器） ======
  const _loginAttempts = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of _loginAttempts) {
      if (entry.lockedUntil && now > entry.lockedUntil) {
        _loginAttempts.delete(ip);
      }
    }
  }, 5 * 60 * 1000).unref();

  function getClientIp(req) {
    const xff = req.headers["x-forwarded-for"];
    if (xff) return String(xff).split(",")[0].trim();
    return req.socket?.remoteAddress || "unknown";
  }

  function checkLoginRate(ip) {
    const entry = _loginAttempts.get(ip);
    if (!entry) return { blocked: false };
    const now = Date.now();
    if (entry.lockedUntil && now < entry.lockedUntil) {
      return { blocked: true, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
    }
    if (entry.lockedUntil && now >= entry.lockedUntil) {
      _loginAttempts.delete(ip);
      return { blocked: false };
    }
    return { blocked: false, remaining: LOGIN_MAX_ATTEMPTS - entry.count };
  }

  function recordLoginFailure(ip) {
    const entry = _loginAttempts.get(ip) || { count: 0, lockedUntil: null };
    entry.count += 1;
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    }
    _loginAttempts.set(ip, entry);
  }

  function clearLoginAttempts(ip) {
    _loginAttempts.delete(ip);
  }

  function generateToken() {
    const payload = `${tokenPrefix}:${Date.now()}`;
    const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    return `${Buffer.from(payload).toString("base64")}.${sig}`;
  }

  function verifyToken(token) {
    if (!token) return false;
    const dot = token.lastIndexOf(".");
    if (dot < 0) return false;
    const payloadB64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    let payload;
    try { payload = Buffer.from(payloadB64, "base64").toString(); } catch { return false; }
    const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    try {
      const sigBuf = Buffer.from(sig, "hex");
      const expBuf = Buffer.from(expected, "hex");
      if (sigBuf.length !== expBuf.length) return false;
      if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    } catch { return false; }
    const parts = payload.split(":");
    const ts = parseInt(parts[1], 10);
    if (isNaN(ts) || Date.now() - ts > tokenMaxAge) return false;
    return true;
  }

  function requireAdmin(req, res, next) {
    if (!configured) {
      return sendJson(res, 503, { ok: false, message: `${label}未配置` });
    }
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : auth.trim();
    if (!verifyToken(token)) {
      return sendJson(res, 401, { ok: false, message: "未登录或登录已失效" });
    }
    next();
  }

  return {
    configured,
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    getClientIp,
    checkLoginRate,
    recordLoginFailure,
    clearLoginAttempts,
    generateToken,
    verifyToken,
    requireAdmin,
  };
}

module.exports = { createAdminAuth };
