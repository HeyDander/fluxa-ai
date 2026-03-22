const loginView = document.getElementById("admin-login-view");
const dashboard = document.getElementById("admin-dashboard");
const loginForm = document.getElementById("admin-login-form");
const loginError = document.getElementById("admin-login-error");
const apiUrlInput = document.getElementById("admin-api-url");
const apiKeyInput = document.getElementById("admin-api-key");
const usersList = document.getElementById("users-list");
const adminStatus = document.getElementById("admin-status");
const refreshUsersButton = document.getElementById("refresh-users");
const adminLogoutButton = document.getElementById("admin-logout");
const userSearch = document.getElementById("user-search");
const usersSummary = document.getElementById("users-summary");
const selectedUserPanel = document.getElementById("selected-user-panel");
const selectedUsername = document.getElementById("selected-username");
const selectedUserMeta = document.getElementById("selected-user-meta");
const selectedChat = document.getElementById("selected-chat");
const globalChatAdminButton = document.getElementById("global-chat-admin-button");
const operatorForm = document.getElementById("operator-form");
const operatorMessage = document.getElementById("operator-message");
const operatorError = document.getElementById("operator-error");
const funActions = document.getElementById("fun-actions");
const funActionsError = document.getElementById("fun-actions-error");

let allUsers = [];
let apiBaseUrl = localStorage.getItem("fluxa_admin_api_url") || "";
let adminApiKey = localStorage.getItem("fluxa_admin_api_key") || "";
let activeUsername = "";
let activePanelMode = "user";
let liveUsersTimer = null;
let usersRequestInFlight = false;
let grantAmountDraft = localStorage.getItem("fluxa_admin_grant_amount") || "400";
const MAX_GRANT_AMOUNT = 1_000_000_000_000;

const FUN_ACTIONS = [
  {
    label: "Шутка дня",
    text: "Шутка дня: если код заработал с первого раза, где-то рядом точно сидит маг. 😄",
  },
  {
    label: "Комплимент",
    text: "Небольшой комплимент от поддержки: ты хорошо держишь темп. Так и продолжай 🙂",
  },
  {
    label: "Подбодрить",
    text: "Небольшое напоминание: даже если сейчас всё криво, это не значит, что ты далеко от нормального результата. ✨",
  },
  {
    label: "Загадка",
    text: "Загадка: чем больше берёшь, тем больше оставляешь. Что это? 👀",
  },
  {
    label: "Мини-анекдот",
    text: "Мини-анекдот: программист заходит в бар, заказывает 1 пиво, 10 пива, 0 пива и -1 пиво. 😂",
  },
  {
    label: "Факт",
    text: "Факт дня: осьминоги имеют три сердца. Просто чтобы день стал чуть интереснее 🐙",
  },
  {
    label: "Мемная фраза",
    text: "Официальное сообщение поддержки: держим вайб, не паникуем, красиво доходим до результата 😎",
  },
  {
    label: "Удачи",
    text: "Поддержка fluxa-ai желает тебе удачи. Пусть следующий ответ или идея попадут прямо в цель 🍀",
  },
  {
    label: "Секретный бонус",
    text: "Небольшой сюрприз от поддержки: тебе прилетел бонус на баланс. Пользуйся с кайфом 🎁",
    credits: 25,
  },
  {
    label: "Колесо настроения",
    text: "Колесо настроения крутилось-крутилось и выбрало режим: сегодня ты опасно близок к красивой победе 🔮",
  },
];

apiUrlInput.value = apiBaseUrl;
apiKeyInput.value = adminApiKey;

function normalizeBaseUrl(url) {
  return url.trim().replace(/\/+$/, "");
}

async function request(path, payload = null) {
  if (!apiBaseUrl || !adminApiKey) {
    throw new Error("Сначала укажи API URL и API key.");
  }

  const options = {
    headers: {
      "X-Admin-Key": adminApiKey,
    },
  };

  if (payload !== null) {
    options.method = "POST";
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(payload);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Ошибка");
  }
  return data;
}

function setAdminState(connected) {
  loginView.classList.toggle("hidden", connected);
  dashboard.classList.toggle("hidden", !connected);
  refreshUsersButton.classList.toggle("hidden", !connected);
  adminLogoutButton.classList.toggle("hidden", !connected);
  adminStatus.textContent = connected ? `Подключено к: ${apiBaseUrl}` : "Нет подключения";
}

function stopLiveUsersSync() {
  if (liveUsersTimer) {
    clearInterval(liveUsersTimer);
    liveUsersTimer = null;
  }
}

function startLiveUsersSync() {
  stopLiveUsersSync();
  liveUsersTimer = setInterval(() => {
    void loadUsers(true);
  }, 2000);
}

function renderUsers(users) {
  const query = userSearch.value.trim().toLowerCase();
  const filtered = users.filter((user) => user.username.toLowerCase().includes(query));
  usersSummary.textContent = `Пользователей: ${users.length}`;
  usersList.innerHTML = "";

  for (const user of filtered) {
    const card = document.createElement("article");
    card.className = "user-card";
    card.addEventListener("click", () => selectUser(user.username));

    const titleRow = document.createElement("div");
    titleRow.className = "user-row";

    const title = document.createElement("div");
    const statusText = user.banned
      ? user.banned_until
        ? `Во временном бане до ${user.banned_until.replace("T", " ")}`
        : "Заблокирован"
      : "Активен";
    title.innerHTML = `<strong>${user.username}</strong><div class="muted">${statusText}</div>`;

    const credits = document.createElement("div");
    credits.className = "credit-badge";
    credits.textContent = `${user.credits} кр.`;

    const stats = document.createElement("div");
    stats.className = "user-stats";
    stats.textContent = `Сообщений: ${user.messages_sent} · Поисков: ${user.searches_used} · Рефералов: ${user.referrals}`;

    const actions = document.createElement("div");
    actions.className = "user-actions";

    const grantInput = document.createElement("input");
    grantInput.type = "number";
    grantInput.min = "0";
    grantInput.max = String(MAX_GRANT_AMOUNT);
    grantInput.step = "1";
    grantInput.value = grantAmountDraft;
    grantInput.className = "grant-input";
    grantInput.addEventListener("input", () => {
      const numeric = Number(grantInput.value || 0);
      if (Number.isFinite(numeric) && numeric > MAX_GRANT_AMOUNT) {
        grantInput.value = String(MAX_GRANT_AMOUNT);
      }
      grantAmountDraft = grantInput.value || "0";
      localStorage.setItem("fluxa_admin_grant_amount", grantAmountDraft);
    });

    const grantButton = document.createElement("button");
    grantButton.className = "admin-button";
    grantButton.textContent = "Выдать";
    grantButton.addEventListener("click", async () => {
      const amount = Number(grantInput.value || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        loginError.textContent = "Введи нормальное число кредитов.";
        return;
      }
      if (amount > MAX_GRANT_AMOUNT) {
        loginError.textContent = `Максимум за раз: ${MAX_GRANT_AMOUNT}.`;
        return;
      }
      await request("/api/admin/grant-credits", {
        username: user.username,
        amount,
      });
      grantAmountDraft = grantInput.value || grantAmountDraft;
      localStorage.setItem("fluxa_admin_grant_amount", grantAmountDraft);
      await loadUsers();
    });

    const banButton = document.createElement("button");
    banButton.className = "admin-button ghost";
    banButton.textContent = user.banned ? "Разбанить" : "Забанить";
    banButton.addEventListener("click", async () => {
      await request("/api/admin/toggle-ban", { username: user.username });
      await loadUsers();
    });

    const tempBanButton = document.createElement("button");
    tempBanButton.className = "admin-button ghost";
    tempBanButton.textContent = "Бан на время";
    tempBanButton.addEventListener("click", async () => {
      const raw = window.prompt("На сколько минут забанить пользователя?", "60");
      if (raw === null) return;
      const minutes = Number(raw);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        loginError.textContent = "Нужно положительное число минут.";
        return;
      }
      await request("/api/admin/ban-temporary", { username: user.username, minutes: Math.round(minutes) });
      await loadUsers();
    });

    const deleteUserButton = document.createElement("button");
    deleteUserButton.className = "admin-button ghost";
    deleteUserButton.textContent = "Удалить";
    deleteUserButton.addEventListener("click", async () => {
      if (!window.confirm(`Удалить пользователя ${user.username}? Это сотрёт чат и сессию.`)) {
        return;
      }
      await request("/api/admin/delete-user", { username: user.username });
      if (activeUsername === user.username) {
        activeUsername = "";
        selectedUserPanel.classList.add("hidden");
        selectedChat.innerHTML = "";
      }
      await loadUsers();
    });

    const history = document.createElement("div");
    history.className = "history-preview";
    history.innerHTML = user.credit_history.length
      ? user.credit_history
          .slice(0, 5)
          .map((item) => `<div class="history-line">${item.created_at} · ${item.title} · ${item.amount > 0 ? "+" : ""}${item.amount}</div>`)
          .join("")
      : `<div class="muted">История пустая</div>`;

    titleRow.append(title, credits);
    actions.append(grantInput, grantButton, banButton, tempBanButton, deleteUserButton);
    card.append(titleRow, stats, actions, history);
    usersList.appendChild(card);
  }
}

function selectUser(username) {
  const user = allUsers.find((item) => item.username === username);
  if (!user) return;
  activePanelMode = "user";
  activeUsername = username;
  selectedUserPanel.classList.remove("hidden");
  selectedUsername.textContent = user.username;
  const statusText = user.banned
    ? user.banned_until
      ? `Во временном бане до ${user.banned_until.replace("T", " ")}`
      : "Заблокирован"
    : "Активен";
  selectedUserMeta.textContent = `${statusText} · ${user.credits} кр. · Сообщений: ${user.messages_sent}`;
  selectedChat.innerHTML = "";

  const recent = user.recent_chat || [];
  if (!recent.length) {
    selectedChat.innerHTML = `<div class="muted">Чат пока пустой</div>`;
    return;
  }

  for (const item of recent) {
    const line = document.createElement("div");
    line.className = `chat-line ${item.role}`;
    const text = document.createElement("div");
    text.className = "chat-line-text";
    text.textContent = `${item.role === "user" ? "User" : "Bot"}: ${item.text}`;

    const actions = document.createElement("div");
    actions.className = "chat-line-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "chat-action-button";
    editButton.textContent = "Изменить";
    editButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const nextText = window.prompt("Новый текст сообщения", item.text);
      if (nextText === null) return;
      const trimmed = nextText.trim();
      if (!trimmed) return;
      try {
        await request("/api/admin/edit-message", {
          username: activeUsername,
          chat_index: item.chat_index,
          text: trimmed,
        });
        await loadUsers();
      } catch (error) {
        operatorError.textContent = error.message;
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "chat-action-button ghost";
    deleteButton.textContent = "Удалить";
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!window.confirm("Удалить это сообщение из чата?")) {
        return;
      }
      try {
        await request("/api/admin/delete-message", {
          username: activeUsername,
          chat_index: item.chat_index,
        });
        await loadUsers();
      } catch (error) {
        operatorError.textContent = error.message;
      }
    });

    actions.append(editButton, deleteButton);
    line.append(text, actions);
    selectedChat.appendChild(line);
  }
}

async function openGlobalChatPanel() {
  activePanelMode = "global";
  activeUsername = "";
  selectedUserPanel.classList.remove("hidden");
  selectedUsername.textContent = "Общий чат";
  selectedUserMeta.textContent = "Все пользователи · режим модерации";
  selectedChat.innerHTML = "";
  funActionsError.textContent = "";
  operatorError.textContent = "";
  const data = await request("/api/admin/global-chat");
  const history = data.history || [];
  if (!history.length) {
    selectedChat.innerHTML = `<div class="muted">Общий чат пока пустой</div>`;
    return;
  }

  for (const item of history) {
    const line = document.createElement("div");
    line.className = `chat-line ${item.role}`;

    const text = document.createElement("div");
    text.className = "chat-line-text";
    const author = item.author ? `${item.author}: ` : "";
    text.textContent = `${author}${item.text}`;

    const actions = document.createElement("div");
    actions.className = "chat-line-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "chat-action-button";
    editButton.textContent = "Изменить";
    editButton.addEventListener("click", async () => {
      const nextText = window.prompt("Новый текст сообщения", item.text);
      if (nextText === null) return;
      const trimmed = nextText.trim();
      if (!trimmed) return;
      try {
        await request("/api/admin/global-chat/edit-message", {
          chat_index: item.chat_index,
          text: trimmed,
        });
        await openGlobalChatPanel();
      } catch (error) {
        operatorError.textContent = error.message;
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "chat-action-button ghost";
    deleteButton.textContent = "Удалить";
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm("Удалить это сообщение из общего чата?")) {
        return;
      }
      try {
        await request("/api/admin/global-chat/delete-message", {
          chat_index: item.chat_index,
        });
        await openGlobalChatPanel();
      } catch (error) {
        operatorError.textContent = error.message;
      }
    });

    actions.append(editButton, deleteButton);
    line.append(text, actions);
    selectedChat.appendChild(line);
  }
}

async function sendSupportMessage(text) {
  if (activePanelMode === "global") {
    await request("/api/admin/global-chat/send-message", { text });
    return;
  }
  await request("/api/admin/send-message", {
    username: activeUsername,
    text,
  });
}

async function runFunAction(action) {
  funActionsError.textContent = "";
  if (!activeUsername && activePanelMode !== "global") {
    funActionsError.textContent = "Сначала выбери пользователя.";
    return;
  }
  try {
    if (action.credits) {
      if (activePanelMode === "global") {
        funActionsError.textContent = "Бонусы доступны только для конкретного пользователя.";
        return;
      }
      await request("/api/admin/grant-credits", {
        username: activeUsername,
        amount: action.credits,
      });
    }
    await sendSupportMessage(action.text);
    if (activePanelMode === "global") {
      await openGlobalChatPanel();
    } else {
      await loadUsers();
    }
  } catch (error) {
    funActionsError.textContent = error.message;
  }
}

function renderFunActions() {
  if (!funActions) return;
  funActions.innerHTML = "";
  for (const action of FUN_ACTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fun-action-button";
    button.textContent = action.credits ? `${action.label} +${action.credits}` : action.label;
    button.addEventListener("click", () => runFunAction(action));
    funActions.appendChild(button);
  }
}

async function loadUsers(silent = false) {
  if (usersRequestInFlight) {
    return;
  }
  usersRequestInFlight = true;
  try {
    const data = await request("/api/admin/users");
    allUsers = data.users || [];
    renderUsers(allUsers);
    if (activePanelMode === "global") {
      await openGlobalChatPanel();
    } else if (activeUsername) {
      selectUser(activeUsername);
    }
  } catch (error) {
    if (!silent) {
      loginError.textContent = error.message;
      throw error;
    }
  } finally {
    usersRequestInFlight = false;
  }
}

async function boot() {
  if (!apiBaseUrl || !adminApiKey) {
    setAdminState(false);
    return;
  }
  try {
    await request("/api/admin/me");
    setAdminState(true);
    await loadUsers();
    startLiveUsersSync();
  } catch (error) {
    setAdminState(false);
    loginError.textContent = error.message;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  apiBaseUrl = normalizeBaseUrl(apiUrlInput.value);
  adminApiKey = apiKeyInput.value.trim();

  if (!apiBaseUrl || !adminApiKey) {
    loginError.textContent = "Нужны API URL и API key.";
    return;
  }

  localStorage.setItem("fluxa_admin_api_url", apiBaseUrl);
  localStorage.setItem("fluxa_admin_api_key", adminApiKey);

  try {
    await request("/api/admin/me");
    setAdminState(true);
    await loadUsers();
    startLiveUsersSync();
  } catch (error) {
    loginError.textContent = error.message;
  }
});

refreshUsersButton.addEventListener("click", loadUsers);
globalChatAdminButton.addEventListener("click", () => {
  void openGlobalChatPanel();
});
adminLogoutButton.addEventListener("click", () => {
  stopLiveUsersSync();
  localStorage.removeItem("fluxa_admin_api_url");
  localStorage.removeItem("fluxa_admin_api_key");
  apiBaseUrl = "";
  adminApiKey = "";
  allUsers = [];
  apiUrlInput.value = "";
  apiKeyInput.value = "";
  usersList.innerHTML = "";
  selectedUserPanel.classList.add("hidden");
  selectedChat.innerHTML = "";
  activeUsername = "";
  activePanelMode = "user";
  setAdminState(false);
});
userSearch.addEventListener("input", () => renderUsers(allUsers));

operatorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  operatorError.textContent = "";
  if (!activeUsername && activePanelMode !== "global") {
    operatorError.textContent = "Сначала выбери пользователя.";
    return;
  }
  const text = operatorMessage.value.trim();
  if (!text) {
    operatorError.textContent = "Напиши сообщение.";
    return;
  }
  try {
    await sendSupportMessage(text);
    operatorMessage.value = "";
    if (activePanelMode === "global") {
      await openGlobalChatPanel();
    } else {
      await loadUsers();
    }
  } catch (error) {
    operatorError.textContent = error.message;
  }
});

renderFunActions();
boot();
