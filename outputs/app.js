const profile = {
  tutor: "Marina",
  pet: "Luna",
  age: "7 anos",
  size: "medio",
  personality: "seletivo",
  likes: "frango, abobora, arroz, cenoura",
  limits: "evitar excesso de gordura e temperos fortes",
  blocked: "cebola, alho, uva, chocolate"
};

const bases = [
  ["frango desfiado", "arroz macio", "abobora cremosa"],
  ["peixe branco cozido", "batata-doce", "cenoura delicada"],
  ["patinho cozido", "mandioquinha", "vagem bem picada"],
  ["ovo cozido em pedacos", "quinoa suave", "chuchu macio"],
  ["peru desfiado", "arroz integral bem cozido", "abobrinha"]
];

const forbidden = [
  ["Chocolate", "Evite sempre. Mantenha fora do alcance e fora de qualquer preparo."],
  ["Uva e uva-passa", "Nao entram em receitas, caldas ou petiscos caseiros."],
  ["Cebola e alho", "Mesmo em pequenas quantidades, ficam fora da cozinha do pet."],
  ["Cafeina", "Cafe, chas cafeinados e energéticos nao fazem parte da rotina."],
  ["Alcool", "Nunca deve ser oferecido ou usado em preparos."],
  ["Massas cruas", "Fermentos e massas sem assar devem permanecer inacessiveis."],
  ["Ossos cozidos", "Podem quebrar em lascas; prefira preparos sem ossos."],
  ["Xilitol", "Ingrediente comum em doces e produtos diet; confira rotulos."]
];

const dayNames = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"];
let mealIndex = 0;

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return [...document.querySelectorAll(selector)];
}

function routeTo(id) {
  $all(".screen").forEach(screen => screen.classList.toggle("active", screen.id === id));
  $all(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.route === id));
}

function cleanList(value) {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function syncProfile() {
  const data = new FormData($("#petForm"));
  for (const [key, value] of data.entries()) profile[key] = value.trim();
  $("#mealTitle").textContent = `Uma sugestao especial para ${profile.pet || "seu pet"}.`;
}

function personalityText() {
  const name = profile.pet || "seu pet";
  return {
    guloso: `Para ${name}, vale servir com calma e pequenas pausas, mantendo a experiencia gostosa sem pressa.`,
    seletivo: `Para ${name}, textura e aroma fazem diferenca; apresente a refeicao de forma simples e convidativa.`,
    sensivel: `Para ${name}, a melhor escolha e um preparo suave, com poucos elementos e apresentacao tranquila.`,
    aventureiro: `Para ${name}, pequenas variacoes de textura deixam o momento mais interessante sem complicar.`
  }[profile.personality] || `Prepare com simplicidade e observe como ${name} responde.`;
}

function nextMeal() {
  syncProfile();
  const blocked = cleanList(profile.blocked).map(item => item.toLowerCase());
  const likes = cleanList(profile.likes);
  const source = bases[mealIndex % bases.length].filter(item => !blocked.some(block => item.includes(block)));
  const extra = likes[mealIndex % Math.max(likes.length, 1)] || "um ingrediente favorito";
  const title = `Bowl bistro de ${source[0] || extra}, ${source[1] || "base macia"} e ${source[2] || "legume suave"}`;

  $("#recipeName").textContent = title;
  $("#recipeIntro").textContent = personalityText();
  $("#chefNote").textContent = `${profile.tutor || "Tutor"}, personalize a textura para o porte ${profile.size || "do pet"} e mantenha fora do preparo: ${profile.blocked || "ingredientes restritos"}.`;
  $("#recipeItems").innerHTML = [
    `Base principal: ${source[0] || extra}`,
    `Complemento macio: ${source[1] || "arroz bem cozido"}`,
    `Toque natural: ${source[2] || extra}`,
    `Ajuste automatico: ${profile.limits || "preparo simples, sem temperos fortes"}`
  ].map(item => `<li>${item}</li>`).join("");
  mealIndex += 1;
}

function renderWeek() {
  syncProfile();
  const grid = $("#weekGrid");
  grid.innerHTML = dayNames.map((day, index) => {
    const meal = bases[(index + mealIndex) % bases.length];
    return `<article class="day-card">
      <strong>${day}</strong>
      <p>${meal[0]} com ${meal[1]} e finalizacao de ${meal[2]}.</p>
      <div class="tag-row">
        <span class="chip">${profile.personality}</span>
        <span class="chip">${profile.size}</span>
      </div>
    </article>`;
  }).join("");
}

function renderForbidden() {
  $("#forbiddenGrid").innerHTML = forbidden.map(([name, text]) => `<article class="food-card"><strong>${name}</strong><p>${text}</p></article>`).join("");
}

$all("[data-route]").forEach(button => button.addEventListener("click", () => routeTo(button.dataset.route)));
$("#saveProfile").addEventListener("click", () => {
  syncProfile();
  nextMeal();
  renderWeek();
  routeTo("meals");
});
$("#generateMeal").addEventListener("click", nextMeal);
$("#refreshWeek").addEventListener("click", () => {
  mealIndex += 1;
  renderWeek();
});
$("#petForm").addEventListener("input", syncProfile);

nextMeal();
renderWeek();
renderForbidden();
