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

let allUsers = [];
let apiBaseUrl = localStorage.getItem("fluxa_admin_api_url") || "";
let adminApiKey = localStorage.getItem("fluxa_admin_api_key") || "";

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

function renderUsers(users) {
  const query = userSearch.value.trim().toLowerCase();
  const filtered = users.filter((user) => user.username.toLowerCase().includes(query));
  usersList.innerHTML = "";

  for (const user of filtered) {
    const card = document.createElement("article");
    card.className = "user-card";

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

async function loadUsers() {
  const data = await request("/api/admin/users");
  allUsers = data.users || [];
  renderUsers(allUsers);
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
  } catch (error) {
    loginError.textContent = error.message;
  }
});

refreshUsersButton.addEventListener("click", loadUsers);
adminLogoutButton.addEventListener("click", () => {
  localStorage.removeItem("fluxa_admin_api_url");
  localStorage.removeItem("fluxa_admin_api_key");
  apiBaseUrl = "";
  adminApiKey = "";
  allUsers = [];
  apiUrlInput.value = "";
  apiKeyInput.value = "";
  usersList.innerHTML = "";
  setAdminState(false);
});
userSearch.addEventListener("input", () => renderUsers(allUsers));

boot();
