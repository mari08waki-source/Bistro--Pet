import crypto from "node:crypto";

const COOKIE_NAME = "bistropet_image_client";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function cookieValue(request, name) {
  const header = String(request.headers?.cookie || "");
  const item = header.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

function signature(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function validSignedId(value, secret) {
  const [id, suppliedSignature] = String(value || "").split(".");
  if (!id || !suppliedSignature || !/^[a-f0-9-]{36}$/i.test(id)) return "";
  const expectedSignature = signature(id, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return "";
  return id;
}

export function identifyImageClient(request, response) {
  const secret = process.env.IMAGE_CLIENT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("IMAGE_CLIENT_SECRET must contain at least 32 characters.");
  }

  const existingValue = cookieValue(request, COOKIE_NAME);
  const existingId = validSignedId(existingValue, secret);
  if (existingId) return existingId;

  const id = crypto.randomUUID();
  const signedValue = `${id}.${signature(id, secret)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(signedValue)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`
  );
  return id;
}
