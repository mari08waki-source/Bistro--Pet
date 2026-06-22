function authError(message = "Authentication required.") {
  const error = new Error(message);
  error.code = "AUTH_REQUIRED";
  return error;
}

export async function identifyImageClient(request) {
  const token = String(request.headers?.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const anonKey = String(
    process.env.SUPABASE_ANON_KEY
      || process.env.SUPABASE_PUBLISHABLE_KEY
      || ""
  ).trim();
  if (!token || !/^https:\/\/[^/]+\.supabase\.co$/i.test(url) || !anonKey) throw authError();

  const response = await fetch(`${url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });
  const user = await response.json().catch(() => ({}));
  if (!response.ok || !user?.id) throw authError();
  return user.id;
}
