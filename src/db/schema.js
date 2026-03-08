"use strict";

const { safeQuery } = require("./pool");
const { logger } = require("../utils/logger");
const { MARD_TO_CATSHOP } = require("../utils/catshop-mapping");

async function ensureSchema() {
  await safeQuery(`
    CREATE TABLE IF NOT EXISTS shop_config (
      config_key VARCHAR(64) NOT NULL PRIMARY KEY,
      config_value TEXT NOT NULL,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS shop_orders (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_code VARCHAR(64) NOT NULL,
      user_id BIGINT NULL,
      items_json JSON NOT NULL,
      plan_json JSON NULL,
      total_qty INT NOT NULL DEFAULT 0,
      color_count INT NOT NULL DEFAULT 0,
      taobao_order_no VARCHAR(64) NULL,
      brand_type VARCHAR(16) NOT NULL DEFAULT 'mard',
      status ENUM('pending','confirmed') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_order_code (order_code),
      KEY idx_shop_orders_created (created_at),
      KEY idx_shop_orders_status_created (status, created_at),
      KEY idx_shop_orders_taobao (taobao_order_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS catshop_mapping (
      mard_code VARCHAR(16) NOT NULL PRIMARY KEY,
      catshop_code VARCHAR(16) NOT NULL,
      UNIQUE KEY uk_catshop_code (catshop_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS shop_download_logs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id BIGINT NOT NULL,
      method ENUM('single','merge') NOT NULL,
      related_order_ids_json JSON NULL,
      downloaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_shop_download_logs_order_time (order_id, downloaded_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const addColumnIfMissing = async (col, ddl) => {
    try { await safeQuery(`ALTER TABLE shop_orders ADD COLUMN ${ddl}`); }
    catch (e) { if (!e.message.includes("Duplicate column")) logger.warn({ error: e.message }, `ALTER TABLE add ${col}`); }
  };
  await addColumnIfMissing("download_count", "download_count INT NOT NULL DEFAULT 0");
  await addColumnIfMissing("row_version", "row_version INT NOT NULL DEFAULT 1");
  await addColumnIfMissing("client_submit_id", "client_submit_id VARCHAR(64) NULL");

  try {
    await safeQuery(`CREATE UNIQUE INDEX uk_client_submit_id ON shop_orders (client_submit_id)`);
  } catch (e) {
    if (!e.message.includes("Duplicate key name")) logger.warn({ error: e.message }, "CREATE INDEX uk_client_submit_id");
  }

  // Seed catshop_mapping
  const entries = Object.entries(MARD_TO_CATSHOP);
  if (entries.length > 0) {
    const placeholders = entries.map(() => "(?,?)").join(",");
    const params = entries.flatMap(([m, c]) => [m, c]);
    try {
      await safeQuery(
        "INSERT INTO catshop_mapping(mard_code, catshop_code) VALUES " + placeholders +
        " ON DUPLICATE KEY UPDATE catshop_code = VALUES(catshop_code)",
        params
      );
    } catch (e) {
      logger.warn({ error: e.message }, "catshop_mapping seed");
    }
  }

  logger.info("Schema ensured");
}

module.exports = { ensureSchema };
