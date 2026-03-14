"use strict";

function getBuildTag() {
  try {
    const { execSync } = require("child_process");
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch { return `v${Date.now()}`; }
}

const BUILD_TAG = getBuildTag();
const PORT = Number(process.env.PORT || 3020);
const SERVE_FRONTEND = String(process.env.SERVE_FRONTEND || "true").toLowerCase() !== "false";

const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASS = process.env.DB_PASS;
const DB_NAME = process.env.DB_NAME;
const DB_PORT = Number(process.env.DB_PORT || 3306);

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1";
const QWEN_VL_MODEL = process.env.QWEN_VL_MODEL || "qwen-vl-plus";
const QWEN_TEXT_MODEL = process.env.QWEN_TEXT_MODEL || "qwen-plus";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const AI_IMAGE_TIMEOUT_MS = 180_000;
const AI_TEXT_TIMEOUT_MS = 90_000;

const DEFAULT_PAGE_SIZE = 20;
const ADMIN_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const PARTNER_API_SECRET = process.env.PARTNER_API_SECRET || "";
const PARTNER_API_BASE_URL = (process.env.PARTNER_API_BASE_URL || "https://aidoucang.cn").replace(/\/+$/, "");

module.exports = {
  BUILD_TAG, PORT, SERVE_FRONTEND,
  DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT,
  DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL, QWEN_VL_MODEL, QWEN_TEXT_MODEL,
  MAX_FILE_SIZE, AI_IMAGE_TIMEOUT_MS, AI_TEXT_TIMEOUT_MS,
  DEFAULT_PAGE_SIZE, ADMIN_TOKEN_MAX_AGE,
  PARTNER_API_SECRET, PARTNER_API_BASE_URL,
};
