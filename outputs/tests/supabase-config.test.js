import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/supabase-config.js";

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

test("public Supabase config exposes only URL and anon key", () => {
  process.env.SUPABASE_URL = "https://bistropet.supabase.co";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "must-never-be-exposed";
  const response = responseRecorder();
  handler({ method: "GET" }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    url: "https://bistropet.supabase.co",
    anonKey: "public-anon-key"
  });
  assert.doesNotMatch(JSON.stringify(response.body), /service|must-never-be-exposed/i);
});

test("public Supabase config fails closed when variables are missing", () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  const response = responseRecorder();
  handler({ method: "GET" }, response);
  assert.equal(response.statusCode, 503);
});

test("public Supabase config rejects non-GET methods", () => {
  const response = responseRecorder();
  handler({ method: "POST" }, response);
  assert.equal(response.statusCode, 405);
});
