import { head, put } from "@vercel/blob";
import crypto from "node:crypto";

const memoryImages = globalThis.__bistropetImageCache || new Map();
globalThis.__bistropetImageCache = memoryImages;

export function imageCacheKey(combination) {
  const payload = (combination || []).map(item => String(item || "").trim()).filter(Boolean).join("+");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function getCachedImage(cacheKey) {
  if (process.env.IMAGE_STORAGE_MODE === "memory") return memoryImages.get(cacheKey) || null;
  try {
    const blob = await head(`recipe-images/${cacheKey}.png`);
    return blob.url;
  } catch (error) {
    return null;
  }
}

export async function saveCachedImage(cacheKey, imageBuffer) {
  if (process.env.IMAGE_STORAGE_MODE === "memory") {
    const imageUrl = `memory://recipe-images/${cacheKey}.png`;
    memoryImages.set(cacheKey, imageUrl);
    return imageUrl;
  }
  const blob = await put(`recipe-images/${cacheKey}.png`, imageBuffer, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false
  });
  return blob.url;
}
