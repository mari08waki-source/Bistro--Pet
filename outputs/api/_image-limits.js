import { imageRedisCommand } from "./_image-redis.js";

const defaultLimits = {
  customRecipe: { limit: Number(process.env.IMAGE_DAILY_LIMIT_CUSTOM_RECIPE || 1), period: "day" },
  chefSuggestion: { limit: Number(process.env.IMAGE_DAILY_LIMIT_CHEF_SUGGESTION || 1), period: "day" },
  weeklyPlan: { limit: Number(process.env.IMAGE_WEEKLY_LIMIT_WEEKLY_PLAN || 1), period: "week" }
};

const memoryUsage = globalThis.__bistropetImageLimitUsage || new Map();
globalThis.__bistropetImageLimitUsage = memoryUsage;

function periodKey(period, now = new Date()) {
  if (period === "week") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const days = Math.floor((now - start) / 86400000);
    const week = Math.ceil((days + start.getUTCDay() + 1) / 7);
    return `${now.getUTCFullYear()}-w${String(week).padStart(2, "0")}`;
  }
  return now.toISOString().slice(0, 10);
}

function periodSeconds(period, now = new Date()) {
  if (period === "week") return 8 * 24 * 60 * 60;
  const nextDay = new Date(now);
  nextDay.setUTCHours(24, 0, 0, 0);
  return Math.max(60, Math.ceil((nextDay - now) / 1000));
}

export async function checkImageLimit({ generationType, clientId }) {
  const config = defaultLimits[generationType];
  if (!config) throw new Error("Invalid image generation type.");
  const key = periodKey(config.period);
  const safeClientId = String(clientId || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
  if (!safeClientId) throw new Error("A verified image client is required.");
  const path = `bistropet:image-usage:${safeClientId}:${generationType}:${key}`;
  let count;
  if (process.env.IMAGE_LIMIT_STORAGE === "memory") {
    count = Number(memoryUsage.get(path) || 0) + 1;
    memoryUsage.set(path, count);
  } else {
    count = Number(await imageRedisCommand(["INCR", path]));
    if (count === 1) await imageRedisCommand(["EXPIRE", path, String(periodSeconds(config.period))]);
  }
  if (count > config.limit) {
    return {
      allowed: false,
      limit: config.limit,
      period: config.period,
      remaining: 0
    };
  }
  return {
    allowed: true,
    limit: config.limit,
    period: config.period,
    remaining: Math.max(0, config.limit - count)
  };
}
