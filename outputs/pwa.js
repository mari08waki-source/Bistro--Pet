(function () {
  "use strict";

  const supported = "serviceWorker" in navigator;
  const secureContext = window.isSecureContext || ["localhost", "127.0.0.1"].includes(window.location.hostname);
  let registrationPromise = Promise.resolve(null);

  if (supported && secureContext) {
    registrationPromise = new Promise(resolve => {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
          .then(resolve)
          .catch(error => {
            console.warn("BistroPet PWA: service worker não registrado.", error);
            resolve(null);
          });
      }, { once: true });
    });
  }

  window.BistroPetPWA = {
    registrationPromise,
    isStandalone() {
      return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    }
  };
})();
