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

export async function generateOpenAIRecipeImage({ prompt, size = "1024x1024" }) {
  if (process.env.IMAGE_GENERATION_MODE === "validate") {
    return Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
  }

  if (process.env.IMAGE_GENERATION_MODE !== "live") {
    throw new Error("Image generation is disabled.");
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Image generation failed.");
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const image = parts.find(part => part.inlineData?.data || part.inline_data?.data);
  const imageData = image?.inlineData?.data || image?.inline_data?.data;
  if (imageData) return Buffer.from(imageData, "base64");
  throw new Error("Image response did not include image data.");
}
