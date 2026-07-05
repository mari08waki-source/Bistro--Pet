import { identifyImageClient } from "./_image-client.js";
import { withImageRequestLock } from "./_image-request-lock.js";
import { generateIndividualRecipeImage, generateWeeklyPlanDayImage } from "./_image-generation-service.js";

const validGenerationTypes = new Set(["customRecipe", "chefSuggestion", "weeklyPlan"]);

function imageLog(event, details = {}) {
  try {
    console.info("[bistropet:image]", JSON.stringify({ event, ...details }));
  } catch (_error) {
    console.info("[bistropet:image]", event);
  }
}

function safeClientId(clientId) {
  return String(clientId || "").slice(0, 8);
}

function limitMessage(limit) {
  const period = limit.period === "week" ? "semana" : "dia";
  return `Limite de imagem atingido para este ${period}. Tente novamente no próximo ${period}.`;
}

function sendJson(res, response, status = 200) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(status).json(response);
}

function normalizeRecipe(recipe) {
  return {
    id: recipe.id,
    recipeName: String(recipe.recipeName || recipe.title || "").trim(),
    requestId: String(recipe.requestId || "").trim(),
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.map(String).filter(Boolean) : []
  };
}

function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return {};
}

export default async function handler(request, response) {
  if (request.method === "OPTIONS") return sendJson(response, {});
  if (request.method !== "POST") return sendJson(response, { error: "Method not allowed." }, 405);

  try {
    const body = readBody(request);
    const generationType = body.generationType;
    if (!validGenerationTypes.has(generationType)) {
      return sendJson(response, { error: "Invalid image generation type." }, 400);
    }
    const clientId = await identifyImageClient(request);
    if (!["live", "validate"].includes(process.env.IMAGE_GENERATION_MODE)) {
      return sendJson(response, {
        status: "disabled",
        message: "Imagem em preparo",
        images: []
      }, 503);
    }
    const recipes = (Array.isArray(body.recipes) ? body.recipes : [body.recipe]).filter(Boolean).map(normalizeRecipe);

    if (!recipes.length) return sendJson(response, { error: "No recipe provided." }, 400);
    if (generationType !== "weeklyPlan" && recipes.length !== 1) {
      return sendJson(response, { error: "Individual image requests must contain exactly one recipe." }, 400);
    }
    if (generationType === "weeklyPlan" && recipes.length !== 1) {
      return sendJson(response, { error: "Weekly image requests must contain exactly one day recipe." }, 400);
    }

    const requestLockKey = generationType === "weeklyPlan"
      ? `${clientId}:${generationType}:${recipes[0].id || "day"}`
      : `${clientId}:${generationType}`;

    return await withImageRequestLock(requestLockKey, async () => {
      if (generationType !== "weeklyPlan") {
        const results = [];
        let limit = null;
        for (const recipe of recipes) {
          const generated = await generateIndividualRecipeImage({ generationType, recipe, clientId, imageLog });
          limit = generated.limit;
          if (generated.blocked) {
          imageLog("limit_blocked", {
            generationType,
            user: safeClientId(clientId),
            limit: limit.limit,
            period: limit.period
          });
          return sendJson(response, {
            status: "limit_exceeded",
            message: limitMessage(limit),
            limit,
            images: []
          }, 429);
          }
          results.push(generated.result);
        }
        imageLog("frontend_response", {
          generationType,
          user: safeClientId(clientId),
          images: results.length,
          status: "ready"
        });
        return sendJson(response, { status: "ready", images: results, limit });
      }

      const results = [];
      let limit = null;
      for (const recipe of recipes) {
        const generated = await generateWeeklyPlanDayImage({
          generationType,
          recipe,
          clientId,
          imageLog,
          forceRefresh: Boolean(body.forceRefresh)
        });
        limit = generated.limit || limit;
        if (generated.blocked) {
          imageLog("limit_blocked", {
            generationType,
            user: safeClientId(clientId),
            limit: limit.limit,
            period: limit.period,
            recipeId: recipe.id
          });
          return sendJson(response, {
            status: "limit_exceeded",
            message: limitMessage(limit),
            limit,
            images: []
          }, 429);
        }
        results.push(generated.result);
      }

      imageLog("frontend_response", {
        generationType,
        user: safeClientId(clientId),
        images: results.length,
        status: "ready"
      });
      return sendJson(response, { status: "ready", images: results, limit });
    });
  } catch (error) {
    if (error.code === "AUTH_REQUIRED") {
      return sendJson(response, {
        status: "unauthorized",
        error: "Authentication required."
      }, 401);
    }
    if (error.code === "IMAGE_REQUEST_IN_PROGRESS") {
      return sendJson(response, {
        status: "request_in_progress",
        message: "A imagem do prato já está em preparo. Aguarde alguns instantes antes de tentar novamente.",
        images: []
      }, 409);
    }
    if (error.code === "IMAGE_PROVIDER_TIMEOUT") {
      return sendJson(response, {
        status: "timeout",
        message: "A geração da imagem demorou mais que o esperado. Tente novamente em instantes.",
        error: "Image provider timeout."
      }, 504);
    }
    if (String(error.code || "").startsWith("IMAGE_PROVIDER_")) {
      return sendJson(response, {
        status: "provider_failed",
        message: "Não foi possível gerar a imagem do prato agora. Tente novamente em instantes.",
        error: "Image provider unavailable."
      }, 502);
    }
    return sendJson(response, {
      status: "failed",
      message: "Não foi possível concluir a geração da imagem agora. Tente novamente em instantes.",
      error: "Image generation temporarily unavailable."
    }, 500);
  }
}
