export function buildWeeklyPlanImagePrompt(ingredients) {
  return [
    "Foto realista de comida natural para cachorro, em prato branco simples e elegante, como um prato pronto premium.",
    `Mostrar somente estes ingredientes principais: ${(ingredients || []).join(", ")}.`,
    "Ingredientes organizados em porções separadas, bem definidos e reconhecíveis.",
    "Iluminação natural suave, fundo neutro, fotografia profissional de gastronomia, sem texto e sem elementos extras."
  ].join(" ");
}

export function buildRecipeImagePrompt({ recipeName, ingredients }) {
  return [
    "Foto realista, vertical, de uma refeição caseira para cachorro servida em prato branco simples,",
    `representando a receita ${String(recipeName || "").trim()},`,
    `contendo todos e somente estes ingredientes claramente visíveis e identificáveis: ${(ingredients || []).join(", ")}.`,
    "Mostrar carnes em pedaços visíveis, arroz e ração em grãos visíveis, e legumes e vegetais em cubos, pedaços ou formatos reconhecíveis.",
    "Manter cada ingrediente visualmente identificável e não substituir ingredientes; sem ingredientes extras que não estejam na receita.",
    "Nunca mostrar purê, sopa, creme, caldo, molho, comida triturada, ingredientes amassados ou mistura homogênea.",
    "Apresentação limpa e premium, fundo claro, luz natural suave, sem texto, sem rótulos, sem pessoas e sem cachorro."
  ].join(" ");
}
