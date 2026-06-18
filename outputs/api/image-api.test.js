import assert from "node:assert/strict";
import test from "node:test";
import { identifyImageClient } from "./_image-client.js";
import { withImageRequestLock } from "./_image-request-lock.js";
import { generateOpenAIRecipeImage } from "./_openai-image.js";
import handler from "./generate-recipe-image.js";
import { checkImageLimit } from "./_image-limits.js";

function responseStub() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    }
  };
}

test("server ignores body identity and issues a signed HttpOnly cookie", () => {
  process.env.IMAGE_CLIENT_SECRET = "test-secret-with-at-least-thirty-two-characters";
  const response = responseStub();
  const clientId = identifyImageClient({ headers: {}, body: { clientId: "manipulated" } }, response);
  const cookie = response.headers.get("set-cookie");
  assert.match(clientId, /^[a-f0-9-]{36}$/i);
  assert.match(cookie, /^bistropet_image_client=/);
  assert.match(cookie, /HttpOnly/);
  assert.doesNotMatch(cookie, /manipulated/);
});

test("signed client cookie is reused and tampering is rejected", () => {
  process.env.IMAGE_CLIENT_SECRET = "test-secret-with-at-least-thirty-two-characters";
  const firstResponse = responseStub();
  const firstId = identifyImageClient({ headers: {} }, firstResponse);
  const signedCookie = firstResponse.headers.get("set-cookie").split(";")[0];

  const reusedId = identifyImageClient({ headers: { cookie: signedCookie } }, responseStub());
  assert.equal(reusedId, firstId);

  const tamperedResponse = responseStub();
  const tamperedId = identifyImageClient({ headers: { cookie: `${signedCookie}x` } }, tamperedResponse);
  assert.notEqual(tamperedId, firstId);
  assert.ok(tamperedResponse.headers.get("set-cookie"));
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

async function callHandler({ generationType, cookie = "", recipes, recipe, clientId = "manipulated" }) {
  const response = handlerResponse();
  await handler({
    method: "POST",
    headers: { cookie },
    body: { generationType, clientId, recipes, recipe }
  }, response);
  return response;
}

test("handler applies one daily request per individual generation type", async () => {
  process.env.IMAGE_CLIENT_SECRET = "test-secret-with-at-least-thirty-two-characters";
  process.env.IMAGE_GENERATION_MODE = "validate";
  process.env.IMAGE_LIMIT_STORAGE = "memory";
  process.env.IMAGE_STORAGE_MODE = "memory";
  process.env.IMAGE_LOCK_STORAGE = "memory";

  const first = await callHandler({
    generationType: "customRecipe",
    recipe: { id: "free", recipeName: "Teste", ingredients: ["Arroz"] }
  });
  const cookie = first.headers.get("set-cookie").split(";")[0];
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.limit.remaining, 0);

  const second = await callHandler({
    generationType: "customRecipe",
    cookie,
    clientId: "a-different-manipulated-id",
    recipe: { id: "free", recipeName: "Outro", ingredients: ["Batata"] }
  });
  assert.equal(second.statusCode, 429);
  assert.equal(second.body.status, "limit_exceeded");
});

test("daily limits are independent for custom and chef requests", async () => {
  process.env.IMAGE_CLIENT_SECRET = "independent-test-secret-with-at-least-thirty-two-characters";
  process.env.IMAGE_GENERATION_MODE = "validate";
  process.env.IMAGE_LIMIT_STORAGE = "memory";
  process.env.IMAGE_STORAGE_MODE = "memory";
  process.env.IMAGE_LOCK_STORAGE = "memory";

  let cookie = "";
  for (const generationType of ["customRecipe", "chefSuggestion"]) {
    const first = await callHandler({
      generationType,
      cookie,
      recipe: { id: generationType, recipeName: generationType, ingredients: ["Arroz"] }
    });
    cookie ||= first.headers.get("set-cookie").split(";")[0];
    assert.equal(first.statusCode, 200);

    const second = await callHandler({
      generationType,
      cookie,
      recipe: { id: generationType, recipeName: generationType, ingredients: ["Batata"] }
    });
    assert.equal(second.statusCode, 429);
  }
});

test("handler rejects invalid types and multi-recipe individual requests", async () => {
  process.env.IMAGE_CLIENT_SECRET = "validation-test-secret-with-at-least-thirty-two-characters";
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
  delete process.env.IMAGE_CLIENT_SECRET;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const response = await callHandler({
    generationType: "customRecipe",
    recipe: { id: "disabled", ingredients: ["Arroz"] }
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.status, "disabled");
});

test("handler applies one weekly plan request per week and caps it at seven recipes", async () => {
  process.env.IMAGE_CLIENT_SECRET = "another-test-secret-with-at-least-thirty-two-characters";
  process.env.IMAGE_GENERATION_MODE = "validate";
  process.env.IMAGE_LIMIT_STORAGE = "memory";
  process.env.IMAGE_STORAGE_MODE = "memory";
  process.env.IMAGE_LOCK_STORAGE = "memory";

  const recipes = Array.from({ length: 7 }, (_, index) => ({
    id: String(index),
    ingredients: ["Frango", `Arroz ${index}`, `Cenoura ${index}`]
  }));
  const first = await callHandler({ generationType: "weeklyPlan", recipes });
  const cookie = first.headers.get("set-cookie").split(";")[0];
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.images.length, 7);

  const second = await callHandler({ generationType: "weeklyPlan", cookie, recipes });
  assert.equal(second.statusCode, 429);

  const oversized = await callHandler({
    generationType: "weeklyPlan",
    recipes: [...recipes, { id: "7", ingredients: ["Peru"] }]
  });
  assert.equal(oversized.statusCode, 400);
});
