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
      email,
      password,
      options: { emailRedirectTo: redirectTo, data: metadata }
    });
    if (error) throw error;
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
    const { error } = await client.auth.signOut();
    if (error) throw error;
    currentUser = null;
  }

  async function onAuthStateChange(callback) {
    const client = await ready();
    return client.auth.onAuthStateChange(callback);
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
