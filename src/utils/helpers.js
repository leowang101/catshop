"use strict";

function extractJsonFromText(s) {
  if (!s) return null;
  const str = String(s).trim();
  try { return JSON.parse(str); } catch {}
  const mObj = str.match(/\{[\s\S]*\}/);
  if (mObj) { try { return JSON.parse(mObj[0]); } catch {} }
  const mArr = str.match(/\[[\s\S]*\]/);
  if (mArr) { try { return JSON.parse(mArr[0]); } catch {} }
  return null;
}

module.exports = { extractJsonFromText };
