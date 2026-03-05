"use strict";
require("dotenv/config");
const { startServer } = require("./src/server");
const { logger } = require("./src/utils/logger");

startServer().catch((err) => {
  logger.fatal({ error: err?.message, stack: err?.stack }, "Catshop server failed to start");
  process.exit(1);
});
