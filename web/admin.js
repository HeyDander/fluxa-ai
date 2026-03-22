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
const operatorForm = document.getElementById("operator-form");
const operatorMessage = document.getElementById("operator-message");
const operatorError = document.getElementById("operator-error");
const funActions = document.getElementById("fun-actions");
const funActionsError = document.getElementById("fun-actions-error");

let allUsers = [];
let apiBaseUrl = localStorage.getItem("fluxa_admin_api_url") || "";
let adminApiKey = localStorage.getItem("fluxa_admin_api_key") || "";
let activeUsername = "";
let liveUsersTimer = null;
let usersRequestInFlight = false;

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
    title.innerHTML = `<strong>${user.username}</strong><div class="muted">${user.banned ? "Заблокирован" : "Активен"}</div>`;

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
    grantInput.value = "400";
    grantInput.className = "grant-input";

    const grantButton = document.createElement("button");
    grantButton.className = "admin-button";
    grantButton.textContent = "Выдать";
    grantButton.addEventListener("click", async () => {
      await request("/api/admin/grant-credits", {
        username: user.username,
        amount: Number(grantInput.value || 0),
      });
      await loadUsers();
    });

    const banButton = document.createElement("button");
    banButton.className = "admin-button ghost";
    banButton.textContent = user.banned ? "Разбанить" : "Забанить";
    banButton.addEventListener("click", async () => {
      await request("/api/admin/toggle-ban", { username: user.username });
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
    actions.append(grantInput, grantButton, banButton);
    card.append(titleRow, stats, actions, history);
    usersList.appendChild(card);
  }
}

function selectUser(username) {
  const user = allUsers.find((item) => item.username === username);
  if (!user) return;
  activeUsername = username;
  selectedUserPanel.classList.remove("hidden");
  selectedUsername.textContent = user.username;
  selectedUserMeta.textContent = `${user.banned ? "Заблокирован" : "Активен"} · ${user.credits} кр. · Сообщений: ${user.messages_sent}`;
  selectedChat.innerHTML = "";

  const recent = user.recent_chat || [];
  if (!recent.length) {
    selectedChat.innerHTML = `<div class="muted">Чат пока пустой</div>`;
    return;
  }

  for (const item of recent) {
    const line = document.createElement("div");
    line.className = `chat-line ${item.role}`;
    line.textContent = `${item.role === "user" ? "User" : "Bot"}: ${item.text}`;
    selectedChat.appendChild(line);
  }
}

async function sendSupportMessage(text) {
  await request("/api/admin/send-message", {
    username: activeUsername,
    text,
  });
}

async function runFunAction(action) {
  funActionsError.textContent = "";
  if (!activeUsername) {
    funActionsError.textContent = "Сначала выбери пользователя.";
    return;
  }
  try {
    if (action.credits) {
      await request("/api/admin/grant-credits", {
        username: activeUsername,
        amount: action.credits,
      });
    }
    await sendSupportMessage(action.text);
    await loadUsers();
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
    if (activeUsername) {
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
  setAdminState(false);
});
userSearch.addEventListener("input", () => renderUsers(allUsers));

operatorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  operatorError.textContent = "";
  if (!activeUsername) {
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
    await loadUsers();
  } catch (error) {
    operatorError.textContent = error.message;
  }
});

renderFunActions();
boot();
