"use strict";

const crypto = require("crypto");
const express = require("express");
const router = express.Router();

function newTraceId() {
  return crypto.randomBytes(3).toString("hex");
}
const { safeQuery, withTransaction } = require("../db/pool");
const { sendJson } = require("../utils/respond");
const { withHandler } = require("../utils/observability");
const { buildOrderPlan } = require("../utils/orderPlan");
const multer = require("multer");
const {
  DASHSCOPE_API_KEY,
  DASHSCOPE_BASE_URL,
  QWEN_VL_MODEL,
  MAX_FILE_SIZE,
  AI_IMAGE_TIMEOUT_MS,
} = require("../utils/constants");
const { parseStructuredText } = require("../utils/text-parser");
const { logger } = require("../utils/logger");
const { PALETTE_ALL } = require("../utils/palette");
const { extractJsonFromText } = require("../utils/helpers");

const VALID_CODES = new Set(PALETTE_ALL.map(c => c.code.toUpperCase()));
const ORDER_CODE_RE = /^[a-z0-9-]{1,64}$/i;

const ORDER_CODE_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
function generateOrderCode() {
  const bytes = crypto.randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i++) raw += ORDER_CODE_CHARS[bytes[i] % ORDER_CODE_CHARS.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

const aiImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});
const AI_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// ====== AI 图片识别提示词 ======
const AI_IMAGE_SYSTEM_PROMPT = `你是"拼豆补豆需求解析器（图片直读版）"。我会给你一张图片（可能是备忘录截图、聊天截图、手写清单照片、表格截图等），内容包含若干条"色号 + 数量"。请你直接从图片中提取补豆需求并格式化输出。

## 最终输出要求
- 只输出 JSON
- JSON 只允许包含两个字段：
  a. items（必有）：字符串数组，每个元素格式严格为 "A1 10g"（色号 + 空格 + 克数g）
  b. warning（可选）：一段中文文字，描述识别异常与自动处理；若没有任何异常则不要输出 warning 字段
- 除 JSON 外不要输出任何解释文字
- items 内按色号字典序排序（A1, A2, ..., Z8）
- items 中不允许出现 0g

## 色号白名单（仅支持这些色号，其他一律删除）
A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12,A13,A14,A15,A16,A17,A18,A19,A20,A21,A22,A23,A24,A25,A26,
B1,B2,B3,B4,B5,B6,B7,B8,B9,B10,B11,B12,B13,B14,B15,B16,B17,B18,B19,B20,B21,B22,B23,B24,B25,B26,B27,B28,B29,B30,B31,B32,
C1,C2,C3,C4,C5,C6,C7,C8,C9,C10,C11,C12,C13,C14,C15,C16,C17,C18,C19,C20,C21,C22,C23,C24,C25,C26,C27,C28,C29,
D1,D2,D3,D4,D5,D6,D7,D8,D9,D10,D11,D12,D13,D14,D15,D16,D17,D18,D19,D20,D21,D22,D23,D24,D25,D26,
E1,E2,E3,E4,E5,E6,E7,E8,E9,E10,E11,E12,E13,E14,E15,E16,E17,E18,E19,E20,E21,E22,E23,E24,
F1,F2,F3,F4,F5,F6,F7,F8,F9,F10,F11,F12,F13,F14,F15,F16,F17,F18,F19,F20,F21,F22,F23,F24,F25,
G1,G2,G3,G4,G5,G6,G7,G8,G9,G10,G11,G12,G13,G14,G15,G16,G17,G18,G19,G20,G21,
H1,H2,H3,H4,H5,H6,H7,H8,H9,H10,H11,H12,H13,H14,H15,H16,H17,H18,H19,H20,H21,H22,H23,
M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12,M13,M14,M15,
P1,P2,P3,P4,P5,P6,P7,P8,P9,P10,P11,P12,P13,P14,P15,P16,P17,P18,P19,P20,P21,P22,P23,
Q1,Q2,Q3,Q4,Q5,
R1,R2,R3,R4,R5,R6,R7,R8,R9,R10,R11,R12,R13,R14,R15,R16,R17,R18,R19,R20,R21,R22,R23,R24,R25,R26,R27,R28,
T1,
Y1,Y2,Y3,Y4,Y5,
Z1,Z2,Z3,Z4,Z5,Z6,Z7,Z8

## 识别规则（直接从图片读取）
1. 你需要从图片中识别每个条目：色号 + 数量。条目可能以：
   - 同行：A1 10g
   - 分行：A1（换行）10g
   - 表格：左列色号右列数量
   - 列表：A1：10g / A1-10g / A1=10g
   - 连续串：A1 10g C21 20g H3 40g
   - 手写：需谨慎，宁可删也不要瞎猜
2. 色号识别：
   - 色号大小写不敏感，输出统一大写
   - 只允许白名单内色号；不在白名单的一律删除
   - 若图片中字形模糊导致色号不确定（如 A1 vs A7 / B8 vs B3 等），不要强行猜测：删除并在 warning 标注为"无法确认色号"
3. 数量识别（可能是克或颗）：
   - 克：10g / 10 g / 10克
   - 颗：1000 / 1000颗 / 1000粒（也可能不写单位）
   - 若无单位数字：默认按"颗"
   - 支持乘法表达：2*500、2×500、2x500 → 1000（适用于颗或克的数值部分）
   - 若数量模糊/缺失/无法解析：删除该色号条目并在 warning 标注为"数量缺失/无法解析"
4. 换算规则：10g = 1000颗（1g = 100颗）
   - 如果输入是"颗"，先换算克：grams_raw = beads / 100
   - 如果输入是"克"，grams_raw = 输入克数
5. 合并同色号：
   - 同色号出现多次，先转 grams_raw 后求和得到 grams_raw_total
6. 规格与取整（仅对保留且 grams_raw_total > 0 的色号执行）：
   - 最大规格 5000g：若 grams_raw_total > 5000，则最终输出 5000g（截断）
   - 若 grams_raw_total 不是 10g 的倍数：按"近1法"向上进位到下一个 10g
     例：10.0→10g；10.1→20g；19.9→20g；20.0→20g
7. 删除规则（这些都不能进入 items）：
   - 色号不在白名单
   - 色号无法确认（图片模糊/歧义）
   - 数量缺失/无法解析
   - 计算后 grams_raw_total 为 0（items 不允许出现 0g）

## warning 字段生成规则（仅当存在异常时输出）
warning 是一段中文文字，可包含 1~3 段信息（按出现情况拼接，用分号隔开）：
1. 自动删除（包含：不支持色号、色号无法确认、数量缺失/无法解析/为0）：
   「以下色号已自动删除：A55、F87、【A1:色号不支持】、【B2:无法解析】、【C3:数量为0】、【D4:无法确认色号】」
2. 非10倍数被自动调整（列出最终值）：
   「以下色号数量不是10的倍数已自动调整：【A1:20g】、【B2:40g】」
3. 超过5000g被截断：
   「以下色号超出最大规格已自动修改数量：【B4:5000g】、【C19:5000g】」
- 列表中的色号按字典序；同类信息内用中文顿号"、"分隔
- 如果没有任何异常：不要输出 warning 字段

## 示例1（覆盖过滤/进位/截断/合并）
（假设图片内容等价于以下文本）
A1 10g
a1 1000
B4 6000g
A55 20g
C21 1010
H3 19.9g
输出：
{"items":["A1 20g","B4 5000g","C21 20g","H3 20g"],"warning":"以下色号已自动删除：【A55:色号不支持】；以下色号数量不是10的倍数已自动调整：【C21:20g】、【H3:20g】；以下色号超出最大规格已自动修改数量：【B4:5000g】"}

## 示例2（无异常则不输出 warning）
（假设图片内容等价于以下文本）
A2 20g C1 1000 H10 30克
输出：
{"items":["A2 20g","C1 10g","H10 30g"]}

## 示例3（数量异常/为0 删除，不允许输出0g）
（假设图片内容等价于以下文本）
A1
B2 0
C3 0g
D4 一些
输出：
{"items":[],"warning":"以下色号已自动删除：【A1:数量为0】、【B2:数量为0】、【C3:数量为0】、【D4:无法解析】"}

## 现在开始从图片中解析并输出`;

/** parseItemStrings — still used by ai-image path */
function parseItemStrings(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const it of items) {
    let code, qty;
    if (typeof it === "string") {
      const m = it.match(/^([A-Za-z]\d+)\s+(\d+)g?$/);
      if (!m) continue;
      code = m[1].toUpperCase();
      qty = parseInt(m[2], 10);
    } else if (it && typeof it === "object" && it.code) {
      code = String(it.code).toUpperCase();
      qty = parseInt(it.qty, 10) || 0;
    } else {
      continue;
    }
    if (qty > 0 && VALID_CODES.has(code)) {
      out.push({ code, qty });
    }
  }
  return out;
}

/**
 * POST /api/shop/order
 * 保存补豆口令和明细到数据库
 *
 * Body:
 * - code: string (optional) — 已有口令（修改模式）；省略则由服务端生成
 * - items: array       — [{code, qty}]  色号和克数
 * - brandType: string  — "mard" | "catshop"
 * - clientSubmitId: string (optional) — 客户端幂等键（防重复创建）
 * - rowVersion: number (optional) — 乐观锁版本号（修改模式时传入）
 */
router.post("/api/shop/order", withHandler("shopOrder", async (req, res) => {
  const { code, items, brandType, clientSubmitId, rowVersion } = req.body || {};
  const { vStr: _vStr, vArray: _vArr, vEnum: _vEnum } = require("../utils/validate");

  const brandT = _vEnum(brandType, ["mard", "catshop"]).ok ? brandType : "mard";

  const itemsCheck = _vArr(items, { min: 1, max: 500, label: "色号明细" });
  if (!itemsCheck.ok) return sendJson(res, 400, { ok: false, message: itemsCheck.message });

  const normalizedItems = [];
  for (const item of items) {
    if (!item || typeof item.code !== "string" || !item.code.trim() || item.code.length > 10) {
      return sendJson(res, 400, { ok: false, message: "色号明细中存在无效色号" });
    }
    const normalizedCode = item.code.toUpperCase();
    if (!VALID_CODES.has(normalizedCode)) {
      return sendJson(res, 400, { ok: false, message: `色号 ${item.code} 不在支持列表中` });
    }
    const normalizedQty = Number(item.qty);
    if (!Number.isInteger(normalizedQty) || normalizedQty <= 0 || normalizedQty > 10000) {
      return sendJson(res, 400, { ok: false, message: `色号 ${item.code} 的数量无效` });
    }
    normalizedItems.push({ code: normalizedCode, qty: normalizedQty });
  }

  // Load live spec config for server-side plan computation
  let availableSpecs = { 20: true, 50: true, 100: true };
  try {
    const [cfgRows] = await safeQuery("SELECT config_value FROM shop_config WHERE config_key = 'available_specs' LIMIT 1");
    if (cfgRows && cfgRows[0]) availableSpecs = JSON.parse(cfgRows[0].config_value);
  } catch (e) { logger.warn({ error: e.message }, "load available_specs for plan"); }

  const canonicalPlan = buildOrderPlan(normalizedItems, availableSpecs);
  const planJson = JSON.stringify({ specTotals: canonicalPlan.specTotals, perItem: canonicalPlan.perItem.map(p => ({ code: p.code, qty: p.qty, split: p.split })) });
  const itemsJson = JSON.stringify(normalizedItems);
  const totalQ = normalizedItems.reduce((s, i) => s + i.qty, 0);
  const colorC = normalizedItems.length;

  const submitId = clientSubmitId && typeof clientSubmitId === "string" ? clientSubmitId.trim().slice(0, 64) : null;

  // Idempotency: if clientSubmitId already exists, return the existing order
  if (submitId) {
    const [dupRows] = await safeQuery(
      `SELECT id, order_code, row_version FROM shop_orders WHERE client_submit_id = ? LIMIT 1`,
      [submitId]
    );
    if (dupRows && dupRows.length > 0) {
      return sendJson(res, 200, { ok: true, id: dupRows[0].id, code: dupRows[0].order_code, rowVersion: dupRows[0].row_version, idempotent: true });
    }
  }

  // Modify existing order (code provided)
  if (code && typeof code === "string" && code.trim()) {
    const trimmedCode = code.trim();
    if (!ORDER_CODE_RE.test(trimmedCode)) {
      return sendJson(res, 400, { ok: false, message: "补豆口令格式无效" });
    }

    const result = await withTransaction(async (conn) => {
      const [existing] = await conn.query(
        `SELECT id, status, row_version FROM shop_orders WHERE order_code = ? LIMIT 1 FOR UPDATE`,
        [trimmedCode]
      );
      if (!existing || existing.length === 0) {
        return { status: 404, body: { ok: false, message: "未找到该订单" } };
      }
      const row = existing[0];
      if (row.status === "confirmed") {
        return { status: 403, body: { ok: false, message: "客服已确认订单，无法修改" } };
      }
      if (rowVersion !== undefined && rowVersion !== null && Number(rowVersion) !== row.row_version) {
        return { status: 409, body: { ok: false, message: "订单已被更新，请刷新后重试", currentVersion: row.row_version } };
      }
      await conn.query(
        `UPDATE shop_orders SET items_json = ?, plan_json = ?, total_qty = ?, color_count = ?, brand_type = ?,
         row_version = row_version + 1, updated_at = NOW()
         WHERE id = ? AND status = 'pending'`,
        [itemsJson, planJson, totalQ, colorC, brandT, row.id]
      );
      return { status: 200, body: { ok: true, id: row.id, code: trimmedCode, rowVersion: row.row_version + 1, updated: true } };
    });
    return sendJson(res, result.status, result.body);
  }

  // Create new order — server generates code
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const newCode = generateOrderCode();
    try {
      const [result] = await safeQuery(
        `INSERT INTO shop_orders (order_code, user_id, items_json, plan_json, total_qty, color_count, brand_type, client_submit_id, row_version)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 1)`,
        [newCode, itemsJson, planJson, totalQ, colorC, brandT, submitId || null]
      );
      return sendJson(res, 200, { ok: true, id: result.insertId, code: newCode, rowVersion: 1 });
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") {
        if (e.message.includes("uk_client_submit_id") && submitId) {
          const [existing] = await safeQuery(`SELECT id, order_code, row_version FROM shop_orders WHERE client_submit_id = ? LIMIT 1`, [submitId]);
          if (existing && existing.length > 0) {
            return sendJson(res, 200, { ok: true, id: existing[0].id, code: existing[0].order_code, rowVersion: existing[0].row_version, idempotent: true });
          }
        }
        if (attempt < maxRetries) continue;
        return sendJson(res, 409, { ok: false, message: "口令冲突，请重试" });
      }
      throw e;
    }
  }
}));

/**
 * GET /api/shop/order/:code
 * 根据补豆口令或淘宝订单号查询订单详情（严格匹配）
 */
router.get("/api/shop/order/:code", withHandler("shopOrderQuery", async (req, res) => {
  const code = (req.params.code || "").trim();
  if (!code) {
    return sendJson(res, 400, { ok: false, message: "请输入补豆口令或淘宝订单号" });
  }

  let [rows] = await safeQuery(
    `SELECT id, order_code, user_id, items_json, plan_json, total_qty, color_count, brand_type, status, created_at, updated_at, row_version
     FROM shop_orders WHERE order_code = ? LIMIT 1`,
    [code]
  );

  if (!rows || rows.length === 0) {
    [rows] = await safeQuery(
      `SELECT id, order_code, user_id, items_json, plan_json, total_qty, color_count, brand_type, status, created_at, updated_at, row_version
       FROM shop_orders WHERE taobao_order_no = ? ORDER BY created_at DESC`,
      [code]
    );
  }

  if (!rows || rows.length === 0) {
    return sendJson(res, 404, { ok: false, message: "未找到对应的补豆清单，请检查口令或订单号是否正确" });
  }

  // 淘宝订单号匹配到多条时返回列表供用户选择
  if (rows.length > 1) {
    return sendJson(res, 200, {
      ok: true,
      multiple: true,
      list: rows.map(r => ({
        id: r.id,
        code: r.order_code,
        totalQty: r.total_qty,
        colorCount: r.color_count,
        brandType: r.brand_type || "mard",
        status: r.status || "pending",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  }

  const row = rows[0];
  let items = [];
  try { items = typeof row.items_json === "string" ? JSON.parse(row.items_json) : row.items_json; } catch (e) { logger.warn({ orderId: row.id, error: e.message }, "items_json parse failed"); }
  let plan = null;
  try { plan = row.plan_json ? (typeof row.plan_json === "string" ? JSON.parse(row.plan_json) : row.plan_json) : null; } catch (e) { logger.warn({ orderId: row.id, error: e.message }, "plan_json parse failed"); }

  sendJson(res, 200, {
    ok: true,
    data: {
      id: row.id,
      code: row.order_code,
      items,
      plan,
      totalQty: row.total_qty,
      colorCount: row.color_count,
      brandType: row.brand_type || "mard",
      status: row.status || "pending",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rowVersion: row.row_version || 1,
    },
  });
}));

/**
 * POST /api/shop/ai-text
 * AI 识别文字：将用户粘贴的补豆需求文本发给大模型解析
 *
 * Body:
 * - text: string — 用户粘贴的原始文本
 */
router.post("/api/shop/ai-text", withHandler("shopAiText", async (req, res) => {
  const { text } = req.body || {};

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return sendJson(res, 400, { ok: false, message: "请输入补豆需求文本" });
  }
  if (text.length > 5000) {
    return sendJson(res, 400, { ok: false, message: "文本过长，请控制在5000字以内" });
  }

  const result = parseStructuredText(text.trim());

  sendJson(res, 200, {
    ok: true,
    items: result.items,
    warning: result.warning || undefined,
    parseMode: result.parseMode,
    status: result.status,
    needsReview: result.status !== "ok",
    unparsedSegments: result.unparsedSegments.length ? result.unparsedSegments : undefined,
    suggestion: result.suggestion || undefined,
  });
}));

/**
 * POST /api/shop/ai-image
 * AI 识别图片：将用户上传的补豆需求图片发给视觉大模型解析
 *
 * Body: multipart/form-data
 * - image: File — 用户上传的图片
 */
router.post("/api/shop/ai-image", (req, res, next) => {
  aiImageUpload.single("image")(req, res, (err) => {
    const traceId = newTraceId();
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return sendJson(res, 413, { ok: false, message: "图片文件过大，最大支持 5MB", errorCode: "IMG-S002", traceId });
      }
      return sendJson(res, 400, { ok: false, message: err.message || "文件上传失败", errorCode: "IMG-S001", traceId });
    }
    next();
  });
}, withHandler("shopAiImage", async (req, res) => {
  const traceId = newTraceId();
  if (!DASHSCOPE_API_KEY) {
    return sendJson(res, 500, { ok: false, message: "AI识别服务未配置，请联系管理员", errorCode: "IMG-S103", traceId });
  }
  if (!req.file) {
    return sendJson(res, 400, { ok: false, message: "请上传图片", errorCode: "IMG-S001", traceId });
  }
  if (!AI_IMAGE_TYPES.has(String(req.file.mimetype || ""))) {
    return sendJson(res, 400, { ok: false, message: "不支持的图片格式，仅支持 JPG/PNG/WebP", errorCode: "IMG-S003", traceId });
  }

  try {
    const b64 = req.file.buffer.toString("base64");
    const dataUrl = `data:${req.file.mimetype};base64,${b64}`;

    logger.info({ traceId, fileSize: req.file.buffer.length, mimetype: req.file.mimetype }, "shop ai-image request");

    const url = `${DASHSCOPE_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
    const payload = {
      model: QWEN_VL_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: AI_IMAGE_SYSTEM_PROMPT },
        ],
      }],
      temperature: 0.1,
    };

    const startMs = Date.now();
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(AI_IMAGE_TIMEOUT_MS),
    });

    const raw = await resp.text();
    if (!resp.ok) {
      logger.error({ traceId, httpStatus: resp.status, bodySnippet: raw.slice(0, 300) }, "shop ai-image DashScope non-200");
      return sendJson(res, 502, { ok: false, message: "AI服务暂时不可用，请稍后再试", errorCode: "IMG-S105", traceId });
    }

    let data = null;
    try { data = JSON.parse(raw); } catch {
      logger.error({ traceId, rawSnippet: raw.slice(0, 300) }, "shop ai-image parse failed");
      return sendJson(res, 502, { ok: false, message: "AI响应解析失败，请重试", errorCode: "IMG-S106", traceId });
    }
    const textOut = data?.choices?.[0]?.message?.content ?? raw;

    const parsed = extractJsonFromText(textOut);
    if (!parsed) {
      return sendJson(res, 502, { ok: false, message: "AI未能正确识别图片内容，请确保图片清晰后重试", errorCode: "IMG-S107", traceId });
    }

    const items = parseItemStrings(parsed.items || []);
    const durationMs = Date.now() - startMs;
    logger.info({ traceId, durationMs, itemCount: items.length }, "shop ai-image success");

    const result = { ok: true, items, traceId };
    if (parsed.warning) {
      result.warning = String(parsed.warning);
    }

    sendJson(res, 200, result);
  } catch (e) {
    const errorCode = e?.name === "TimeoutError" || e?.code === "ABORT_ERR" ? "IMG-S104" : "IMG-S108";
    logger.error({ traceId, errorCode, errorMessage: e?.message }, "shopAiImage failed");
    if (e?.name === "TimeoutError" || e?.code === "ABORT_ERR") {
      return sendJson(res, 504, { ok: false, message: "AI识别超时，请稍后再试", errorCode: "IMG-S104", traceId });
    }
    sendJson(res, 500, { ok: false, message: "AI识别服务异常，请稍后再试", errorCode: "IMG-S108", traceId });
  }
}));

/**
 * GET /api/shop/spec-config
 * 获取规格上下架配置（公开接口）
 */
router.get("/api/shop/spec-config", withHandler("shopSpecConfig", async (req, res) => {
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
 * GET /api/shop/disabled-codes
 * 获取下架色号列表（公开接口）
 */
router.get("/api/shop/disabled-codes", withHandler("shopDisabledCodes", async (req, res) => {
  const [rows] = await safeQuery(
    "SELECT config_value FROM shop_config WHERE config_key = 'disabled_codes' LIMIT 1"
  );
  let codes = [];
  if (rows && rows[0]) {
    try { codes = JSON.parse(rows[0].config_value); } catch (e) { logger.warn({ key: "disabled_codes", error: e.message }, "config parse failed"); }
  }
  sendJson(res, 200, { ok: true, data: Array.isArray(codes) ? codes : [] });
}));

module.exports = router;
