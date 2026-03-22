const messages = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const sendButton = document.getElementById("send-button");
const newChatButton = document.getElementById("new-chat");
const tasksButton = document.getElementById("tasks-button");
const deleteChatButton = document.getElementById("delete-chat");
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
const referralField = document.getElementById("referral-field");
const authReferral = document.getElementById("auth-referral");
const creditsBalance = document.getElementById("credits-balance");
const referralCode = document.getElementById("referral-code");
const referralCount = document.getElementById("referral-count");
const creditHistory = document.getElementById("credit-history");
const tasksList = document.getElementById("tasks-list");
const tasksOverlay = document.getElementById("tasks-overlay");
const closeTasksButton = document.getElementById("close-tasks");
const bonusToast = document.getElementById("bonus-toast");

let authMode = "login";
let typingNode = null;
let toastTimer = null;

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

function showTyping(text = "Думаю...") {
  hideTyping();
  const article = document.createElement("article");
  article.className = "message bot typing";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `<span>${text}</span><div class="typing-dots"><i></i><i></i><i></i></div>`;

  article.appendChild(avatar);
  article.appendChild(bubble);
  messages.appendChild(article);
  messages.scrollTop = messages.scrollHeight;
  typingNode = article;
}

function hideTyping() {
  if (typingNode) {
    typingNode.remove();
    typingNode = null;
  }
}

function showBonusToast(text) {
  if (!bonusToast || !text) return;
  bonusToast.textContent = text;
  bonusToast.classList.remove("hidden");
  requestAnimationFrame(() => {
    bonusToast.classList.add("visible");
  });
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    bonusToast.classList.remove("visible");
    setTimeout(() => bonusToast.classList.add("hidden"), 220);
  }, 3200);
}

function setAuthMode(mode) {
  authMode = mode;
  tabLogin.classList.toggle("active", mode === "login");
  tabRegister.classList.toggle("active", mode === "register");
  referralField.classList.toggle("hidden", mode !== "register");
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
  tasksButton.classList.toggle("hidden", !loggedIn);
  if (!loggedIn) {
    tasksOverlay.classList.add("hidden");
  }
  accountName.textContent = loggedIn ? `Вход: ${user.username}` : "Не выполнен вход";
  creditsBalance.textContent = loggedIn ? `${user.credits} кредитов` : "0 кредитов";
  referralCode.textContent = loggedIn ? `Код: ${user.referral_code}` : "Код: -";
  referralCount.textContent = loggedIn ? `Приглашено: ${user.referrals}` : "Приглашено: 0";
  renderCreditHistory(loggedIn ? user.credit_history : []);
  renderTasks(loggedIn ? user.tasks : []);
  setComposerEnabled(loggedIn);
  if (loggedIn && user.daily_bonus_awarded) {
    showBonusToast(`Ежедневный бонус: +${user.daily_bonus_amount} кредитов`);
  }
  if (loggedIn) {
    input.focus();
  }
}

function renderCreditHistory(items) {
  creditHistory.innerHTML = "";
  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint-small";
    empty.textContent = "Пока пусто.";
    creditHistory.appendChild(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "history-item";

    const top = document.createElement("div");
    top.className = "history-top";

    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = item.title;

    const amount = document.createElement("div");
    amount.className = `history-amount ${item.amount >= 0 ? "plus" : "minus"}`;
    amount.textContent = `${item.amount >= 0 ? "+" : ""}${item.amount}`;

    const desc = document.createElement("div");
    desc.className = "hint-small";
    desc.textContent = item.description;

    const time = document.createElement("div");
    time.className = "hint-small";
    time.textContent = item.created_at;

    top.append(title, amount);
    row.append(top, desc, time);
    creditHistory.appendChild(row);
  }
}

function renderTasks(tasks) {
  tasksList.innerHTML = "";
  for (const task of tasks || []) {
    const card = document.createElement("div");
    card.className = "task-card";

    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = `${task.title} · +${task.reward}`;

    const desc = document.createElement("div");
    desc.className = "hint-small";
    desc.textContent = task.description;

    const progress = document.createElement("div");
    progress.className = "hint-small";
    progress.textContent = `Прогресс: ${task.progress}/${task.target}`;

    const button = document.createElement("button");
    button.className = "action-button ghost task-button";
    if (task.claimed) {
      button.textContent = "Получено";
      button.disabled = true;
    } else if (task.completed) {
      button.textContent = "Забрать";
      button.addEventListener("click", async () => {
        const data = await request("/api/tasks/claim", { task_id: task.id });
        applyUser(data.user);
      });
    } else {
      button.textContent = "Не выполнено";
      button.disabled = true;
    }

    card.append(title, desc, progress, button);
    tasksList.appendChild(card);
  }
}

function renderHistory(history) {
  messages.innerHTML = "";
  if (!history || history.length === 0) {
    appendMessage("bot", "Привет. Напиши сообщение, и я отвечу.");
    return;
  }
  for (const item of history) {
    appendMessage(item.role, item.text);
  }
}

async function boot() {
  try {
    const data = await request("/api/me");
    applyUser(data.user);
    renderHistory(data.history);
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
      referral_code: authReferral.value.trim(),
    });
    applyUser(data.user);
    clearMessages();
    authPassword.value = "";
    authReferral.value = "";
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

tasksButton.addEventListener("click", () => {
  tasksOverlay.classList.remove("hidden");
});

closeTasksButton.addEventListener("click", () => {
  tasksOverlay.classList.add("hidden");
});

deleteChatButton.addEventListener("click", async () => {
  await request("/api/chat/clear", {});
  clearMessages();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  appendMessage("user", message);
  input.value = "";
  setComposerEnabled(false);
  showTyping(/ищи|найди|что такое|че такое/i.test(message) ? "Ищу..." : "Думаю...");

  try {
    const data = await request("/api/chat", { message });
    hideTyping();
    appendMessage("bot", data.reply);
    if (data.user) {
      applyUser(data.user);
    }
  } catch (error) {
    hideTyping();
    appendMessage("bot", error.message);
  } finally {
    hideTyping();
    setComposerEnabled(true);
    input.focus();
  }
});

boot();
