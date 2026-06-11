import { head, put } from "@vercel/blob";
import crypto from "node:crypto";

export function imageCacheKey(combination) {
  const payload = (combination || []).map(item => String(item || "").trim()).filter(Boolean).join("+");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function getCachedImage(cacheKey) {
  try {
    const blob = await head(`recipe-images/${cacheKey}.png`);
    return blob.url;
  } catch (error) {
    return null;
  }
}

export async function saveCachedImage(cacheKey, imageBuffer) {
  const blob = await put(`recipe-images/${cacheKey}.png`, imageBuffer, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false
  });
  return blob.url;
}
