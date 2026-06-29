export function buildRecipeImagePrompt(ingredients) {
  return [
    "Foto realista de comida natural para cachorro, em prato simples e elegante, como um prato pronto premium.",
    `Mostrar somente estes ingredientes principais: ${(ingredients || []).join(", ")}.`,
    "Não adicionar ingredientes extras.",
    "Imagem fotográfica realista, apetitosa, natural, limpa e sem texto."
  ].join(" ");
}

export function buildExactRecipeImagePrompt({ recipeName, ingredients }) {
  return [
    "Foto realista, vertical, de uma refeição caseira para cachorro servida em prato simples,",
    `representando a receita ${String(recipeName || "").trim()},`,
    `contendo todos e somente estes ingredientes claramente visíveis e identificáveis: ${(ingredients || []).join(", ")}.`,
    "Mostrar carnes em pedaços visíveis, arroz e ração em grãos visíveis, e legumes e vegetais em cubos, pedaços ou formatos reconhecíveis.",
    "Manter cada ingrediente visualmente identificável e não substituir ingredientes; sem ingredientes extras que não estejam na receita.",
    "Nunca mostrar purê, sopa, creme, caldo, molho, comida triturada, ingredientes amassados ou mistura homogênea.",
    "Apresentação caseira simples e limpa, fundo claro, luz natural suave, sem texto, sem rótulos, sem pessoas e sem cachorro."
  ].join(" ");
}

function imageProviderLog(event, details = {}) {
  try {
    console.info("[bistropet:image-provider]", JSON.stringify({ event, ...details }));
  } catch (_error) {
    console.info("[bistropet:image-provider]", event);
  }
}

function providerError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function generateOpenAIRecipeImage({ prompt, size = "1024x1024" }) {
  if (process.env.IMAGE_GENERATION_MODE === "validate") {
    imageProviderLog("validate_image_returned", { size });
    return Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
  }

  if (process.env.IMAGE_GENERATION_MODE !== "live") {
    throw providerError("Image generation is disabled.", "IMAGE_PROVIDER_DISABLED");
  }

  if (!process.env.GEMINI_API_KEY) {
    throw providerError("GEMINI_API_KEY is not configured.", "IMAGE_PROVIDER_CONFIG");
  }

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const timeoutMs = Number(process.env.IMAGE_PROVIDER_TIMEOUT_MS || 50000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  imageProviderLog("gemini_request_start", {
    mode: process.env.IMAGE_GENERATION_MODE,
    model,
    size,
    promptLength: String(prompt || "").length
  });
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      })
    });
  } catch (error) {
    if (error.name === "AbortError") throw providerError("Image provider request timed out.", "IMAGE_PROVIDER_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json();
  imageProviderLog("gemini_http_response", {
    model,
    ok: response.ok,
    status: response.status,
    hasCandidates: Boolean(data.candidates?.length)
  });
  if (!response.ok) {
    throw providerError(data.error?.message || "Image generation failed.", "IMAGE_PROVIDER_FAILED");
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const image = parts.find(part => part.inlineData?.data || part.inline_data?.data);
  const imageData = image?.inlineData?.data || image?.inline_data?.data;
  imageProviderLog("gemini_image_part_checked", {
    model,
    hasImage: Boolean(imageData),
    parts: parts.length,
    imageBytes: imageData ? Buffer.byteLength(imageData, "base64") : 0
  });
  if (imageData) return Buffer.from(imageData, "base64");
  throw providerError("Image response did not include image data.", "IMAGE_PROVIDER_INVALID_RESPONSE");
}
