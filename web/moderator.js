const loginView = document.getElementById("moderator-login-view");
const dashboard = document.getElementById("moderator-dashboard");
const loginForm = document.getElementById("moderator-login-form");
const loginError = document.getElementById("moderator-login-error");
const apiUrlInput = document.getElementById("moderator-api-url");
const apiKeyInput = document.getElementById("moderator-api-key");
const moderatorStatus = document.getElementById("moderator-status");
const refreshButton = document.getElementById("refresh-moderator");
const logoutButton = document.getElementById("moderator-logout");
const userSearch = document.getElementById("moderator-user-search");
const usersSummary = document.getElementById("moderator-users-summary");
const usersList = document.getElementById("moderator-users-list");
const requestsSummary = document.getElementById("moderator-requests-summary");
const requestsList = document.getElementById("moderator-requests-list");
const globalChatButton = document.getElementById("moderator-global-chat-button");
const selectedPanel = document.getElementById("moderator-selected-panel");
const selectedUsername = document.getElementById("moderator-selected-username");
const selectedMeta = document.getElementById("moderator-selected-meta");
const selectedChat = document.getElementById("moderator-selected-chat");
const operatorForm = document.getElementById("moderator-operator-form");
const operatorMessage = document.getElementById("moderator-operator-message");
const operatorError = document.getElementById("moderator-operator-error");
const grantInput = document.getElementById("moderator-grant-input");
const grantButton = document.getElementById("moderator-grant-button");
const banButton = document.getElementById("moderator-ban-button");
const tempBanButton = document.getElementById("moderator-temp-ban-button");
const deleteUserButton = document.getElementById("moderator-delete-user-button");

let apiBaseUrl = localStorage.getItem("fluxa_moderator_api_url") || "";
let moderatorApiKey = localStorage.getItem("fluxa_moderator_api_key") || "";
let allUsers = [];
let allRequests = [];
let activeUsername = "";
let activeMode = "user";
let liveTimer = null;

apiUrlInput.value = apiBaseUrl;
apiKeyInput.value = moderatorApiKey;

function normalizeBaseUrl(url) {
  return url.trim().replace(/\/+$/, "");
}

async function request(path, payload = null) {
  if (!apiBaseUrl || !moderatorApiKey) {
    throw new Error("Сначала укажи API URL и moderator key.");
  }
  const options = {
    headers: {
      "X-Moderator-Key": moderatorApiKey,
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

function setState(connected) {
  loginView.classList.toggle("hidden", connected);
  dashboard.classList.toggle("hidden", !connected);
  refreshButton.classList.toggle("hidden", !connected);
  logoutButton.classList.toggle("hidden", !connected);
  moderatorStatus.textContent = connected ? `Подключено к: ${apiBaseUrl}` : "Нет подключения";
}

function stopSync() {
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
}

function startSync() {
  stopSync();
  liveTimer = setInterval(() => {
    void loadDashboard(true);
  }, 2500);
}

function renderUsers() {
  const query = userSearch.value.trim().toLowerCase();
  const filtered = allUsers.filter((user) => user.username.toLowerCase().includes(query));
  usersSummary.textContent = `Пользователей: ${allUsers.length}`;
  usersList.innerHTML = "";
  for (const user of filtered) {
    const card = document.createElement("article");
    card.className = "user-card";
    card.addEventListener("click", () => selectUser(user.username));

    const row = document.createElement("div");
    row.className = "user-row";
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

    row.append(title, credits);
    card.append(row, stats);
    usersList.appendChild(card);
  }
}

function renderRequests() {
  requestsList.innerHTML = "";
  const pending = allRequests.filter((item) => item.status === "pending").length;
  requestsSummary.textContent = allRequests.length ? `Всего: ${allRequests.length} · В ожидании: ${pending}` : "Пока пусто";
  for (const item of allRequests) {
    const card = document.createElement("article");
    card.className = `request-card ${item.status}`;
    const status = document.createElement("div");
    status.className = `status-chip ${item.status}`;
    status.textContent = item.status === "pending" ? "Ждёт админа" : item.status === "approved" ? "Одобрено" : "Отклонено";

    const summary = document.createElement("div");
    summary.innerHTML = `<strong>${item.summary}</strong>`;

    const meta = document.createElement("div");
    meta.className = "request-meta";
    meta.textContent = item.reviewed_at
      ? `${item.created_at} · ${item.reviewed_at} · ${item.reviewed_by || "admin"}`
      : `${item.created_at}`;

    const note = document.createElement("div");
    note.className = "request-meta";
    note.textContent = item.note || "";

    card.append(status, summary, meta);
    if (note.textContent) {
      card.append(note);
    }
    requestsList.appendChild(card);
  }
}

function selectUser(username) {
  const user = allUsers.find((item) => item.username === username);
  if (!user) return;
  activeMode = "user";
  activeUsername = username;
  selectedPanel.classList.remove("hidden");
  selectedUsername.textContent = user.username;
  const statusText = user.banned
    ? user.banned_until
      ? `Во временном бане до ${user.banned_until.replace("T", " ")}`
      : "Заблокирован"
    : "Активен";
  selectedMeta.textContent = `${statusText} · ${user.credits} кр. · Сообщений: ${user.messages_sent}`;
  selectedChat.innerHTML = `<div class="muted">Личные чаты скрыты. Модератор может только отправлять заявки на действия.</div>`;
}

async function openGlobalChat() {
  activeMode = "global";
  activeUsername = "";
  selectedPanel.classList.remove("hidden");
  selectedUsername.textContent = "Общий чат";
  selectedMeta.textContent = "Здесь можно запрашивать сообщения и модерацию общего чата";
  const data = await request("/api/moderator/global-chat");
  const history = data.history || [];
  selectedChat.innerHTML = "";
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
    editButton.textContent = "Запросить изменение";
    editButton.addEventListener("click", async () => {
      const nextText = window.prompt("Новый текст сообщения", item.text);
      if (nextText === null) return;
      const trimmed = nextText.trim();
      if (!trimmed) return;
      await request("/api/moderator/request", {
        action: "global_chat_edit_message",
        payload: { chat_index: item.chat_index, text: trimmed },
      });
      await loadDashboard();
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "chat-action-button ghost";
    deleteButton.textContent = "Запросить удаление";
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm("Отправить запрос на удаление этого сообщения?")) return;
      await request("/api/moderator/request", {
        action: "global_chat_delete_message",
        payload: { chat_index: item.chat_index },
      });
      await loadDashboard();
    });

    actions.append(editButton, deleteButton);
    line.append(text, actions);
    selectedChat.appendChild(line);
  }
}

async function sendModeratorRequest(action, targetUsername = "", payload = {}) {
  await request("/api/moderator/request", {
    action,
    target_username: targetUsername,
    payload,
  });
}

async function loadDashboard(silent = false) {
  try {
    const [usersData, requestsData] = await Promise.all([
      request("/api/moderator/users"),
      request("/api/moderator/requests"),
    ]);
    allUsers = usersData.users || [];
    allRequests = requestsData.items || [];
    renderUsers();
    renderRequests();
    if (activeMode === "global") {
      await openGlobalChat();
    } else if (activeUsername) {
      selectUser(activeUsername);
    }
  } catch (error) {
    if (!silent) {
      loginError.textContent = error.message;
      throw error;
    }
  }
}

async function boot() {
  if (!apiBaseUrl || !moderatorApiKey) {
    setState(false);
    return;
  }
  try {
    await request("/api/moderator/me");
    setState(true);
    await loadDashboard();
    startSync();
  } catch (error) {
    setState(false);
    loginError.textContent = error.message;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  apiBaseUrl = normalizeBaseUrl(apiUrlInput.value);
  moderatorApiKey = apiKeyInput.value.trim();
  if (!apiBaseUrl || !moderatorApiKey) {
    loginError.textContent = "Нужны API URL и moderator key.";
    return;
  }
  localStorage.setItem("fluxa_moderator_api_url", apiBaseUrl);
  localStorage.setItem("fluxa_moderator_api_key", moderatorApiKey);
  try {
    await request("/api/moderator/me");
    setState(true);
    await loadDashboard();
    startSync();
  } catch (error) {
    loginError.textContent = error.message;
  }
});

refreshButton.addEventListener("click", () => void loadDashboard());
logoutButton.addEventListener("click", () => {
  stopSync();
  localStorage.removeItem("fluxa_moderator_api_url");
  localStorage.removeItem("fluxa_moderator_api_key");
  apiBaseUrl = "";
  moderatorApiKey = "";
  apiUrlInput.value = "";
  apiKeyInput.value = "";
  allUsers = [];
  allRequests = [];
  usersList.innerHTML = "";
  requestsList.innerHTML = "";
  selectedPanel.classList.add("hidden");
  selectedChat.innerHTML = "";
  activeUsername = "";
  activeMode = "user";
  setState(false);
});
userSearch.addEventListener("input", renderUsers);
globalChatButton.addEventListener("click", () => void openGlobalChat());

operatorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  operatorError.textContent = "";
  const text = operatorMessage.value.trim();
  if (!text) {
    operatorError.textContent = "Напиши сообщение.";
    return;
  }
  try {
    if (activeMode === "global") {
      await sendModeratorRequest("global_chat_send_message", "", { text });
    } else {
      if (!activeUsername) {
        operatorError.textContent = "Сначала выбери пользователя.";
        return;
      }
      await sendModeratorRequest("send_message", activeUsername, { text });
    }
    operatorMessage.value = "";
    await loadDashboard();
  } catch (error) {
    operatorError.textContent = error.message;
  }
});

grantButton.addEventListener("click", async () => {
  operatorError.textContent = "";
  if (!activeUsername) {
    operatorError.textContent = "Сначала выбери пользователя.";
    return;
  }
  const amount = Number(grantInput.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    operatorError.textContent = "Введи нормальное число кредитов.";
    return;
  }
  await sendModeratorRequest("grant_credits", activeUsername, { amount: Math.round(amount) });
  await loadDashboard();
});

banButton.addEventListener("click", async () => {
  operatorError.textContent = "";
  if (!activeUsername) {
    operatorError.textContent = "Сначала выбери пользователя.";
    return;
  }
  await sendModeratorRequest("toggle_ban", activeUsername, {});
  await loadDashboard();
});

tempBanButton.addEventListener("click", async () => {
  operatorError.textContent = "";
  if (!activeUsername) {
    operatorError.textContent = "Сначала выбери пользователя.";
    return;
  }
  const raw = window.prompt("На сколько минут попросить бан?", "60");
  if (raw === null) return;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    operatorError.textContent = "Нужно положительное число минут.";
    return;
  }
  await sendModeratorRequest("ban_temporary", activeUsername, { minutes: Math.round(minutes) });
  await loadDashboard();
});

deleteUserButton.addEventListener("click", async () => {
  operatorError.textContent = "";
  if (!activeUsername) {
    operatorError.textContent = "Сначала выбери пользователя.";
    return;
  }
  if (!window.confirm(`Отправить запрос на удаление пользователя ${activeUsername}?`)) {
    return;
  }
  await sendModeratorRequest("delete_user", activeUsername, {});
  await loadDashboard();
});

void boot();
