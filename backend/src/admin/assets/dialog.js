import {
  createElement,
  createLiveRegion,
  createRequestIdControl,
  replaceContent,
  setBusy
} from "./dom.js";

let dialogCounter = 0;

export function createConfirmationDialog(options) {
  const documentRef = options?.documentRef ?? document;
  const titleId = `admin-confirm-title-${dialogCounter}`;
  const descriptionId = `admin-confirm-description-${dialogCounter}`;
  dialogCounter += 1;

  const onCancel = typeof options?.onCancel === "function" ? options.onCancel : () => {};
  const onConfirm = typeof options?.onConfirm === "function" ? options.onConfirm : () => {};
  const confirmationText = typeof options?.confirmationText === "string" && options.confirmationText.length > 0
    ? options.confirmationText
    : null;
  let busy = false;
  let destroyed = false;
  let invoker = null;
  let opened = false;

  const errorRegion = createLiveRegion({
    className: "admin-dialog-error",
    documentRef,
    politeness: "assertive"
  });
  errorRegion.setAttribute("role", "alert");
  const typedInput = confirmationText === null ? null : createElement("input", {
    documentRef,
    attributes: {
      autocomplete: "off",
      name: "typedConfirmation",
      type: "text"
    }
  });
  const cancelButton = createElement("button", {
    documentRef,
    text: options?.cancelLabel ?? "Отмена",
    attributes: {
      "data-action": "cancel-dialog",
      type: "button"
    }
  });
  const confirmButton = createElement("button", {
    documentRef,
    text: options?.confirmLabel ?? "Подтвердить",
    attributes: {
      "data-action": "confirm-dialog",
      type: "submit"
    }
  });
  const form = createElement("form", {
    documentRef,
    className: "admin-dialog-panel",
    children: [
      createElement("h3", {
        documentRef,
        text: options?.title ?? "Подтверждение",
        attributes: {
          id: titleId
        }
      }),
      createElement("p", {
        documentRef,
        text: options?.description ?? "",
        attributes: {
          id: descriptionId
        }
      }),
      ...(typedInput === null
        ? []
        : [
            createElement("label", {
              documentRef,
              className: "admin-field admin-dialog-typed",
              children: [
                createElement("span", {
                  documentRef,
                  text: `Введите: ${confirmationText}`
                }),
                typedInput
              ]
            })
          ]),
      errorRegion,
      createElement("div", {
        documentRef,
        className: "admin-dialog-actions",
        children: [cancelButton, confirmButton]
      })
    ]
  });
  const element = documentRef.createElement("dialog");
  element.setAttribute("class", "admin-dialog");
  element.setAttribute("aria-describedby", descriptionId);
  element.setAttribute("aria-labelledby", titleId);
  element.setAttribute("data-open", "false");
  element.setAttribute("data-variant", options?.destructive === true ? "destructive" : "default");
  element.setAttribute("role", "dialog");
  element.append(form);

  cancelButton.addEventListener("click", () => {
    if (busy) {
      return;
    }

    close();
    onCancel();
  });
  confirmButton.addEventListener("click", (event) => {
    void runConfirm(event);
  });
  form.addEventListener("submit", (event) => {
    void runConfirm(event);
  });
  typedInput?.addEventListener("input", updateConfirmState);
  updateConfirmState();

  return {
    close,
    destroy,
    element,
    open,
    setBusy: setDialogBusy,
    setError
  };

  function open(nextInvoker) {
    if (destroyed || opened) {
      return;
    }

    invoker = nextInvoker ?? null;
    opened = true;
    element.setAttribute("data-open", "true");
    clearError();
    if (typedInput !== null) {
      typedInput.value = "";
    }
    updateConfirmState();
    element.addEventListener("cancel", handleCancel);
    element.addEventListener("close", handleNativeClose);
    element.addEventListener("keydown", handleTabKeydown);
    if (typeof element.showModal === "function") {
      element.showModal();
    } else {
      element.setAttribute("open", "");
    }
    focusInitialControl();
  }

  function close() {
    if (!opened) {
      return;
    }

    if (element.hasAttribute?.("open")) {
      element.close();
      if (!opened) {
        return;
      }
    }
    finalizeClose();
  }

  function destroy() {
    close();
    destroyed = true;
    element.removeEventListener?.("cancel", handleCancel);
    element.removeEventListener?.("close", handleNativeClose);
    element.removeEventListener?.("keydown", handleTabKeydown);
  }

  async function runConfirm(event) {
    event.preventDefault();
    if (busy || !opened || !isTypedConfirmationValid()) {
      return;
    }

    setDialogBusy(true);
    clearError();

    try {
      await onConfirm();
      close();
    } catch (error) {
      setError(safeMessage(error), safeRequestId(error));
    } finally {
      setDialogBusy(false);
    }
  }

  function setDialogBusy(nextBusy) {
    busy = nextBusy === true;
    setBusy(confirmButton, busy);
    setBusy(cancelButton, busy);
    updateConfirmState();
  }

  function setError(message, requestId) {
    const children = [
      createElement("span", {
        documentRef,
        text: message ?? "Не удалось выполнить действие."
      })
    ];

    if (typeof requestId === "string" && requestId.length > 0) {
      children.push(createRequestIdControl(requestId, { documentRef }));
    }

    replaceContent(errorRegion, ...children);
  }

  function clearError() {
    replaceContent(errorRegion);
  }

  function updateConfirmState() {
    const disabled = busy || !isTypedConfirmationValid();
    confirmButton.disabled = disabled;
    if (disabled) {
      confirmButton.setAttribute("disabled", "");
      return;
    }

    confirmButton.removeAttribute?.("disabled");
  }

  function isTypedConfirmationValid() {
    return confirmationText === null || typedInput?.value === confirmationText;
  }

  function handleCancel(event) {
    if (!opened || busy) {
      event.preventDefault?.();
      return;
    }
    event.preventDefault?.();
    close();
    onCancel();
  }

  function handleNativeClose() {
    finalizeClose();
  }

  function handleTabKeydown(event) {
    if (!opened || event.key !== "Tab") {
      return;
    }

    const controls = getFocusableControls();
    if (controls.length === 0) {
      event.preventDefault?.();
      element.focus?.();
      return;
    }

    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = documentRef.activeElement;
    if (event.shiftKey === true) {
      if (active === first || !containsNode(element, active)) {
        event.preventDefault?.();
        last.focus?.();
      }
      return;
    }

    if (active === last || !containsNode(element, active)) {
      event.preventDefault?.();
      first.focus?.();
    }
  }

  function finalizeClose() {
    if (!opened) {
      return;
    }

    opened = false;
    element.setAttribute("data-open", "false");
    element.removeEventListener?.("cancel", handleCancel);
    element.removeEventListener?.("close", handleNativeClose);
    element.removeEventListener?.("keydown", handleTabKeydown);
    clearError();
    if (typedInput !== null) {
      typedInput.value = "";
    }
    updateConfirmState();
    if (invoker !== null && typeof invoker.focus === "function") {
      invoker.focus();
    }
  }

  function focusInitialControl() {
    const target = typedInput ?? cancelButton;
    if (typeof target.focus === "function") {
      target.focus();
    }
  }

  function getFocusableControls() {
    return [
      ...form.querySelectorAll("input"),
      ...form.querySelectorAll("button"),
      ...form.querySelectorAll("select"),
      ...form.querySelectorAll("textarea"),
      ...form.querySelectorAll("a")
    ].filter(isFocusableControl);
  }
}

function isFocusableControl(node) {
  return (
    node !== null &&
    node !== undefined &&
    node.disabled !== true &&
    node.getAttribute?.("disabled") === null &&
    node.getAttribute?.("tabindex") !== "-1" &&
    typeof node.focus === "function"
  );
}

function containsNode(root, node) {
  let current = node ?? null;
  while (current !== null && current !== undefined) {
    if (current === root) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

function safeMessage(error) {
  if (typeof error?.message === "string" && error.message.length > 0) {
    return error.message;
  }

  return "Не удалось выполнить действие.";
}

function safeRequestId(error) {
  return typeof error?.requestId === "string" ? error.requestId : null;
}
