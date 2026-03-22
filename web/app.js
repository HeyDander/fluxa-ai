const messages = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const sendButton = document.getElementById("send-button");
const newChatButton = document.getElementById("new-chat");
const logoutButton = document.getElementById("logout-button");
const accountName = document.getElementById("account-name");

const authOverlay = document.getElementById("auth-overlay");
const authForm = document.getElementById("auth-form");
const authSubmit = document.getElementById("auth-submit");
const authError = document.getElementById("auth-error");
const authUsername = document.getElementById("auth-username");
const authPassword = document.getElementById("auth-password");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");

let authMode = "login";

function setComposerEnabled(enabled) {
  input.disabled = !enabled;
  sendButton.disabled = !enabled;
}

function clearMessages() {
  messages.innerHTML = "";
  appendMessage("bot", "Новый чат начат. Напиши сообщение.");
}

function appendMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "bot" ? "AI" : "YOU";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  article.appendChild(avatar);
  article.appendChild(bubble);
  messages.appendChild(article);
  messages.scrollTop = messages.scrollHeight;
}

function setAuthMode(mode) {
  authMode = mode;
  tabLogin.classList.toggle("active", mode === "login");
  tabRegister.classList.toggle("active", mode === "register");
  authSubmit.textContent = mode === "login" ? "Войти" : "Создать аккаунт";
  authError.textContent = "";
}

async function request(path, payload = null) {
  const options = {
    credentials: "same-origin",
    headers: {},
  };

  if (payload !== null) {
    options.method = "POST";
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(payload);
  }

  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Ошибка");
  }
  return data;
}

function applyUser(user) {
  const loggedIn = Boolean(user);
  authOverlay.classList.toggle("hidden", loggedIn);
  logoutButton.classList.toggle("hidden", !loggedIn);
  accountName.textContent = loggedIn ? `Вход: ${user.username}` : "Не выполнен вход";
  setComposerEnabled(loggedIn);
  if (loggedIn) {
    input.focus();
  }
}

async function boot() {
  try {
    const data = await request("/api/me");
    applyUser(data.user);
  } catch {
    applyUser(null);
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  authSubmit.disabled = true;

  try {
    const path = authMode === "login" ? "/api/login" : "/api/register";
    const data = await request(path, {
      username: authUsername.value.trim(),
      password: authPassword.value,
    });
    applyUser(data.user);
    clearMessages();
    authPassword.value = "";
  } catch (error) {
    authError.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
  }
});

tabLogin.addEventListener("click", () => setAuthMode("login"));
tabRegister.addEventListener("click", () => setAuthMode("register"));

logoutButton.addEventListener("click", async () => {
  await request("/api/logout", {});
  applyUser(null);
});

newChatButton.addEventListener("click", () => {
  clearMessages();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  appendMessage("user", message);
  input.value = "";
  setComposerEnabled(false);

  try {
    const data = await request("/api/chat", { message });
    appendMessage("bot", data.reply);
  } catch (error) {
    appendMessage("bot", error.message);
  } finally {
    setComposerEnabled(true);
    input.focus();
  }
});

boot();
