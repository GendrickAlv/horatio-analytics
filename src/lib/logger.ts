import pino, { type Logger } from "pino";

// Single shared logger. JSON output in production; respects LOG_LEVEL when set.
// Kept dependency-light on purpose: no pino-pretty / transports — those bloat
// the runtime bundle and are noisy in container logs.
export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "horatio-analytics" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
