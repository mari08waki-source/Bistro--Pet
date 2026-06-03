const fs = require("fs");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  await delay(900);
  const tabs = await (await fetch("http://127.0.0.1:9333/json")).json();
  const target = tabs.find(tab => String(tab.url).includes("session-3-meal.html")) || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };

  await new Promise(resolve => {
    ws.onopen = resolve;
  });

  const send = (method, params = {}) => new Promise(resolve => {
    const nextId = ++id;
    pending.set(nextId, resolve);
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", {
    url: "file:///C:/Users/mari0/Documents/Codex/2026-05-31/quero-criar-um-aplicativo-premium-chamado/outputs/session-3-meal.html"
  });
  await delay(900);

  const expression = `
    (() => {
      sessionStorage.removeItem("bistropet:session3:free");
      sessionStorage.removeItem("bistropet:session3:special");
      sessionStorage.removeItem("bistropet:session3:blocked");
      sessionStorage.removeItem("bistropet:session3:index");
      location.reload();
      return true;
    })()
  `;
  await send("Runtime.evaluate", { expression, returnByValue: true });
  await delay(900);

  const testExpression = `
    (() => {
      const click = selector => document.querySelector(selector).click();
      const fill = (selector, value) => {
        const element = document.querySelector(selector);
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const tags = selector => [...document.querySelectorAll(selector)].map(item => item.textContent.replace("×", "").trim());
      const recipe = () => ({
        title: document.querySelector("#recipeName").textContent,
        ingredients: [...document.querySelectorAll("#resultIngredients li")].map(item => item.textContent),
        visible: document.querySelector("#intelligentKitchen").classList.contains("is-generated")
      });

      const initial = {
        freeTags: tags("#freeIngredientTags .restriction-chip"),
        specialTags: tags("#specialIngredientTags .restriction-chip"),
        blockedTags: tags("#restrictionList .restriction-chip"),
        generated: document.querySelector("#intelligentKitchen").classList.contains("is-generated")
      };

      fill("#restrictedFoods", "chuchu");
      click("#addBlockedIngredient");
      const blockedAfterAdd = tags("#restrictionList .restriction-chip");

      click("[data-mode=livre]");
      fill("#freeIngredientInput", "chuchu");
      click("#addFreeIngredient");
      const blockedWarning = document.querySelector("#freeWarning").textContent;
      fill("#freeIngredientInput", "batata doce");
      click("#addFreeIngredient");
      fill("#freeIngredientInput", "cenoura");
      click("#addFreeIngredient");
      click("#createRecipe");
      const livre = recipe();

      click("[data-mode=personalizada]");
      const resetAfterModeSwitch = document.querySelector("#intelligentKitchen").classList.contains("is-generated");
      fill("#specialIngredients", "frango");
      click("#addSpecialIngredient");
      fill("#specialIngredients", "chuchu");
      click("#addSpecialIngredient");
      const customWarning = document.querySelector("#customWarning").textContent;
      fill("#specialIngredients", "mandioquinha");
      click("#addSpecialIngredient");
      click("#createRecipe");
      const personalizada = recipe();

      click("[data-mode=chef]");
      const resetBeforeChef = document.querySelector("#intelligentKitchen").classList.contains("is-generated");
      click("#createRecipe");
      const chef = recipe();

      return {
        initial,
        blockedAfterAdd,
        blockedWarning,
        customWarning,
        livre,
        personalizada,
        chef,
        resetAfterModeSwitch,
        resetBeforeChef,
        activePanel: document.querySelector(".mode-panel.active").dataset.panel,
        activeButtons: [...document.querySelectorAll(".mode-pill.active")].map(item => item.dataset.mode),
        recipeCards: document.querySelectorAll(".live-recipe-card").length
      };
    })()
  `;

  const evaluated = await send("Runtime.evaluate", {
    expression: testExpression,
    awaitPromise: true,
    returnByValue: true
  });
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true
  });

  fs.writeFileSync("outputs/session-3-tested.png", Buffer.from(screenshot.result.data, "base64"));
  ws.close();
  console.log(JSON.stringify(evaluated.result.result.value, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
