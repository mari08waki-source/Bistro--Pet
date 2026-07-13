const categoryRules = {
  protein: [
    ["peito de frango", ["peito de frango"]],
    ["carne moida", ["carne moida"]],
    ["figado de frango", ["figado de frango"]],
    ["figado bovino", ["figado bovino"]],
    ["ovo", ["ovo", "ovos"]],
    ["peixe", ["peixe"]],
    ["carne", ["carne"]]
  ],
  carbohydrate: [
    ["arroz", ["arroz"]],
    ["batata", ["batata", "batata doce"]],
    ["mandioca", ["mandioca", "aipim", "macaxeira"]],
    ["mandioquinha", ["mandioquinha", "batata baroa"]],
    ["quinoa", ["quinoa"]],
    ["inhame", ["inhame"]],
    ["aveia", ["aveia"]]
  ],
  vegetable: [
    ["cenoura", ["cenoura"]],
    ["chuchu", ["chuchu"]],
    ["abobora", ["abobora"]],
    ["abobrinha", ["abobrinha"]],
    ["pepino", ["pepino"]],
    ["vagem", ["vagem"]],
    ["beterraba", ["beterraba"]],
    ["couve", ["couve"]]
  ]
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ingredientForCategory(ingredients, category) {
  const rules = categoryRules[category];
  for (const ingredient of ingredients) {
    const clean = normalize(ingredient);
    const match = rules.find(([, aliases]) => aliases.some(alias => clean.includes(alias)));
    if (match) return match[0];
  }
  return "";
}

export function simpleIngredientCombination(ingredients) {
  const items = Array.isArray(ingredients) ? ingredients : [];
  return [
    ingredientForCategory(items, "protein"),
    ingredientForCategory(items, "carbohydrate"),
    ingredientForCategory(items, "vegetable")
  ].filter(Boolean);
}
