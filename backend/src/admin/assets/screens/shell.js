const NAVIGATION = Object.freeze([
  { id: "sites", label: "Сайты", roles: ["admin", "editor"] },
  { id: "categories", label: "Категории", roles: ["admin", "editor"] },
  { id: "users", label: "Пользователи", roles: ["admin"] },
  { id: "audit", label: "Журнал", roles: ["admin"] }
]);

const ROLE_LABELS = Object.freeze({
  admin: "Администратор",
  editor: "Редактор"
});

export function createAuthenticatedShell(options) {
  const documentRef = options?.documentRef ?? document;
  const user = normalizeUser(options?.user);
  const onNavigate = typeof options?.onNavigate === "function" ? options.onNavigate : () => {};
  const onLogout = typeof options?.onLogout === "function" ? options.onLogout : () => {};
  let activeSection = "sites";

  const contentTitle = element(documentRef, "h2", {
    tabindex: "-1"
  }, ["Сайты"]);
  const contentNote = element(documentRef, "p", {}, [
    "Раздел будет подключён на следующем этапе"
  ]);
  const content = element(documentRef, "section", {
    "aria-labelledby": "admin-content-title",
    class: "admin-shell-content",
    role: "region",
    tabindex: "-1"
  }, [contentTitle, contentNote]);
  const status = element(documentRef, "p", {
    "aria-live": "polite",
    class: "admin-shell-status"
  }, ["Открыт раздел: Сайты"]);
  const navItems = visibleNavigation(user.role).map((item) => {
    const button = element(documentRef, "button", {
      "aria-current": item.id === activeSection ? "page" : "false",
      "data-section": item.id,
      type: "button"
    }, [item.label]);

    button.addEventListener("click", () => {
      const navigationResult = onNavigate(item.id);

      if (navigationResult === false) {
        return;
      }

      activeSection = item.id;
      setActiveSection(item.id);
      if (navigationResult !== true) {
        showPlaceholder(item.label);
        content.focus();
      }
    });

    return button;
  });
  const nav = element(documentRef, "nav", {
    "aria-label": "Разделы панели",
    class: "admin-shell-nav"
  }, navItems);
  const logoutButton = element(documentRef, "button", {
    "data-action": "logout",
    type: "button"
  }, ["Выйти"]);

  logoutButton.addEventListener("click", () => {
    status.textContent = "Завершение сеанса...";
    onLogout();
  });

  contentTitle.setAttribute("id", "admin-content-title");

  const shell = element(documentRef, "section", { class: "admin-shell" }, [
    element(documentRef, "header", { class: "admin-shell-header" }, [
      element(documentRef, "div", {}, [
        element(documentRef, "p", { class: "admin-kicker" }, ["WEB00"]),
        element(documentRef, "h1", {}, ["Панель управления"])
      ]),
      element(documentRef, "div", { class: "admin-shell-user" }, [
        element(documentRef, "span", {}, [user.email]),
        element(documentRef, "strong", {}, [ROLE_LABELS[user.role]]),
        logoutButton
      ])
    ]),
    element(documentRef, "div", { class: "admin-shell-body" }, [
      nav,
      element(documentRef, "main", { class: "admin-shell-main" }, [content, status])
    ])
  ]);

  shell.contentRegion = content;
  shell.setActiveSection = setActiveSection;
  shell.setStatus = (message) => {
    status.textContent = message;
  };
  shell.showContent = (title, ...children) => {
    contentTitle.textContent = title;
    content.replaceChildren(contentTitle, ...children);
    contentTitle.focus();
  };
  shell.showPlaceholder = showPlaceholder;

  return shell;

  function setActiveSection(section) {
    activeSection = section;
    for (const navButton of nav.querySelectorAll("[data-section]")) {
      navButton.setAttribute(
        "aria-current",
        navButton.getAttribute("data-section") === activeSection ? "page" : "false"
      );
    }
  }

  function showPlaceholder(label) {
    contentTitle.textContent = label;
    contentNote.textContent = "Раздел будет подключён на следующем этапе";
    content.replaceChildren(contentTitle, contentNote);
    status.textContent = `Открыт раздел: ${label}`;
    contentTitle.focus();
  }
}

export function visibleNavigation(role) {
  return NAVIGATION
    .filter((item) => item.roles.includes(role))
    .map(({ id, label }) => ({ id, label }));
}

function normalizeUser(input) {
  if (
    typeof input === "object" &&
    input !== null &&
    typeof input.email === "string" &&
    typeof input.id === "string" &&
    (input.role === "admin" || input.role === "editor")
  ) {
    return {
      email: input.email,
      id: input.id,
      role: input.role
    };
  }

  throw new Error("Authenticated shell requires a safe user.");
}

function element(documentRef, tagName, attributes = {}, children = []) {
  const node = documentRef.createElement(tagName);

  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }

  node.append(...children);

  return node;
}
