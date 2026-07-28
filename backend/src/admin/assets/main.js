import { createApiClient } from "./api-client.js";
import { createAuthStore } from "./auth-store.js";
import { createLoginView } from "./screens/login.js";
import { createAuthenticatedShell } from "./screens/shell.js";

export async function bootstrapAdminApp(options = {}) {
  const documentRef = options.documentRef ?? document;
  const root = options.root ?? documentRef.querySelector("#admin-root");

  if (root === null) {
    throw new Error("Admin app root was not found.");
  }

  const authStore = createAuthStore();
  const api = createApiClient({
    authStore,
    fetchImpl: options.fetchImpl ?? fetch
  });
  let screenAbort = null;
  const unsubscribe = authStore.subscribe((snapshot) => {
    root.setAttribute("aria-busy", isBusyState(snapshot.state) ? "true" : "false");
  });

  function showBootstrap() {
    root.replaceChildren(
      element(documentRef, "section", { class: "admin-bootstrap" }, [
        element(documentRef, "p", { class: "admin-kicker" }, ["WEB00"]),
        element(documentRef, "h1", {}, ["Загрузка панели"]),
        element(documentRef, "p", {}, ["Проверяем сеанс..."])
      ])
    );
  }

  function showLogin() {
    abortScreenRequests();
    root.replaceChildren(
      createLoginView({
        documentRef,
        onSubmit: async ({ email, password }) => {
          const user = await api.login({ email, password });
          showShell(user);
        }
      })
    );
    root.focus();
  }

  function showShell(user) {
    abortScreenRequests();
    screenAbort = new AbortController();
    root.replaceChildren(
      createAuthenticatedShell({
        documentRef,
        onLogout: () => {
          void logoutAdminSession({
            abortController: screenAbort,
            api,
            authStore,
            showLogin
          });
        },
        onNavigate: () => {},
        user
      })
    );
    root.focus();
  }

  function abortScreenRequests() {
    if (screenAbort !== null) {
      screenAbort.abort();
      screenAbort = null;
    }
  }

  showBootstrap();

  try {
    const user = await api.bootstrapSession();
    showShell(user);
  } catch {
    authStore.clear();
    showLogin();
  }

  return {
    api,
    authStore,
    destroy() {
      abortScreenRequests();
      unsubscribe();
    }
  };
}

export async function logoutAdminSession({ abortController, api, authStore, showLogin }) {
  authStore.setState("LOGGING_OUT");
  authStore.clear();
  abortController?.abort();
  showLogin();

  try {
    await api.logout();
  } catch {
    authStore.clear();
  }
}

if (typeof document !== "undefined") {
  const root = document.querySelector("#admin-root");

  if (root !== null) {
    void bootstrapAdminApp({ root });
  }
}

function isBusyState(state) {
  return state === "BOOTSTRAPPING" || state === "REFRESHING" || state === "LOGGING_OUT";
}

function element(documentRef, tagName, attributes = {}, children = []) {
  const node = documentRef.createElement(tagName);

  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }

  node.append(...children);

  return node;
}
