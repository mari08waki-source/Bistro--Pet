function sendJson(response, body, status = 200) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.status(status).json(body);
}

export default function handler(request, response) {
  if (request.method !== "GET") {
    return sendJson(response, { error: "Method not allowed." }, 405);
  }

  const url = String(process.env.SUPABASE_URL || "").trim();
  const anonKey = String(
    process.env.SUPABASE_ANON_KEY
      || process.env.SUPABASE_PUBLISHABLE_KEY
      || ""
  ).trim();

  if (!/^https:\/\/[^/]+\.supabase\.co\/?$/i.test(url) || !anonKey) {
    return sendJson(response, { error: "Supabase public configuration is unavailable." }, 503);
  }

  return sendJson(response, { url: url.replace(/\/$/, ""), anonKey });
}
