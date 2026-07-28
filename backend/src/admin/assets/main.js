const root = document.querySelector("#admin-root");

if (root !== null) {
  const shell = document.createElement("section");
  const title = document.createElement("h1");
  const note = document.createElement("p");

  shell.className = "admin-wave-shell";
  title.className = "admin-wave-title";
  note.className = "admin-wave-note";
  title.textContent = "Панель управления WEB00";
  note.textContent = "Основа защищенной панели загружена.";

  shell.append(title, note);
  root.replaceChildren(shell);
}
