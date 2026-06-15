(function () {
  "use strict";

  const synthesis = window.speechSynthesis;
  let readingToken = 0;
  let reading = false;

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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
      ingredients.length ? `Ingredientes e quantidades: ${ingredients.map((item, index) => `${index + 1}. ${cleanText(item)}`).join(". ")}.` : "",
      steps.length ? `Modo de preparo: ${steps.map((item, index) => `Passo ${index + 1}. ${cleanText(item)}`).join(". ")}.` : ""
    ].filter(Boolean).join(" ");
  }

  function weeklyPlanText(plan) {
    if (!Array.isArray(plan)) return "";
    return [
      "Plano semanal.",
      ...plan.map(item => {
        const ingredients = Array.isArray(item.ingredients) ? item.ingredients.map(cleanText).join(", ") : "";
        return [
          `${cleanText(item.day)}. ${cleanText(item.title)}.`,
          ingredients ? `Ingredientes: ${ingredients}.` : "",
          item.prep ? `Modo de preparo: ${cleanText(item.prep)}.` : ""
        ].filter(Boolean).join(" ");
      })
    ].join(" ");
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
    stop
  };
})();
