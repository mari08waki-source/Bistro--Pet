import assert from "node:assert/strict";
import test from "node:test";
import { identifyImageClient } from "../api/_image-client.js";
import { withImageRequestLock } from "../api/_image-request-lock.js";
import { generateOpenAIRecipeImage } from "../api/_openai-image.js";
import handler from "../api/generate-recipe-image.js";
import { checkImageLimit, refundImageLimit } from "../api/_image-limits.js";

function responseStub() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    }
  };
}

test("image client identity comes from the authenticated Supabase user", async () => {
  process.env.SUPABASE_URL = "https://bistropet.supabase.co";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "authenticated-user-id" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
  try {
    const clientId = await identifyImageClient({
      headers: { authorization: "Bearer valid-token" },
      body: { clientId: "manipulated" }
    });
    assert.equal(clientId, "authenticated-user-id");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("image client rejects requests without a Supabase session", async () => {
  await assert.rejects(
    identifyImageClient({ headers: {}, body: { clientId: "manipulated" } }),
    error => error.code === "AUTH_REQUIRED"
  );
});

test("simultaneous requests with the same lock key are rejected", async () => {
  process.env.IMAGE_LOCK_STORAGE = "memory";
  let release;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const first = withImageRequestLock("client:customRecipe", async () => pending);
  await assert.rejects(
    withImageRequestLock("client:customRecipe", async () => "unexpected"),
    error => error.code === "IMAGE_REQUEST_IN_PROGRESS"
  );
  release("done");
  assert.equal(await first, "done");
});

test("distributed protection is mandatory outside memory-only tests", async () => {
  delete process.env.IMAGE_LOCK_STORAGE;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  await assert.rejects(
    withImageRequestLock("client:customRecipe", async () => "unexpected"),
    /Atomic image guard storage is not configured/
  );
});

test("atomic store commands enforce distributed limits and locks", async () => {
  const originalFetch = globalThis.fetch;
  const values = new Map();
  process.env.UPSTASH_REDIS_REST_URL = "https://atomic-store.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  delete process.env.IMAGE_LIMIT_STORAGE;
  delete process.env.IMAGE_LOCK_STORAGE;

  globalThis.fetch = async (_url, options) => {
    const [command, key, value, ...args] = JSON.parse(options.body);
    let result;
    if (command === "INCR") {
      result = Number(values.get(key) || 0) + 1;
      values.set(key, result);
    } else if (command === "DECR") {
      result = Number(values.get(key) || 0) - 1;
      values.set(key, result);
    } else if (command === "DEL") {
      result = Number(values.delete(key));
    } else if (command === "EXPIRE") {
      result = 1;
    } else if (command === "SET" && args.includes("NX")) {
      result = values.has(key) ? null : "OK";
      if (result) values.set(key, value);
    } else if (command === "EVAL") {
      const lockKey = args[0];
      const token = args[1];
      result = values.get(lockKey) === token ? Number(values.delete(lockKey)) : 0;
    }
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const firstLimit = await checkImageLimit({ generationType: "chefSuggestion", clientId: "atomic-client" });
    const secondLimit = await checkImageLimit({ generationType: "chefSuggestion", clientId: "atomic-client" });
    assert.equal(firstLimit.allowed, true);
    assert.equal(secondLimit.allowed, false);
    const refundedCount = await refundImageLimit({ generationType: "chefSuggestion", clientId: "atomic-client" });
    assert.equal(refundedCount, 0);

    let release;
    const pending = new Promise(resolve => {
      release = resolve;
    });
    const firstLock = withImageRequestLock("atomic-client:chefSuggestion", async () => pending);
    await assert.rejects(
      withImageRequestLock("atomic-client:chefSuggestion", async () => "unexpected"),
      error => error.code === "IMAGE_REQUEST_IN_PROGRESS"
    );
    release("done");
    assert.equal(await firstLock, "done");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("lock release failures do not override a completed image request", async () => {
  const originalFetch = globalThis.fetch;
  process.env.UPSTASH_REDIS_REST_URL = "https://atomic-store.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  delete process.env.IMAGE_LOCK_STORAGE;

  globalThis.fetch = async (_url, options) => {
    const [command] = JSON.parse(options.body);
    if (command === "SET") {
      return new Response(JSON.stringify({ result: "OK" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ error: "release failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const result = await withImageRequestLock("atomic-client:customRecipe", async () => "image-ready");
    assert.equal(result, "image-ready");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("validation mode returns a PNG without a Gemini key", async () => {
  delete process.env.GEMINI_API_KEY;
  process.env.IMAGE_GENERATION_MODE = "validate";
  const image = await generateOpenAIRecipeImage({ prompt: "validation" });
  assert.equal(image.subarray(1, 4).toString(), "PNG");
  delete process.env.IMAGE_GENERATION_MODE;
});

test("Gemini calls remain disabled unless live mode is explicit", async () => {
  process.env.GEMINI_API_KEY = "must-not-be-used";
  process.env.IMAGE_GENERATION_MODE = "disabled";
  await assert.rejects(
    generateOpenAIRecipeImage({ prompt: "must not call Gemini" }),
    /Image generation is disabled/
  );
  delete process.env.GEMINI_API_KEY;
});

function handlerResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    headers
  };
}

async function callHandler({ generationType, recipes, recipe, userId = "test-user" }) {
  process.env.SUPABASE_URL = "https://bistropet.supabase.co";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: userId }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return originalFetch(url);
  };
  const response = handlerResponse();
  try {
    await handler({
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: { generationType, recipes, recipe }
    }, response);
    return response;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("handler applies one daily request per individual generation type", async () => {
  process.env.IMAGE_GENERATION_MODE = "validate";
  process.env.IMAGE_LIMIT_STORAGE = "memory";
  process.env.IMAGE_STORAGE_MODE = "memory";
  process.env.IMAGE_LOCK_STORAGE = "memory";

  const first = await callHandler({
    generationType: "customRecipe",
    recipe: { id: "free", recipeName: "Teste", ingredients: ["Arroz"] }
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.limit.remaining, 0);

  const second = await callHandler({
    generationType: "customRecipe",
    userId: "test-user",
    recipe: { id: "free", recipeName: "Outro", ingredients: ["Batata"] }
  });
  assert.equal(second.statusCode, 429);
  assert.equal(second.body.status, "limit_exceeded");
  assert.equal(second.body.limit.retryAfterSeconds > 0, true);

  const third = await callHandler({
    generationType: "customRecipe",
    userId: "test-user",
    recipe: { id: "free", recipeName: "Mais uma", ingredients: ["Inhame"] }
  });
  assert.equal(third.statusCode, 429);
  assert.equal(third.body.status, "limit_exceeded");
});

test("failed image generation refunds the consumed image counter", async () => {
  delete process.env.GEMINI_API_KEY;
  process.env.IMAGE_GENERATION_MODE = "live";
  process.env.IMAGE_LIMIT_STORAGE = "memory";
  process.env.IMAGE_STORAGE_MODE = "memory";
  process.env.IMAGE_LOCK_STORAGE = "memory";

  const failed = await callHandler({
    generationType: "customRecipe",
    userId: "refund-user",
    recipe: { id: "failed", recipeName: "Teste falha", ingredients: ["Arroz"] }
  });
  assert.equal(failed.statusCode, 502);
  assert.equal(failed.body.status, "provider_failed");

  process.env.IMAGE_GENERATION_MODE = "validate";
  const retry = await callHandler({
    generationType: "customRecipe",
    userId: "refund-user",
    recipe: { id: "retry", recipeName: "Teste retry", ingredients: ["Batata"] }
  });
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.status, "ready");
});

test("daily limits are independent for custom and chef requests", async () => {
  process.env.IMAGE_GENERATION_MODE = "validate";
  process.env.IMAGE_LIMIT_STORAGE = "memory";
  process.env.IMAGE_STORAGE_MODE = "memory";
  process.env.IMAGE_LOCK_STORAGE = "memory";

  for (const generationType of ["customRecipe", "chefSuggestion"]) {
    const first = await callHandler({
      generationType,
      userId: "independent-user",
      recipe: { id: generationType, recipeName: generationType, ingredients: ["Arroz"] }
    });
    assert.equal(first.statusCode, 200);

    const second = await callHandler({
      generationType,
      userId: "independent-user",
      recipe: { id: generationType, recipeName: generationType, ingredients: ["Batata"] }
    });
    assert.equal(second.statusCode, 429);
  }
});

test("handler rejects invalid types and multi-recipe individual requests", async () => {
  const invalidType = await callHandler({
    generationType: "unlimited",
    recipe: { id: "x", ingredients: ["Arroz"] }
  });
  assert.equal(invalidType.statusCode, 400);

  const multiple = await callHandler({
    generationType: "customRecipe",
    recipes: [{ id: "1", ingredients: ["Arroz"] }, { id: "2", ingredients: ["Batata"] }]
  });
  assert.equal(multiple.statusCode, 400);
});

test("disabled endpoint refuses requests before using paid services", async () => {
  process.env.IMAGE_GENERATION_MODE = "disabled";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const response = await callHandler({
    generationType: "customRecipe",
    recipe: { id: "disabled", ingredients: ["Arroz"] }
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.status, "disabled");
});

test("image endpoint rejects anonymous requests before any provider call", async () => {
  process.env.IMAGE_GENERATION_MODE = "validate";
  process.env.SUPABASE_URL = "https://bistropet.supabase.co";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  const response = handlerResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      generationType: "customRecipe",
      recipe: { id: "anonymous", ingredients: ["Arroz"] }
    }
  }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.status, "unauthorized");
});

test("handler allows up to seven weekly plan day images on demand", async () => {
  process.env.IMAGE_GENERATION_MODE = "validate";
  process.env.IMAGE_LIMIT_STORAGE = "memory";
  process.env.IMAGE_STORAGE_MODE = "memory";
  process.env.IMAGE_LOCK_STORAGE = "memory";
  process.env.IMAGE_WEEKLY_LIMIT_WEEKLY_PLAN = "7";

  const weeklyDayRecipes = [
    ["Peito de frango", "Arroz", "Cenoura"],
    ["Peixe", "Batata", "Chuchu"],
    ["Carne", "Quinoa", "Abóbora"],
    ["Fígado de frango", "Inhame", "Abobrinha"],
    ["Fígado bovino", "Aveia", "Pepino"],
    ["Carne moída", "Mandioquinha", "Vagem"],
    ["Peixe", "Arroz", "Beterraba"]
  ];

  for (let index = 0; index < weeklyDayRecipes.length; index += 1) {
    const response = await callHandler({
      generationType: "weeklyPlan",
      userId: "weekly-day-user",
      recipes: [{
        id: String(index),
        ingredients: weeklyDayRecipes[index]
      }]
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.images.length, 1);
  }

  const cached = await callHandler({
    generationType: "weeklyPlan",
    userId: "weekly-day-user",
    recipes: [{ id: "cached", ingredients: weeklyDayRecipes[0] }]
  });
  assert.equal(cached.statusCode, 200);
  assert.equal(cached.body.images[0].cached, true);

  const eighth = await callHandler({
    generationType: "weeklyPlan",
    userId: "weekly-day-user",
    recipes: [{ id: "7", ingredients: ["Carne", "Batata", "Couve"] }]
  });
  assert.equal(eighth.statusCode, 429);

  const oversized = await callHandler({
    generationType: "weeklyPlan",
    recipes: [
      { id: "1", ingredients: ["Peito de frango"] },
      { id: "2", ingredients: ["Fígado bovino"] }
    ]
  });
  assert.equal(oversized.statusCode, 400);
  delete process.env.IMAGE_WEEKLY_LIMIT_WEEKLY_PLAN;
});
