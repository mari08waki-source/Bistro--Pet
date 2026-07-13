import { identifyImageClient } from "./_image-client.js";

const dayNames = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const allowedProteins = ["peito de frango", "carne", "carne moida", "peixe", "ovo", "figado de frango", "figado bovino"];
const forbiddenProteinTerms = /\b(frango|galinha|peito|coxa|sobrecoxa|asa|coxinha\s+da\s+asa|drumette|meio\s+da\s+asa|file|posta|lombo|peru|ovos|patinho|musculo|acem|coxao|lagarto|fraldinha|picanha|alcatra|bovina|bovino|tilapia|merluza|salmao|sardinha|atum|bacalhau)\b/;

function sendJson(res, response, status = 200) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(status).json(response);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function safeList(items) {
  return Array.isArray(items)
    ? items.map(item => String(item || "").trim()).filter(Boolean)
    : [];
}

function hasNonstandardProtein(value) {
  let clean = normalize(value);
  [...allowedProteins].sort((a, b) => b.length - a.length).forEach(item => {
    clean = clean.replace(new RegExp(`\\b${item}\\b`, "g"), "");
  });
  return forbiddenProteinTerms.test(clean);
}

export { hasNonstandardProtein };

function isRestrictedText(value, restrictions) {
  const cleanValue = normalize(value);
  return restrictions.some(item => {
    const cleanRestriction = normalize(item);
    return cleanRestriction && cleanValue.includes(cleanRestriction);
  });
}

function buildWeeklyPlanPrompt({ profile, restrictions }) {
  return `
Você é o chef do BistroPet. Crie um plano semanal real, premium e seguro para pet, em português do Brasil.

Dados do pet:
- Nome: ${profile.name || "não informado"}
- Porte: ${profile.size || "não informado"}
- Idade: ${profile.age || "não informado"}
- Peso: ${profile.weight || "não informado"}
- Observações/restrições: ${profile.notes || "não informado"}

Alimentos proibidos/restrições que NÃO podem aparecer em nenhum dia:
${restrictions.length ? restrictions.map(item => `- ${item}`).join("\n") : "- Nenhuma restrição adicional informada"}

Regras:
- Retorne exatamente 7 dias: Segunda, Terça, Quarta, Quinta, Sexta, Sábado e Domingo.
- Cada dia deve ter uma receita diferente.
- Não repita a mesma combinação de ingredientes.
- Use ingredientes simples, seguros e comuns.
- As únicas proteínas permitidas são: Peito de frango, Carne, Carne moída, Peixe, Ovo, Fígado de frango e Fígado bovino.
- Nunca use cortes bovinos, espécies de peixe, frango genérico, peru ou qualquer outra proteína fora dessa lista.
- Repita exatamente os nomes permitidos na lista de ingredientes, no título e no modo de preparo.
- Não use temperos perigosos, cebola, alho, uva, chocolate, ossos cozidos ou ingredientes proibidos.
- Não invente dados do pet que não foram informados.
- O modo de preparo deve ser claro e curto.
- A resposta deve ser somente JSON válido, sem markdown.

Formato obrigatório:
{
  "plan": [
    {
      "day": "Segunda",
      "title": "Nome da receita",
      "ingredients": ["Ingrediente 1", "Ingrediente 2", "Ingrediente 3"],
      "prep": "Modo de preparo em frases curtas.",
      "note": "Observação do chef curta."
    }
  ]
}
`.trim();
}

function extractJson(text) {
  const clean = String(text || "").trim();
  try {
    return JSON.parse(clean);
  } catch (_error) {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Resposta da IA não trouxe JSON válido.");
    return JSON.parse(match[0]);
  }
}

async function generateGeminiWeeklyPlan({ profile, restrictions }) {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error("GEMINI_API_KEY is not configured.");
    error.code = "WEEKLY_PLAN_CONFIG";
    throw error;
  }

  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const timeoutMs = Number(process.env.WEEKLY_PLAN_PROVIDER_TIMEOUT_MS || 45000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildWeeklyPlanPrompt({ profile, restrictions }) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.85
        }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error?.message || "Falha ao gerar plano semanal.");
      error.code = "WEEKLY_PLAN_PROVIDER_FAILED";
      throw error;
    }
    const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    return extractJson(text);
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("A geração do plano demorou mais que o esperado.");
      timeoutError.code = "WEEKLY_PLAN_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePlan(rawPlan, { profile, restrictions }) {
  const plan = Array.isArray(rawPlan?.plan) ? rawPlan.plan : [];
  if (plan.length !== 7) throw new Error("A IA não retornou os 7 dias do plano.");

  return dayNames.map((day, index) => {
    const item = plan[index] || {};
    const title = String(item.title || "").trim();
    const ingredients = safeList(item.ingredients);
    const prep = String(item.prep || "").trim();
    const note = String(item.note || "").trim();
    if (!title || ingredients.length < 3 || !prep) throw new Error(`Plano incompleto para ${day}.`);
    const recipeContent = [title, prep, note, ...ingredients];
    if (recipeContent.some(hasNonstandardProtein)) throw new Error(`Proteína fora da padronização para ${day}.`);
    const restrictedContent = recipeContent.some(value => isRestrictedText(value, restrictions));
    if (restrictedContent) throw new Error(`Plano inseguro para ${day}.`);
    return {
      day,
      planMode: "auto",
      planModeLabel: "Automático",
      title,
      ingredients,
      prep,
      customNote: "",
      note,
      image: null,
      profile: {
        name: profile.name || "seu pet",
        size: profile.size || "",
        age: profile.age || "",
        weight: profile.weight || "",
        source: "api"
      }
    };
  });
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, { status: "method_not_allowed" }, 405);
  }

  try {
    await identifyImageClient(request);
    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
    const profile = body.profile || {};
    const restrictions = safeList(body.restrictions);
    const rawPlan = await generateGeminiWeeklyPlan({ profile, restrictions });
    const plan = normalizePlan(rawPlan, { profile, restrictions });
    return sendJson(response, { status: "ready", plan });
  } catch (error) {
    if (error.code === "AUTH_REQUIRED") {
      return sendJson(response, {
        status: "unauthorized",
        message: "Sessão expirada. Entre novamente para gerar o plano semanal."
      }, 401);
    }
    if (error.code === "WEEKLY_PLAN_TIMEOUT") {
      return sendJson(response, {
        status: "timeout",
        message: "O chef demorou mais que o esperado para montar o plano. Tente novamente em instantes."
      }, 504);
    }
    return sendJson(response, {
      status: "failed",
      message: "Não foi possível gerar o plano semanal agora. Tente novamente em instantes."
    }, 502);
  }
}
