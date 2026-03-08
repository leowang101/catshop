"use strict";

const SPEC_SPECIAL_KEY = "10s";

const SPEC_PRICES = { 10: 1.5, 20: 2.8, 50: 6.9, 100: 13.8, [SPEC_SPECIAL_KEY]: 3.4 };

const ORDER_SPECS = [100, 50, 20, 10];

const SPECIAL_SERIES_PREFIXES = ["Q", "Y", "Z"];

const ALL_SPEC_KEYS = [100, 50, 20, 10, SPEC_SPECIAL_KEY];

function isSpecialCode(code) {
  const upper = String(code).toUpperCase();
  return SPECIAL_SERIES_PREFIXES.some(
    (p) => upper.startsWith(p) && /\d/.test(upper.charAt(p.length))
  );
}

function getAvailableSpecs(availableSpecs) {
  const avail = availableSpecs || { 20: true, 50: true, 100: true };
  return ORDER_SPECS.filter((sp) => sp === 10 || avail[sp]);
}

function splitWeight(grams, isSpecial, availableSpecs) {
  const result = {};
  if (isSpecial) {
    const count = Math.floor(grams / 10);
    if (count > 0) result[SPEC_SPECIAL_KEY] = count;
    return result;
  }
  const specs = getAvailableSpecs(availableSpecs);
  let remaining = grams;
  for (const spec of specs) {
    const count = Math.floor(remaining / spec);
    if (count > 0) result[spec] = count;
    remaining = remaining % spec;
  }
  return result;
}

function buildOrderPlan(items, availableSpecs) {
  const perItem = [];
  const specTotals = { 100: 0, 50: 0, 20: 0, 10: 0, [SPEC_SPECIAL_KEY]: 0 };
  for (const it of items) {
    const code = it.code;
    const qty = it.qty || 0;
    const special = isSpecialCode(code);
    const split = splitWeight(qty, special, availableSpecs);
    perItem.push({ code, qty, split });
    for (const sp of ALL_SPEC_KEYS) specTotals[sp] += split[sp] || 0;
  }
  return { perItem, specTotals };
}

function calcTotalPrice(plan) {
  let total = 0;
  for (const sp of ALL_SPEC_KEYS) {
    const c = plan.specTotals[sp] || 0;
    if (c > 0) total += Number((SPEC_PRICES[sp] * c).toFixed(1));
  }
  return total;
}

module.exports = {
  SPEC_PRICES,
  ORDER_SPECS,
  SPECIAL_SERIES_PREFIXES,
  SPEC_SPECIAL_KEY,
  ALL_SPEC_KEYS,
  isSpecialCode,
  splitWeight,
  buildOrderPlan,
  calcTotalPrice,
};
