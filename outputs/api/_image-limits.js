import { head, put } from "@vercel/blob";

const defaultLimits = {
  freeRecipe: { limit: Number(process.env.IMAGE_DAILY_LIMIT_FREE_RECIPE || 1), period: "day" },
  customRecipe: { limit: Number(process.env.IMAGE_DAILY_LIMIT_CUSTOM_RECIPE || 1), period: "day" },
  chefSuggestion: { limit: Number(process.env.IMAGE_DAILY_LIMIT_CHEF_SUGGESTION || 1), period: "day" },
  weeklyPlan: { limit: Number(process.env.IMAGE_WEEKLY_LIMIT_WEEKLY_PLAN || 1), period: "week" }
};

function periodKey(period, now = new Date()) {
  if (period === "week") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const days = Math.floor((now - start) / 86400000);
    const week = Math.ceil((days + start.getUTCDay() + 1) / 7);
    return `${now.getUTCFullYear()}-w${String(week).padStart(2, "0")}`;
  }
  return now.toISOString().slice(0, 10);
}

async function readUsage(path) {
  try {
    const blob = await head(path);
    const response = await fetch(blob.url);
    if (!response.ok) return { count: 0 };
    return await response.json();
  } catch (error) {
    return { count: 0 };
  }
}

async function writeUsage(path, usage) {
  await put(path, JSON.stringify(usage), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false
  });
}

export async function checkImageLimit({ generationType, clientId }) {
  const config = defaultLimits[generationType] || defaultLimits.freeRecipe;
  const key = periodKey(config.period);
  const safeClientId = String(clientId || "anonymous").replace(/[^a-z0-9_-]/gi, "").slice(0, 80) || "anonymous";
  const path = `image-usage/${safeClientId}/${generationType}-${key}.json`;
  const usage = await readUsage(path);
  if ((usage.count || 0) >= config.limit) {
    return {
      allowed: false,
      limit: config.limit,
      period: config.period,
      remaining: 0
    };
  }
  usage.count = (usage.count || 0) + 1;
  usage.updatedAt = new Date().toISOString();
  await writeUsage(path, usage);
  return {
    allowed: true,
    limit: config.limit,
    period: config.period,
    remaining: Math.max(0, config.limit - usage.count)
  };
}
