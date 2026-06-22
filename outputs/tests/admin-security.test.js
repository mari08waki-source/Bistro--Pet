import assert from "node:assert/strict";
import test from "node:test";

import adminAccessHandler from "../api/admin-access.js";

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

async function invoke({ token = "", role = "user", authOk = true } = {}) {
  process.env.SUPABASE_URL = "https://bistropet.supabase.co";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: authOk,
    json: async () => authOk ? { id: "user-id", app_metadata: { role } } : {}
  });
  const response = responseRecorder();
  try {
    await adminAccessHandler({ method: "GET", headers: { authorization: token ? `Bearer ${token}` : "" } }, response);
    return response;
  } finally {
    global.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
  }
}

test("admin route rejects unauthenticated requests", async () => {
  const response = await invoke();
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.allowed, false);
});

test("admin route rejects authenticated common users", async () => {
  const response = await invoke({ token: "valid-user-token", role: "user" });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.allowed, false);
});

test("admin route accepts only app_metadata admin role", async () => {
  const response = await invoke({ token: "valid-admin-token", role: "admin" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.allowed, true);
});

test("admin route does not accept user-controlled metadata", async () => {
  process.env.SUPABASE_URL = "https://bistropet.supabase.co";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ id: "user-id", app_metadata: {}, user_metadata: { role: "admin" } })
  });
  const response = responseRecorder();
  try {
    await adminAccessHandler({ method: "GET", headers: { authorization: "Bearer valid-token" } }, response);
    assert.equal(response.statusCode, 403);
  } finally {
    global.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
  }
});
