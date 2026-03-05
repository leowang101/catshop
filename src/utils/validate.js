// @ts-check
"use strict";

/**
 * 通用输入验证工具
 * 提供类型检查、范围验证、格式校验等常用函数
 */

/** @typedef {{ ok: true, value: string } | { ok: false, message: string }} VStrResult */
/** @typedef {{ ok: true, value: number } | { ok: false, message: string }} VNumResult */
/** @typedef {{ ok: true, value: boolean } | { ok: false, message: string }} VBoolResult */
/** @typedef {{ ok: true, value: any } | { ok: false, message: string }} VResult */
/** @typedef {{ ok: true, values: Record<string, any> } | { ok: false, message: string }} ValidateResult */

/**
 * 验证字符串：trim + 类型 + 长度范围
 * @param {any} value
 * @param {{ min?: number, max?: number, trim?: boolean, label?: string }} [opts]
 * @returns {VStrResult}
 */
function vStr(value, { min = 0, max = 256, trim = true, label = "参数" } = {}) {
  if (value === null || value === undefined) {
    if (min > 0) return { ok: false, message: `${label}不能为空` };
    return { ok: true, value: "" };
  }
  if (typeof value !== "string") return { ok: false, message: `${label}必须是字符串` };
  const v = trim ? value.trim() : value;
  if (v.length < min) return { ok: false, message: `${label}不能为空` };
  if (v.length > max) return { ok: false, message: `${label}长度不能超过${max}` };
  return { ok: true, value: v };
}

/**
 * 验证整数：类型 + 范围
 * @param {any} value
 * @param {{ min?: number, max?: number, label?: string }} [opts]
 * @returns {VNumResult}
 */
function vInt(value, { min = 0, max = 2147483647, label = "参数" } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return { ok: false, message: `${label}必须是整数` };
  }
  if (num < min) return { ok: false, message: `${label}不能小于${min}` };
  if (num > max) return { ok: false, message: `${label}不能大于${max}` };
  return { ok: true, value: num };
}

/**
 * 验证正数（可以是小数）
 * @param {any} value
 * @param {{ max?: number, label?: string }} [opts]
 * @returns {VNumResult}
 */
function vPositiveNum(value, { max = 1e9, label = "参数" } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return { ok: false, message: `${label}必须大于0` };
  }
  if (num > max) return { ok: false, message: `${label}不能大于${max}` };
  return { ok: true, value: num };
}

/**
 * 验证布尔值
 * @param {any} value
 * @param {{ label?: string }} [opts]
 * @returns {VBoolResult}
 */
function vBool(value, { label = "参数" } = {}) {
  if (typeof value === "boolean") return { ok: true, value };
  if (value === 1 || value === "1" || value === "true") return { ok: true, value: true };
  if (value === 0 || value === "0" || value === "false") return { ok: true, value: false };
  return { ok: false, message: `${label}必须是布尔值` };
}

/**
 * 验证枚举值（白名单）
 * @param {any} value
 * @param {Set<any> | any[]} allowed
 * @param {{ label?: string }} [opts]
 * @returns {VResult}
 */
function vEnum(value, allowed, { label = "参数" } = {}) {
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  if (!set.has(value)) {
    return { ok: false, message: `${label}的值无效` };
  }
  return { ok: true, value };
}

/**
 * 验证数组：类型 + 长度
 * @param {any} value
 * @param {{ min?: number, max?: number, label?: string }} [opts]
 * @returns {{ ok: true, value: any[] } | { ok: false, message: string }}
 */
function vArray(value, { min = 0, max = 1000, label = "参数" } = {}) {
  if (!Array.isArray(value)) return { ok: false, message: `${label}必须是数组` };
  if (value.length < min) return { ok: false, message: `${label}不能为空` };
  if (value.length > max) return { ok: false, message: `${label}长度不能超过${max}` };
  return { ok: true, value };
}

/**
 * 验证对象：非 null 对象 + 可选大小限制
 * @param {any} value
 * @param {{ maxKeys?: number, label?: string }} [opts]
 * @returns {{ ok: true, value: Record<string, any> } | { ok: false, message: string }}
 */
function vObject(value, { maxKeys = 100, label = "参数" } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: `${label}必须是对象` };
  }
  if (Object.keys(value).length > maxKeys) {
    return { ok: false, message: `${label}字段数不能超过${maxKeys}` };
  }
  return { ok: true, value };
}

/**
 * 批量验证器 — 一次性验证多个字段，遇到第一个错误立即返回
 * @param {Record<string, VResult>} fields - { fieldName: validationResult }
 * @returns {ValidateResult}
 */
function validate(fields) {
  const values = {};
  for (const [key, result] of Object.entries(fields)) {
    if (!result.ok) {
      return { ok: false, message: /** @type {{ ok: false, message: string }} */(result).message };
    }
    values[key] = /** @type {{ ok: true, value: any }} */(result).value;
  }
  return { ok: true, values };
}

module.exports = {
  vStr,
  vInt,
  vPositiveNum,
  vBool,
  vEnum,
  vArray,
  vObject,
  validate,
};
