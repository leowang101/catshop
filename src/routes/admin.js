"use strict";

const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const { safeQuery, withTransaction } = require("../db/pool");
const { sendJson } = require("../utils/respond");
const { withHandler } = require("../utils/observability");
const { ADMIN_TOKEN_MAX_AGE, DEFAULT_PAGE_SIZE } = require("../utils/constants");
const { createAdminAuth } = require("../middleware/adminAuth");
const { logger } = require("../utils/logger");

function escapeLike(str) {
  return str.replace(/[%_\\]/g, ch => "\\" + ch);
}

const _auth = createAdminAuth({
  usernameEnv: "ADMIN_USERNAME",
  passwordEnv: "ADMIN_PASSWORD",
  tokenSecretEnv: "ADMIN_TOKEN_SECRET",
  tokenMaxAge: ADMIN_TOKEN_MAX_AGE,
  tokenPrefix: "admin",
  label: "管理后台",
});

const ORDER_CODE_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
function generateOrderCode() {
  const bytes = crypto.randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i++) {
    raw += ORDER_CODE_CHARS[bytes[i] % ORDER_CODE_CHARS.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

/**
 * POST /api/admin/login
 * 管理员登录（硬编码账号密码，带暴力破解防护）
 */
router.post("/api/admin/login", withHandler("adminLogin", async (req, res) => {
  if (!_auth.configured) {
    return sendJson(res, 503, { ok: false, message: "管理后台未配置" });
  }

  const ip = _auth.getClientIp(req);
  const rate = _auth.checkLoginRate(ip);
  if (rate.blocked) {
    return sendJson(res, 429, {
      ok: false,
      message: `登录失败次数过多，请 ${rate.retryAfterSec} 秒后再试`,
    });
  }

  const { username, password } = req.body || {};
  if (username !== _auth.username || password !== _auth.password) {
    _auth.recordLoginFailure(ip);
    return sendJson(res, 401, { ok: false, message: "用户名或密码错误" });
  }

  _auth.clearLoginAttempts(ip);
  const token = _auth.generateToken();
  sendJson(res, 200, { ok: true, token });
}));

/**
 * GET /api/admin/stats
 * 数据看板统计
 */
router.get("/api/admin/stats", _auth.requireAdmin, withHandler("adminStats", async (req, res) => {
  // 今日统计
  const [todayRows] = await safeQuery(
    `SELECT COUNT(*) AS cnt, IFNULL(SUM(total_qty),0) AS qty
     FROM shop_orders WHERE DATE(created_at) = CURDATE()`
  );
  // 待确认清单数（仅统计30天内，超过30天的归档口令不计入）
  const [pendingRows] = await safeQuery(
    `SELECT COUNT(*) AS cnt FROM shop_orders WHERE status = 'pending' AND created_at >= NOW() - INTERVAL 30 DAY`
  );
  // 累计总数
  const [totalRows] = await safeQuery(
    `SELECT COUNT(*) AS cnt FROM shop_orders`
  );

  const today = todayRows[0] || {};
  const pending = pendingRows[0] || {};
  const total = totalRows[0] || {};

  sendJson(res, 200, {
    ok: true,
    data: {
      todayOrders: today.cnt || 0,
      todayQty: today.qty || 0,
      pendingOrders: pending.cnt || 0,
      totalOrders: total.cnt || 0,
    },
  });
}));

/**
 * GET /api/admin/orders?page=1&pageSize=20&keyword=&taobaoKeyword=&status=&hasTaobao=&dateFrom=&dateTo=&view=main
 * 口令列表（分页 + 多条件筛选）
 * view=main（默认）：主列表，隐藏超过30天未确认的归档口令
 * view=archive：回收站，仅显示超过30天未确认的口令
 */
router.get("/api/admin/orders", _auth.requireAdmin, withHandler("adminOrders", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE));
  const keyword = (req.query.keyword || "").trim().slice(0, 64);
  const taobaoKeyword = (req.query.taobaoKeyword || "").trim().slice(0, 64);
  const status = (req.query.status || "").trim();              // pending / confirmed / ""
  const hasTaobao = (req.query.hasTaobao || "").trim();        // yes / no / ""
  const dateFrom = (req.query.dateFrom || "").trim();          // YYYY-MM-DD
  const dateTo = (req.query.dateTo || "").trim();              // YYYY-MM-DD
  const view = (req.query.view || "main").trim();              // main / archive
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const params = [];

  // 视图过滤：主列表隐藏归档口令，回收站只显示归档口令
  if (view === "archive") {
    conditions.push("(status = 'pending' AND created_at < NOW() - INTERVAL 30 DAY)");
  } else {
    conditions.push("(status = 'confirmed' OR created_at >= NOW() - INTERVAL 30 DAY)");
  }

  if (keyword) {
    conditions.push("order_code LIKE ? ESCAPE '\\\\'");
    params.push(`%${escapeLike(keyword)}%`);
  }
  if (taobaoKeyword) {
    conditions.push("taobao_order_no LIKE ? ESCAPE '\\\\'");
    params.push(`%${escapeLike(taobaoKeyword)}%`);
  }
  if (status === "pending" || status === "confirmed") {
    conditions.push("status = ?");
    params.push(status);
  }
  if (hasTaobao === "yes") {
    conditions.push("taobao_order_no IS NOT NULL AND taobao_order_no != ''");
  } else if (hasTaobao === "no") {
    conditions.push("(taobao_order_no IS NULL OR taobao_order_no = '')");
  }
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    conditions.push("created_at >= ?");
    params.push(dateFrom + " 00:00:00");
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    conditions.push("created_at <= ?");
    params.push(dateTo + " 23:59:59");
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const [countRows] = await safeQuery(
    `SELECT COUNT(*) AS total FROM shop_orders ${where}`,
    params
  );
  const total = countRows[0]?.total || 0;

  const [rows] = await safeQuery(
    `SELECT id, order_code, created_at, updated_at, color_count, total_qty, items_json, plan_json, taobao_order_no, brand_type, status, download_count
     FROM shop_orders ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const list = (rows || []).map(r => ({
    id: r.id,
    orderCode: r.order_code,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    colorCount: r.color_count,
    totalQty: r.total_qty,
    taobaoOrderNo: r.taobao_order_no || "",
    brandType: r.brand_type || "mard",
    status: r.status || "pending",
    downloadCount: r.download_count || 0,
    items: (() => { try { return typeof r.items_json === "string" ? JSON.parse(r.items_json) : r.items_json; } catch (e) { logger.warn({ orderId: r.id, error: e.message }, "items_json parse failed"); return []; } })(),
    plan: (() => { try { return r.plan_json ? (typeof r.plan_json === "string" ? JSON.parse(r.plan_json) : r.plan_json) : null; } catch (e) { logger.warn({ orderId: r.id, error: e.message }, "plan_json parse failed"); return null; } })(),
  }));

  sendJson(res, 200, {
    ok: true,
    data: { list, total, page, pageSize },
  });
}));

/**
 * GET /api/admin/orders/:id
 * 口令明细
 */
router.get("/api/admin/orders/:id", _auth.requireAdmin, withHandler("adminOrderDetail", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return sendJson(res, 400, { ok: false, message: "无效ID" });

  const [rows] = await safeQuery(
    `SELECT id, order_code, created_at, updated_at, color_count, total_qty, items_json, plan_json, taobao_order_no, brand_type, status, download_count
     FROM shop_orders WHERE id = ? LIMIT 1`,
    [id]
  );

  if (!rows || rows.length === 0) {
    return sendJson(res, 404, { ok: false, message: "未找到该口令" });
  }

  const r = rows[0];
  let items = [];
  try { items = typeof r.items_json === "string" ? JSON.parse(r.items_json) : r.items_json; } catch (e) { logger.warn({ orderId: r.id, error: e.message }, "items_json parse failed"); }
  let plan = null;
  try { plan = r.plan_json ? (typeof r.plan_json === "string" ? JSON.parse(r.plan_json) : r.plan_json) : null; } catch (e) { logger.warn({ orderId: r.id, error: e.message }, "plan_json parse failed"); }

  sendJson(res, 200, {
    ok: true,
    data: {
      id: r.id,
      orderCode: r.order_code,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      colorCount: r.color_count,
      totalQty: r.total_qty,
      taobaoOrderNo: r.taobao_order_no || "",
      brandType: r.brand_type || "mard",
      status: r.status || "pending",
      downloadCount: r.download_count || 0,
      items,
      plan,
    },
  });
}));

/**
 * PUT /api/admin/orders/:id/confirm
 * 客服确认 / 取消确认（确认时需要先填写淘宝订单备注）
 */
router.put("/api/admin/orders/:id/confirm", _auth.requireAdmin, withHandler("adminOrderConfirm", async (req, res) => {
  const { vInt, vStr: _vStr, vEnum } = require("../utils/validate");
  const idCheck = vInt(req.params.id, { min: 1, label: "订单ID" });
  if (!idCheck.ok) return sendJson(res, 400, { ok: false, message: idCheck.message });
  const id = idCheck.value;

  const actionRaw = (req.body || {}).action;
  let action = "confirm";
  if (actionRaw !== undefined && actionRaw !== null && actionRaw !== "") {
    const actionCheck = vEnum(actionRaw, ["confirm", "cancel"], { label: "action" });
    if (!actionCheck.ok) return sendJson(res, 400, { ok: false, message: actionCheck.message });
    action = actionCheck.value;
  }

  const taobaoOrderNo = _vStr((req.body || {}).taobaoOrderNo, { max: 64 }).value || "";

  const [rows] = await safeQuery(
    `SELECT id, status, taobao_order_no FROM shop_orders WHERE id = ? LIMIT 1`,
    [id]
  );

  if (!rows || rows.length === 0) {
    return sendJson(res, 404, { ok: false, message: "未找到该订单" });
  }

  const currentStatus = rows[0].status || "pending";

  if (action === "cancel") {
    // 取消确认：只有 confirmed 状态才允许恢复到 pending
    const [result] = await safeQuery(
      `UPDATE shop_orders SET status = 'pending' WHERE id = ? AND status = 'confirmed'`,
      [id]
    );
    if (!result || result.affectedRows === 0) {
      return sendJson(res, 200, { ok: true, message: "订单未确认" });
    }
    return sendJson(res, 200, { ok: true, message: "已取消确认" });
  }

  if (currentStatus === "confirmed") {
    return sendJson(res, 200, { ok: true, message: "订单已确认" });
  }

  // 确认时必须有淘宝备注（从请求体或已有数据）
  const finalNo = (taobaoOrderNo || "").trim() || (rows[0].taobao_order_no || "").trim();
  if (!finalNo) {
    return sendJson(res, 400, { ok: false, message: "请先填写淘宝订单备注" });
  }

  // 条件更新防止竞态：只有 pending 状态才允许确认
  const [result] = await safeQuery(
    `UPDATE shop_orders SET status = 'confirmed', taobao_order_no = ? WHERE id = ? AND status = 'pending'`,
    [finalNo, id]
  );
  if (!result || result.affectedRows === 0) {
    return sendJson(res, 200, { ok: true, message: "订单已确认" });
  }

  sendJson(res, 200, { ok: true });
}));

/**
 * PUT /api/admin/orders/:id/taobao
 * 修改淘宝订单备注（已确认订单也可修改）
 *
 * Body:
 * - taobaoOrderNo: string  — 淘宝订单备注
 * - overwrite: boolean     — true: 清空其他同备注订单后保存；未传或 false: 有重复时返回 duplicateExist
 * - force: boolean         — true: 忽略重复直接保存，不清空其他记录
 */
router.put("/api/admin/orders/:id/taobao", _auth.requireAdmin, withHandler("adminOrderTaobao", async (req, res) => {
  const { vInt, vStr: _vStr } = require("../utils/validate");
  const idCheck = vInt(req.params.id, { min: 1, label: "订单ID" });
  if (!idCheck.ok) return sendJson(res, 400, { ok: false, message: idCheck.message });
  const id = idCheck.value;

  const noCheck = _vStr((req.body || {}).taobaoOrderNo, { min: 1, max: 64, label: "淘宝订单备注" });
  if (!noCheck.ok) return sendJson(res, 400, { ok: false, message: noCheck.message });
  const no = noCheck.value;

  const overwrite = !!(req.body || {}).overwrite;
  const force = !!(req.body || {}).force;

  const lockKey = `catshop:taobao:${no}`;
  let response = { status: 200, body: { ok: true } };

  await withTransaction(async (conn) => {
    const [lockRows] = await conn.query("SELECT GET_LOCK(?, 5) AS locked", [lockKey]);
    const locked = Number(lockRows?.[0]?.locked) === 1;
    if (!locked) {
      response = { status: 409, body: { ok: false, message: "系统繁忙，请稍后重试" } };
      return;
    }

    try {
      const [rows] = await conn.query(
        `SELECT id FROM shop_orders WHERE id = ? LIMIT 1 FOR UPDATE`,
        [id]
      );
      if (!rows || rows.length === 0) {
        response = { status: 404, body: { ok: false, message: "未找到该订单" } };
        return;
      }

      const [dupRows] = await conn.query(
        `SELECT id FROM shop_orders WHERE taobao_order_no = ? AND id != ? LIMIT 1 FOR UPDATE`,
        [no, id]
      );
      const hasDuplicate = dupRows && dupRows.length > 0;

      if (hasDuplicate && !overwrite && !force) {
        response = { status: 200, body: { ok: false, duplicateExist: true, message: "该淘宝订单备注已存在" } };
        return;
      }

      if (overwrite && hasDuplicate) {
        await conn.query(
          `UPDATE shop_orders SET taobao_order_no = NULL WHERE taobao_order_no = ? AND id != ?`,
          [no, id]
        );
      }

      await conn.query(
        `UPDATE shop_orders SET taobao_order_no = ? WHERE id = ?`,
        [no, id]
      );
      response = { status: 200, body: { ok: true } };
    } finally {
      try { await conn.query("SELECT RELEASE_LOCK(?)", [lockKey]); } catch {}
    }
  });

  sendJson(res, response.status, response.body);
}));

/**
 * POST /api/admin/orders/:id/duplicate
 * 拷贝清单：复制订单数据，生成新口令，使用指定的淘宝订单备注
 */
router.post("/api/admin/orders/:id/duplicate", _auth.requireAdmin, withHandler("adminOrderDuplicate", async (req, res) => {
  const { vInt, vStr: _vStr } = require("../utils/validate");
  const idCheck = vInt(req.params.id, { min: 1, label: "订单ID" });
  if (!idCheck.ok) return sendJson(res, 400, { ok: false, message: idCheck.message });
  const id = idCheck.value;

  const noCheck = _vStr((req.body || {}).taobaoOrderNo, { min: 1, max: 64, label: "淘宝订单备注" });
  if (!noCheck.ok) return sendJson(res, 400, { ok: false, message: noCheck.message });
  const taobaoNo = noCheck.value;

  // 查询原订单
  const [rows] = await safeQuery(
    `SELECT items_json, plan_json, total_qty, color_count, brand_type FROM shop_orders WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!rows || rows.length === 0) {
    return sendJson(res, 404, { ok: false, message: "未找到该订单" });
  }
  const src = rows[0];

  const payloadItems = typeof src.items_json === "string" ? src.items_json : JSON.stringify(src.items_json);
  const payloadPlan = src.plan_json
    ? (typeof src.plan_json === "string" ? src.plan_json : JSON.stringify(src.plan_json))
    : null;

  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const newCode = generateOrderCode();
    try {
      const [result] = await safeQuery(
        `INSERT INTO shop_orders (order_code, items_json, plan_json, total_qty, color_count, brand_type, taobao_order_no)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newCode, payloadItems, payloadPlan, src.total_qty, src.color_count, src.brand_type || "mard", taobaoNo]
      );
      return sendJson(res, 200, { ok: true, id: result.insertId, orderCode: newCode });
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY" && attempt < maxRetries) continue;
      if (e.code === "ER_DUP_ENTRY") {
        return sendJson(res, 409, { ok: false, message: "口令冲突，请重试" });
      }
      throw e;
    }
  }
}));

/**
 * PUT /api/admin/orders/:id/csv-download
 * 记录一次 CSV 下载，download_count + 1
 */
router.put("/api/admin/orders/:id/csv-download", _auth.requireAdmin, withHandler("adminOrderCsvDownload", async (req, res) => {
  const { vInt } = require("../utils/validate");
  const idCheck = vInt(req.params.id, { min: 1, label: "订单ID" });
  if (!idCheck.ok) return sendJson(res, 400, { ok: false, message: idCheck.message });
  const id = idCheck.value;

  const [result] = await safeQuery(
    `UPDATE shop_orders SET download_count = download_count + 1 WHERE id = ?`,
    [id]
  );
  if (!result || result.affectedRows === 0) {
    return sendJson(res, 404, { ok: false, message: "未找到该订单" });
  }
  sendJson(res, 200, { ok: true });
}));

/**
 * GET /api/admin/spec-config
 * 获取规格配置（20g/50g/100g 的上下架状态）
 */
router.get("/api/admin/spec-config", _auth.requireAdmin, withHandler("adminSpecConfig", async (req, res) => {
  const [rows] = await safeQuery(
    "SELECT config_value FROM shop_config WHERE config_key = 'available_specs' LIMIT 1"
  );
  let specs = { 20: true, 50: true, 100: true };
  if (rows && rows[0]) {
    try { specs = JSON.parse(rows[0].config_value); } catch (e) { logger.warn({ key: "available_specs", error: e.message }, "config parse failed"); }
  }
  sendJson(res, 200, { ok: true, data: specs });
}));

/**
 * PUT /api/admin/spec-config
 * 更新规格配置
 */
router.put("/api/admin/spec-config", _auth.requireAdmin, withHandler("adminSpecConfigUpdate", async (req, res) => {
  const { specs } = req.body || {};
  if (!specs || typeof specs !== "object") {
    return sendJson(res, 400, { ok: false, message: "参数错误" });
  }
  // 只允许配置 20/50/100，10g 和功能色10g 必须开启
  const config = {
    20: !!specs[20],
    50: !!specs[50],
    100: !!specs[100],
  };
  await safeQuery(
    "INSERT INTO shop_config(config_key, config_value) VALUES ('available_specs', ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)",
    [JSON.stringify(config)]
  );
  sendJson(res, 200, { ok: true, data: config });
}));

/**
 * GET /api/admin/disabled-codes
 * 获取下架色号列表
 */
router.get("/api/admin/disabled-codes", _auth.requireAdmin, withHandler("adminDisabledCodes", async (req, res) => {
  const [rows] = await safeQuery(
    "SELECT config_value FROM shop_config WHERE config_key = 'disabled_codes' LIMIT 1"
  );
  let codes = [];
  if (rows && rows[0]) {
    try { codes = JSON.parse(rows[0].config_value); } catch (e) { logger.warn({ key: "disabled_codes", error: e.message }, "config parse failed"); }
  }
  sendJson(res, 200, { ok: true, data: Array.isArray(codes) ? codes : [] });
}));

/**
 * PUT /api/admin/disabled-codes
 * 更新下架色号列表
 */
router.put("/api/admin/disabled-codes", _auth.requireAdmin, withHandler("adminDisabledCodesUpdate", async (req, res) => {
  const { codes } = req.body || {};
  if (!Array.isArray(codes)) {
    return sendJson(res, 400, { ok: false, message: "参数错误" });
  }
  // 只保留合法的色号字符串，去重
  const value = [...new Set(codes.filter(c => typeof c === "string" && c.length <= 5))];
  await safeQuery(
    "INSERT INTO shop_config(config_key, config_value) VALUES ('disabled_codes', ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)",
    [JSON.stringify(value)]
  );
  sendJson(res, 200, { ok: true, data: value });
}));

// ====== 试用码代理（转发到主站合作方 API） ======

const { PARTNER_API_SECRET, PARTNER_API_BASE_URL } = require("../utils/constants");

function _partnerSign(method, path) {
  const ts = String(Date.now());
  const sig = crypto.createHmac("sha256", PARTNER_API_SECRET).update(`${ts}:${method}:${path}`).digest("hex");
  return `HMAC-SHA256 ${ts}.${sig}`;
}

async function _readUpstreamJson(resp) {
  const raw = await resp.text();
  if (!raw) return { ok: resp.ok };
  try {
    return JSON.parse(raw);
  } catch {
    return { ok: resp.ok, message: raw };
  }
}

router.post("/api/admin/generate-trial-code", _auth.requireAdmin, withHandler("adminProxyGenerateTrialCode", async (req, res) => {
  if (!PARTNER_API_SECRET || !PARTNER_API_BASE_URL) {
    return sendJson(res, 503, { ok: false, message: "合作方 API 未配置" });
  }
  const apiPath = "/api/partner/trial-codes";
  try {
    const resp = await fetch(`${PARTNER_API_BASE_URL}${apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": _partnerSign("POST", apiPath),
      },
      body: JSON.stringify({ quantity: req.body?.quantity }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await _readUpstreamJson(resp);
    sendJson(res, resp.status, data);
  } catch (e) {
    logger.error({ error: e.message }, "partnerProxy generate-trial-code failed");
    sendJson(res, 502, { ok: false, message: "连接主站失败，请稍后再试" });
  }
}));

router.get("/api/admin/trial-codes", _auth.requireAdmin, withHandler("adminProxyTrialCodes", async (req, res) => {
  if (!PARTNER_API_SECRET || !PARTNER_API_BASE_URL) {
    return sendJson(res, 503, { ok: false, message: "合作方 API 未配置" });
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (v) qs.set(k, String(v));
  }
  const apiPath = "/api/partner/trial-codes";
  const fullUrl = `${PARTNER_API_BASE_URL}${apiPath}${qs.toString() ? "?" + qs.toString() : ""}`;
  try {
    const resp = await fetch(fullUrl, {
      method: "GET",
      headers: { "Authorization": _partnerSign("GET", apiPath) },
      signal: AbortSignal.timeout(15000),
    });
    const data = await _readUpstreamJson(resp);
    sendJson(res, resp.status, data);
  } catch (e) {
    logger.error({ error: e.message }, "partnerProxy trial-codes failed");
    sendJson(res, 502, { ok: false, message: "连接主站失败，请稍后再试" });
  }
}));

module.exports = router;
