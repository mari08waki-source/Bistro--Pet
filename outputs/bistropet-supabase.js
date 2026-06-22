(function () {
  "use strict";

  let clientPromise;
  let currentUser = null;

  function authStorage() {
    return {
      getItem(key) {
        try { return window.sessionStorage.getItem(key); } catch (error) { return null; }
      },
      setItem(key, value) {
        try { window.sessionStorage.setItem(key, value); } catch (error) {}
      },
      removeItem(key) {
        try { window.sessionStorage.removeItem(key); } catch (error) {}
      }
    };
  }

  async function initialize() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Cliente Supabase indisponível.");
    }

    const response = await fetch("/api/supabase-config", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const config = await response.json().catch(() => ({}));
    if (!response.ok || !config.url || !config.anonKey) {
      throw new Error(config.error || "Configuração pública do Supabase indisponível.");
    }

    const client = window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storage: authStorage()
      }
    });

    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    currentUser = data.session?.user || null;
    client.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
    });
    return client;
  }

  function ready() {
    if (!clientPromise) clientPromise = initialize();
    return clientPromise;
  }

  async function sessionUser() {
    const client = await ready();
    const { data, error } = await client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") throw error;
    currentUser = data?.user || null;
    if (currentUser) mountSessionLogout();
    return currentUser;
  }

  async function requireUser() {
    const user = await sessionUser();
    if (!user) {
      window.location.replace("./index.html");
      return null;
    }
    return user;
  }

  async function signUp(email, password, metadata = {}) {
    const client = await ready();
    const redirectTo = `${window.location.origin}/index.html`;
    const { data, error } = await client.auth.signUp({
      email: String(email || "").trim().toLowerCase(),
      password,
      options: { emailRedirectTo: redirectTo, data: metadata }
    });
    if (error) throw error;
    if (!data?.user) {
      throw new Error("O Supabase não confirmou a criação do cadastro.");
    }
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("Este email já possui cadastro. Entre com a senha ou recupere o acesso.");
    }
    currentUser = data.user || null;
    return data;
  }

  async function signIn(email, password) {
    const client = await ready();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user || null;
    return data;
  }

  async function sendPasswordRecovery(email) {
    const client = await ready();
    const redirectTo = `${window.location.origin}/index.html`;
    const { data, error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    return data;
  }

  async function updatePassword(password) {
    const client = await ready();
    const { data, error } = await client.auth.updateUser({ password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const client = await ready();
    const timeout = new Promise(resolve => {
      window.setTimeout(() => resolve({ timedOut: true }), 4000);
    });

    try {
      const result = await Promise.race([
        client.auth.signOut({ scope: "local" }),
        timeout
      ]);
      if (!result?.timedOut && result?.error) throw result.error;
    } finally {
      currentUser = null;
      try {
        Object.keys(window.sessionStorage)
          .filter(key => /^sb-.*-auth-token(?:-code-verifier)?$/.test(key))
          .forEach(key => window.sessionStorage.removeItem(key));
      } catch (error) {}
    }
  }

  async function onAuthStateChange(callback) {
    const client = await ready();
    return client.auth.onAuthStateChange(callback);
  }

  function mountSessionLogout() {
    if (document.getElementById("openLogout") || document.getElementById("bistropetSessionLogout")) return;
    if (!document.body.matches(".session-two-body, .session-three-body")) return;

    const button = document.createElement("button");
    button.id = "bistropetSessionLogout";
    button.className = "bistropet-session-logout";
    button.type = "button";
    button.setAttribute("aria-label", "Sair da conta");
    button.title = "Sair da conta";
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10 5H5v14h5"></path>
        <path d="M13 8l4 4-4 4"></path>
        <path d="M8 12h9"></path>
      </svg>`;
    button.addEventListener("click", async () => {
      if (!window.confirm("Deseja sair da conta?")) return;
      button.disabled = true;
      try {
        await signOut();
        window.location.replace("./index.html");
      } catch (error) {
        button.disabled = false;
        window.alert(error.message || "Não foi possível sair da conta.");
      }
    });
    document.body.appendChild(button);
  }

  window.BistroPetSupabase = {
    ready,
    client: ready,
    sessionUser,
    requireUser,
    currentUser: () => currentUser,
    signUp,
    signIn,
    sendPasswordRecovery,
    updatePassword,
    signOut,
    onAuthStateChange
  };
})();
