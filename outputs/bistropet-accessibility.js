(function () {
  "use strict";

  const synthesis = window.speechSynthesis;
  let readingToken = 0;
  let reading = false;

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function profilePortionSize() {
    const profile = window.BistroPetStorage && window.BistroPetStorage.getPetProfile
      ? window.BistroPetStorage.getPetProfile()
      : {};
    const weightText = String(profile.weight || "").replace(",", ".");
    const weightMatch = weightText.match(/\d+(?:\.\d+)?/);
    const weight = weightMatch ? Number(weightMatch[0]) : 0;
    if (weight > 0 && weight <= 10) return "small";
    if (weight > 10 && weight <= 25) return "medium";
    if (weight > 25) return "large";
    const size = normalize(profile.size || "");
    if (/\b(pequeno|pequena|small)\b/.test(size)) return "small";
    if (/\b(grande|large)\b/.test(size)) return "large";
    return "medium";
  }

  function ingredientCategory(item) {
    const clean = normalize(item);
    if (/\b(frango|peixe|carne|peru|ovo|ovos|figado)\b/.test(clean)) return "protein";
    if (/\b(arroz|quinoa|aveia|milho|racao)\b/.test(clean)) return "grain";
    if (/\b(batata|batata doce|mandioca|mandioquinha|inhame|abobora)\b/.test(clean)) return "base";
    return "vegetable";
  }

  function ingredientPortionGrams(item) {
    const portions = {
      small: { protein: 80, base: 50, vegetable: 40, grain: 30 },
      medium: { protein: 120, base: 75, vegetable: 60, grain: 45 },
      large: { protein: 160, base: 100, vegetable: 80, grain: 60 }
    };
    const size = profilePortionSize();
    return portions[size][ingredientCategory(item)] || portions[size].vegetable;
  }

  function cleanIngredientForSpeech(item) {
    return cleanText(item).replace(/^\d+\s*g(?:ramas?)?\s+de\s+/i, "");
  }

  function ingredientText(item) {
    const ingredient = cleanIngredientForSpeech(item).toLowerCase();
    if (!ingredient) return "";
    return `${ingredientPortionGrams(item)} gramas de ${ingredient}`;
  }

  function ingredientsText(ingredients) {
    const spokenIngredients = ingredients.map(ingredientText).filter(Boolean);
    return spokenIngredients.length ? `Ingredientes. ${spokenIngredients.join(". ")}.` : "";
  }

  function preparationText(steps) {
    const spokenSteps = steps.map(cleanText).filter(Boolean);
    return spokenSteps.length ? `Modo de preparo. ${spokenSteps.join(" ")}` : "";
  }

  function weekdayText(day) {
    const cleanDay = cleanText(day);
    return {
      "Segunda": "Segunda-feira",
      "Terça": "Terça-feira",
      "Quarta": "Quarta-feira",
      "Quinta": "Quinta-feira",
      "Sexta": "Sexta-feira"
    }[cleanDay] || cleanDay;
  }

  function updateAudioControls() {
    document.querySelectorAll("[data-audio-listen]").forEach(button => {
      button.setAttribute("aria-pressed", reading ? "true" : "false");
    });
    document.querySelectorAll("[data-audio-stop]").forEach(button => {
      button.hidden = !reading;
      button.disabled = !reading;
    });
  }

  function stop() {
    readingToken += 1;
    reading = false;
    if (synthesis) synthesis.cancel();
    updateAudioControls();
  }

  function chunksFromText(text) {
    const sentences = cleanText(text).match(/[^.!?]+[.!?]?/g) || [];
    const chunks = [];
    let current = "";

    sentences.forEach(sentence => {
      const next = cleanText(`${current} ${sentence}`);
      if (current && next.length > 220) {
        chunks.push(current);
        current = cleanText(sentence);
      } else {
        current = next;
      }
    });
    if (current) chunks.push(current);
    return chunks;
  }

  function preferredVoice() {
    if (!synthesis) return null;
    const voices = synthesis.getVoices();
    return voices.find(voice => /^pt-BR$/i.test(voice.lang))
      || voices.find(voice => /^pt/i.test(voice.lang))
      || null;
  }

  function speak(text) {
    if (!synthesis || typeof window.SpeechSynthesisUtterance !== "function") return false;
    stop();
    const token = readingToken;
    const chunks = chunksFromText(text);
    if (!chunks.length) return false;

    reading = true;
    updateAudioControls();

    function speakNext(index) {
      if (!reading || token !== readingToken || index >= chunks.length) {
        if (token === readingToken) {
          reading = false;
          updateAudioControls();
        }
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = "pt-BR";
      utterance.rate = 0.95;
      const voice = preferredVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = () => speakNext(index + 1);
      utterance.onerror = () => {
        if (token === readingToken) stop();
      };
      synthesis.speak(utterance);
    }

    speakNext(0);
    return true;
  }

  function recipeText(recipe) {
    if (!recipe) return "";
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    return [
      `Receita: ${cleanText(recipe.title)}.`,
      ingredientsText(ingredients),
      preparationText(steps)
    ].filter(Boolean).join(" ");
  }

  function weeklyPlanText(plan) {
    if (!Array.isArray(plan)) return "";
    return [
      "Plano semanal.",
      ...plan.map(item => {
        const ingredients = Array.isArray(item.ingredients) ? ingredientsText(item.ingredients) : "";
        return [
          `${cleanText(item.day)}. ${cleanText(item.title)}.`,
          ingredients,
          item.prep ? preparationText([item.prep]) : ""
        ].filter(Boolean).join(" ");
      })
    ].join(" ");
  }

  function weeklyDayText(dayPlan) {
    if (!dayPlan) return "";
    const ingredients = Array.isArray(dayPlan.ingredients) ? ingredientsText(dayPlan.ingredients) : "";
    return [
      `${weekdayText(dayPlan.day)}.`,
      `Receita: ${cleanText(dayPlan.title)}.`,
      ingredients,
      dayPlan.prep ? preparationText([dayPlan.prep]) : ""
    ].filter(Boolean).join(" ");
  }

  function enhanceElement(element) {
    if (!element || typeof element.querySelectorAll !== "function") return;

    element.querySelectorAll("button:not([aria-label])").forEach(button => {
      const label = cleanText(button.textContent);
      if (label) button.setAttribute("aria-label", label);
    });
    element.querySelectorAll("input:not([aria-label]), textarea:not([aria-label]), select:not([aria-label])").forEach(field => {
      if (field.labels && field.labels.length) return;
      const label = cleanText(field.placeholder || field.name || field.id);
      if (label) field.setAttribute("aria-label", label);
    });
    element.querySelectorAll(".mode-warning, .custom-ingredient-message").forEach(message => {
      message.setAttribute("aria-live", "polite");
      message.setAttribute("role", "status");
    });
  }

  function enhancePage() {
    enhanceElement(document);
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => enhanceElement(node)));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    updateAudioControls();
  }

  document.addEventListener("DOMContentLoaded", enhancePage);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  window.addEventListener("pagehide", stop);
  window.addEventListener("beforeunload", stop);

  window.BistroPetAccessibility = {
    isSupported: Boolean(synthesis && typeof window.SpeechSynthesisUtterance === "function"),
    speak,
    speakRecipe(recipe) {
      return speak(recipeText(recipe));
    },
    speakWeeklyPlan(plan) {
      return speak(weeklyPlanText(plan));
    },
    speakWeeklyDay(dayPlan) {
      return speak(weeklyDayText(dayPlan));
    },
    stop
  };
})();
