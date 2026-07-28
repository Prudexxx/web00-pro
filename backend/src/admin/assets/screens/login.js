const LOGIN_ERROR_MESSAGES = Object.freeze({
  INVALID_CREDENTIALS: "Почта или пароль указаны неверно.",
  NETWORK_ERROR: "Не удалось связаться с сервером.",
  ORIGIN_NOT_ALLOWED: "Вход с этого адреса недоступен.",
  RATE_LIMITED: "Слишком много попыток. Подождите и попробуйте снова.",
  REQUEST_ABORTED: "Запрос отменён.",
  USER_DISABLED: "Пользователь отключён. Обратитесь к администратору."
});

export function createLoginView(options) {
  const documentRef = options?.documentRef ?? document;
  const onSubmit = options?.onSubmit;

  if (typeof onSubmit !== "function") {
    throw new Error("Login view requires a submit handler.");
  }

  const emailInput = element(documentRef, "input", {
    autocomplete: "email",
    name: "email",
    required: true,
    type: "email"
  });
  const passwordInput = element(documentRef, "input", {
    autocomplete: "current-password",
    name: "password",
    required: true,
    type: "password"
  });
  const submitButton = element(documentRef, "button", {
    type: "submit"
  }, ["Войти"]);
  const status = element(documentRef, "p", {
    "aria-live": "polite",
    class: "admin-login-status"
  });
  const form = element(documentRef, "form", {
    class: "admin-login-form"
  }, [
    element(documentRef, "div", { class: "admin-login-heading" }, [
      element(documentRef, "p", { class: "admin-kicker" }, ["WEB00"]),
      element(documentRef, "h1", {}, ["Вход"]),
      element(documentRef, "p", { class: "admin-login-note" }, [
        "Закрытая панель управления"
      ])
    ]),
    element(documentRef, "label", { class: "admin-field" }, [
      element(documentRef, "span", {}, ["Эл. почта"]),
      emailInput
    ]),
    element(documentRef, "label", { class: "admin-field" }, [
      element(documentRef, "span", {}, ["Пароль"]),
      passwordInput
    ]),
    submitButton,
    status
  ]);
  const view = element(documentRef, "section", {
    "aria-labelledby": "admin-login-title",
    class: "admin-login"
  }, [form]);

  form.querySelector("h1").setAttribute("id", "admin-login-title");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (submitButton.disabled) {
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    passwordInput.value = "";
    setLoading({ status, submitButton }, true);

    try {
      await onSubmit({ email, password });
      status.textContent = "Вход выполнен.";
    } catch (error) {
      status.textContent = toLoginMessage(error);
      emailInput.focus();
    } finally {
      setLoading({ status, submitButton }, false);
    }
  });

  return view;
}

export function toLoginMessage(error) {
  const code = typeof error?.code === "string" ? error.code : "NETWORK_ERROR";

  return LOGIN_ERROR_MESSAGES[code] ?? "Не удалось войти. Проверьте данные и попробуйте снова.";
}

function setLoading({ status, submitButton }, loading) {
  submitButton.disabled = loading;
  submitButton.textContent = loading ? "Проверка..." : "Войти";

  if (loading) {
    status.textContent = "Проверяем доступ...";
  }
}

function element(documentRef, tagName, attributes = {}, children = []) {
  const node = documentRef.createElement(tagName);

  for (const [name, value] of Object.entries(attributes)) {
    if (typeof value === "boolean") {
      if (value) {
        node.setAttribute(name, "");
      }
      continue;
    }

    node.setAttribute(name, value);
  }

  node.append(...children);

  return node;
}
