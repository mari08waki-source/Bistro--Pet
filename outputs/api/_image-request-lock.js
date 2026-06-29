import crypto from "node:crypto";
import { imageRedisCommand } from "./_image-redis.js";

const activeRequests = globalThis.__bistropetImageRequests || new Set();
globalThis.__bistropetImageRequests = activeRequests;

async function withMemoryLock(key, task) {
  if (activeRequests.has(key)) {
    const error = new Error("An image request is already in progress.");
    error.code = "IMAGE_REQUEST_IN_PROGRESS";
    throw error;
  }
  activeRequests.add(key);
  try {
    return await task();
  } finally {
    activeRequests.delete(key);
  }
}

export async function withImageRequestLock(key, task) {
  if (process.env.IMAGE_LOCK_STORAGE === "memory") return withMemoryLock(key, task);

  const lockKey = `bistropet:image-lock:${key}`;
  const token = crypto.randomUUID();
  const acquired = await imageRedisCommand(["SET", lockKey, token, "NX", "EX", "180"]);
  if (acquired !== "OK") {
    const error = new Error("An image request is already in progress.");
    error.code = "IMAGE_REQUEST_IN_PROGRESS";
    throw error;
  }

  try {
    return await task();
  } finally {
    try {
      await imageRedisCommand([
        "EVAL",
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        "1",
        lockKey,
        token
      ]);
    } catch (error) {
      console.info("[bistropet:image-lock]", JSON.stringify({
        event: "release_failed",
        key,
        error: error.message
      }));
    }
  }
}
