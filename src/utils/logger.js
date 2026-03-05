"use strict";

const pino = require("pino");
const NODE_ENV = process.env.NODE_ENV || "development";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const logger = NODE_ENV === "development"
  ? pino({ level: LOG_LEVEL, transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" } } })
  : pino({ level: LOG_LEVEL, timestamp: pino.stdTimeFunctions.isoTime });

module.exports = { logger };
