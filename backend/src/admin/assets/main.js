import { createApiClient } from "./api-client.js";
import { createAuthStore } from "./auth-store.js";
import { createLoginView } from "./screens/login.js";
import { createAuthenticatedShell } from "./screens/shell.js";
import { createAuditScreen } from "./screens/audit.js";
import { createCategoriesScreen } from "./screens/categories.js";
import { createImageManagerScreen } from "./screens/image-manager.js";
import { createSiteEditorScreen } from "./screens/site-editor.js";
import { createSitesListScreen } from "./screens/sites-list.js";
import { createUsersScreen } from "./screens/users.js";

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
  let currentScreen = null;
  let currentUser = null;
  let shellElement = null;
  const autoLoadScreens = options.autoLoadScreens ?? options.documentRef === undefined;
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
    destroyCurrentScreen();
    shellElement = null;
    currentUser = null;
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
    destroyCurrentScreen();
    currentUser = user;
    screenAbort = new AbortController();
    shellElement = createAuthenticatedShell({
      documentRef,
      onLogout: () => {
        void logoutAdminSession({
          abortController: screenAbort,
          api,
          authStore,
          destroyCurrentScreen,
          showLogin
        });
      },
      onNavigate: (section) => navigate(section),
      user
    });
    root.replaceChildren(
      shellElement
    );
    if (autoLoadScreens) {
      navigate("sites");
    }
    root.focus();
  }

  function navigate(section, params = {}) {
    if (shellElement === null || currentUser === null) {
      return false;
    }

    if (currentScreen?.isMutationBusy?.() === true) {
      shellElement.setStatus("Дождитесь завершения текущего действия.");
      return false;
    }

    switch (section) {
      case "audit":
        showAudit();
        return true;
      case "categories":
        showCategories();
        return true;
      case "sites":
        showSitesList();
        return true;
      case "users":
        showUsers();
        return true;
      default:
        destroyCurrentScreen();
        shellElement.showPlaceholder("Раздел");
        return true;
    }
  }

  function showSitesList() {
    destroyCurrentScreen();
    shellElement.setActiveSection("sites");
    currentScreen = createSitesListScreen({
      apiClient: api,
      documentRef,
      onCreate: () => {
        showSiteEditor("create");
      },
      onEdit: (siteId) => {
        showSiteEditor("edit", siteId);
      },
      onImages: showImageManager,
      onStatus: shellElement.setStatus,
      role: currentUser.role
    });
    shellElement.showContent("Сайты", currentScreen.element);
    void currentScreen.load();
  }

  function showSiteEditor(mode, siteId) {
    destroyCurrentScreen();
    currentScreen = createSiteEditorScreen({
      apiClient: api,
      documentRef,
      mode,
      onCancel: showSitesList,
      onImages: showImageManager,
      onSaved: showSitesList,
      onStatus: shellElement.setStatus,
      role: currentUser.role,
      ...(siteId === undefined ? {} : { siteId })
    });
    shellElement.showContent(mode === "create" ? "Создать draft" : "Редактировать карточку", currentScreen.element);
    void currentScreen.load();
  }

  function showCategories() {
    destroyCurrentScreen();
    shellElement.setActiveSection("categories");
    currentScreen = createCategoriesScreen({
      apiClient: api,
      documentRef,
      onStatus: shellElement.setStatus,
      role: currentUser.role
    });
    shellElement.showContent("Категории", currentScreen.element);
    void currentScreen.load();
  }

  function showUsers() {
    destroyCurrentScreen();
    shellElement.setActiveSection("users");
    currentScreen = createUsersScreen({
      apiClient: api,
      currentUser,
      documentRef,
      onStatus: shellElement.setStatus,
      role: currentUser.role
    });
    shellElement.showContent("Пользователи", currentScreen.element);
    void currentScreen.load();
  }

  function showAudit() {
    destroyCurrentScreen();
    shellElement.setActiveSection("audit");
    currentScreen = createAuditScreen({
      apiClient: api,
      documentRef,
      onStatus: shellElement.setStatus,
      role: currentUser.role
    });
    shellElement.showContent("Журнал", currentScreen.element);
    void currentScreen.load();
  }

  function showImageManager(siteId) {
    destroyCurrentScreen();
    currentScreen = createImageManagerScreen({
      apiClient: api,
      documentRef,
      onBack: showSitesList,
      onSiteUpdated: () => {},
      onStatus: shellElement.setStatus,
      role: currentUser.role,
      siteId
    });
    shellElement.showContent("Изображения", currentScreen.element);
    void currentScreen.load();
  }

  function destroyCurrentScreen() {
    if (currentScreen !== null) {
      currentScreen.destroy();
      currentScreen = null;
    }
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
      destroyCurrentScreen();
      abortScreenRequests();
      unsubscribe();
    }
  };
}

export async function logoutAdminSession({ abortController, api, authStore, destroyCurrentScreen, showLogin }) {
  authStore.setState("LOGGING_OUT");
  authStore.clear();
  destroyCurrentScreen?.();
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
