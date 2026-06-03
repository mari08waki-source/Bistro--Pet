const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  await delay(800);
  const tabs = await (await fetch("http://127.0.0.1:9333/json")).json();
  const target = tabs[0];
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
    url: "file:///C:/Users/mari0/Documents/Codex/2026-05-31/quero-criar-um-aplicativo-premium-chamado/outputs/session-4-weekly-plan.html"
  });
  await delay(900);

  const expression = `
    (() => {
      const profile = window.BistroPetStorage.getPetProfile();
      const plan = buildWeeklyPlan(profile);
      const keys = plan.map(item => uniqueIngredients(item.ingredients).map(ingredient => normalize(ingredient)).sort().join("|"));
      const titles = plan.map(item => normalize(item.title));
      return {
        days: plan.map(item => item.day),
        titles: plan.map(item => item.title),
        ingredientKeys: keys,
        uniqueTitleCount: new Set(titles).size,
        uniqueIngredientKeyCount: new Set(keys).size,
        planLength: plan.length
      };
    })()
  `;

  const evaluated = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  ws.close();
  console.log(JSON.stringify(evaluated.result.result.value, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
