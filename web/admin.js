const loginView = document.getElementById("admin-login-view");
const dashboard = document.getElementById("admin-dashboard");
const loginForm = document.getElementById("admin-login-form");
const loginError = document.getElementById("admin-login-error");
const usernameInput = document.getElementById("admin-username");
const passwordInput = document.getElementById("admin-password");
const usersList = document.getElementById("users-list");
const adminStatus = document.getElementById("admin-status");
const refreshUsersButton = document.getElementById("refresh-users");
const adminLogoutButton = document.getElementById("admin-logout");
const userSearch = document.getElementById("user-search");

let allUsers = [];

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

function setAdminState(adminName) {
  const loggedIn = Boolean(adminName);
  loginView.classList.toggle("hidden", loggedIn);
  dashboard.classList.toggle("hidden", !loggedIn);
  refreshUsersButton.classList.toggle("hidden", !loggedIn);
  adminLogoutButton.classList.toggle("hidden", !loggedIn);
  adminStatus.textContent = loggedIn ? `Админ: ${adminName}` : "Нет входа";
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
  try {
    const data = await request("/api/admin/me");
    if (data.ok) {
      setAdminState(data.admin);
      await loadUsers();
      return;
    }
  } catch {}
  setAdminState(null);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  try {
    const data = await request("/api/admin/login", {
      username: usernameInput.value.trim(),
      password: passwordInput.value,
    });
    setAdminState(data.admin);
    passwordInput.value = "";
    await loadUsers();
  } catch (error) {
    loginError.textContent = error.message;
  }
});

refreshUsersButton.addEventListener("click", loadUsers);
adminLogoutButton.addEventListener("click", async () => {
  await request("/api/admin/logout", {});
  setAdminState(null);
  usersList.innerHTML = "";
});
userSearch.addEventListener("input", () => renderUsers(allUsers));

boot();
