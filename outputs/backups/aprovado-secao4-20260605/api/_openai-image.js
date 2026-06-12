export function buildRecipeImagePrompt({ recipeName, ingredients, prohibitedIngredients, preparation }) {
  return [
    "Foto realista de comida natural para cachorro, em prato simples e elegante, como um prato pronto premium.",
    `Nome da receita: ${recipeName}.`,
    `Mostrar exatamente estes ingredientes usados: ${(ingredients || []).join(", ")}.`,
    `Não mostrar: ${(prohibitedIngredients || []).join(", ") || "nenhum ingrediente proibido informado"}.`,
    "Não adicionar ingredientes extras.",
    "Não transformar mandioca, batata ou legumes em purê, creme ou sopa.",
    "Mostrar tudo em pedaços cozidos visíveis.",
    `Modo de preparo da receita: ${preparation || "preparo simples em pedaços cozidos"}.`,
    "Imagem fotográfica realista, apetitosa, natural, limpa, sem texto, sem ilustração, sem ícones."
  ].join(" ");
}

export async function generateOpenAIRecipeImage({ prompt }) {
  if (!process.env.IMAGE_API_KEY) {
    throw new Error("IMAGE_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.IMAGE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.IMAGE_MODEL || "gpt-image-1-mini",
      prompt,
      size: "1024x1024",
      quality: process.env.IMAGE_QUALITY || "low",
      n: 1
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Image generation failed.");
  }

  const image = data.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image?.url) {
    const imageResponse = await fetch(image.url);
    if (!imageResponse.ok) throw new Error("Generated image URL could not be downloaded.");
    return Buffer.from(await imageResponse.arrayBuffer());
  }
  throw new Error("Image response did not include image data.");
}
