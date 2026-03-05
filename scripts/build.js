#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { minify: terserMinify } = require("terser");
const CleanCSS = require("clean-css");

const PUBLIC_DIR = path.join(__dirname, "..", "public");

const JS_FILES = ["js/shop-app.js"];
const CSS_FILES = ["css/base.css", "css/shop.css"];

function formatSize(bytes) {
  if (bytes < 1024) return bytes + "B";
  return (bytes / 1024).toFixed(1) + "KB";
}

async function build() {
  console.log("Building catshop assets...\n");

  for (const file of JS_FILES) {
    const src = path.join(PUBLIC_DIR, file);
    const dest = src.replace(/\.js$/, ".min.js");
    if (!fs.existsSync(src)) { console.log(`  SKIP ${file} (not found)`); continue; }
    const code = fs.readFileSync(src, "utf8");
    const result = await terserMinify(code, { compress: { passes: 2 }, mangle: true });
    if (result.code) {
      fs.writeFileSync(dest, result.code);
      console.log(`  JS  ${file}: ${formatSize(code.length)} → ${formatSize(result.code.length)}`);
    }
  }

  for (const file of CSS_FILES) {
    const src = path.join(PUBLIC_DIR, file);
    const dest = src.replace(/\.css$/, ".min.css");
    if (!fs.existsSync(src)) { console.log(`  SKIP ${file} (not found)`); continue; }
    const code = fs.readFileSync(src, "utf8");
    const result = new CleanCSS({ level: 2 }).minify(code);
    if (result.styles) {
      fs.writeFileSync(dest, result.styles);
      console.log(`  CSS ${file}: ${formatSize(code.length)} → ${formatSize(result.styles.length)}`);
    }
  }

  console.log("\nBuild complete!");
}

build().catch(e => { console.error(e); process.exit(1); });
