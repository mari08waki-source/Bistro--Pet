function sendJson(response, body, status = 200) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Vary", "Authorization");
  response.status(status).json(body);
}

function publicConfig() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const anonKey = String(
    process.env.SUPABASE_ANON_KEY
      || process.env.SUPABASE_PUBLISHABLE_KEY
      || ""
  ).trim();
  if (!/^https:\/\/[^/]+\.supabase\.co$/i.test(url) || !anonKey) return null;
  return { url, anonKey };
}

export default async function handler(request, response) {
  if (request.method !== "GET") return sendJson(response, { error: "Method not allowed." }, 405);

  const token = String(request.headers?.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
  const config = publicConfig();
  if (!token || !config) return sendJson(response, { allowed: false }, 401);

  try {
    const authResponse = await fetch(`${config.url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`
      },
      cache: "no-store"
    });
    const user = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || !user?.id) return sendJson(response, { allowed: false }, 401);
    if (user.app_metadata?.role !== "admin") return sendJson(response, { allowed: false }, 403);
    return sendJson(response, { allowed: true, userId: user.id });
  } catch (error) {
    return sendJson(response, { error: "Admin authorization unavailable." }, 503);
  }
}
