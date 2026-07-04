(function () {
  "use strict";

  const imageEndpoint = window.location.protocol === "file:" ? "" : "/api/generate-recipe-image";

  function imageError(message) {
    return new Error(message || "Não foi possível gerar a imagem do prato agora.");
  }

  async function requestImage(payload) {
    if (!imageEndpoint) {
      throw imageError("A imagem do prato não está disponível neste modo de visualização.");
    }
    const response = await fetch(imageEndpoint, {
      method: "POST",
      headers: await window.BistroPetSupabase.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw imageError(data.message || "Não foi possível gerar a imagem do prato agora.");
    if (!Array.isArray(data.images)) throw imageError("A resposta da imagem veio incompleta.");
    return data.images;
  }

  async function generateRecipeImage({ generationType, recipe }) {
    const images = await requestImage({
      generationType,
      recipe: {
        id: recipe.id,
        requestId: recipe.requestId,
        recipeName: recipe.recipeName || recipe.title,
        ingredients: recipe.ingredients
      }
    });
    const image = images[0];
    if (!image || !image.imageUrl) throw imageError("A imagem do prato não foi retornada corretamente.");
    return image;
  }

  async function generateWeeklyPlanImage({ dayIndex, recipe }) {
    const images = await requestImage({
      generationType: "weeklyPlan",
      recipes: [{
        id: String(dayIndex),
        recipeName: recipe.title,
        ingredients: recipe.ingredients
      }]
    });
    const image = images.find(item => String(item.id) === String(dayIndex));
    if (!image || !image.imageUrl) throw imageError("A imagem do prato não foi retornada corretamente.");
    return image;
  }

  window.BistroPetImageService = {
    generateRecipeImage,
    generateWeeklyPlanImage
  };
})();
