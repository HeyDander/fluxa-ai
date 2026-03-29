const messages = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const sendButton = document.getElementById("send-button");
const newChatButton = document.getElementById("new-chat");
const globalChatButton = document.getElementById("global-chat-button");
const notificationsButton = document.getElementById("notifications-button");
const tasksButton = document.getElementById("tasks-button");
const promoButton = document.getElementById("promo-button");
const deleteChatButton = document.getElementById("delete-chat");
const logoutButton = document.getElementById("logout-button");
const accountName = document.getElementById("account-name");
const chatTitle = document.getElementById("chat-title");

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
const promoOverlay = document.getElementById("promo-overlay");
const closePromoButton = document.getElementById("close-promo");
const promoForm = document.getElementById("promo-form");
const promoInput = document.getElementById("promo-input");
const promoError = document.getElementById("promo-error");
const bonusToast = document.getElementById("bonus-toast");
const fileInput = document.getElementById("file-input");
const attachButton = document.getElementById("attach-button");
const voiceButton = document.getElementById("voice-button");
const videoButton = document.getElementById("video-button");
const attachmentPreview = document.getElementById("attachment-preview");

let authMode = "login";
let typingNode = null;
let toastTimer = null;
let liveSyncTimer = null;
let syncInFlight = false;
let lastHistorySnapshot = "";
let lastUserSnapshot = "";
let awaitingChatReply = false;
let activeChatMode = "private";
let lastGlobalHistorySnapshot = "";
let lastGlobalMessageCount = 0;
let notificationsEnabled = false;
let baseDocumentTitle = document.title;
let pushRegistration = null;
let pushConfig = null;
let pendingAttachments = [];
let mediaRecorder = null;
let mediaChunks = [];
let mediaMode = "";
let mediaStream = null;
const MAX_ATTACHMENT_SIZE = 1_500_000;

function setComposerEnabled(enabled) {
  input.disabled = !enabled;
  sendButton.disabled = !enabled;
  attachButton.disabled = !enabled;
  const mediaAllowed = enabled && activeChatMode === "global";
  voiceButton.disabled = !mediaAllowed;
  videoButton.disabled = !mediaAllowed;
  voiceButton.classList.toggle("hidden", activeChatMode !== "global");
  videoButton.classList.toggle("hidden", activeChatMode !== "global");
}

function formatAttachmentLabel(item) {
  if (item.kind === "audio") return `🎤 ${item.name}`;
  if (item.kind === "video") return `🎥 ${item.name}`;
  return `📎 ${item.name}`;
}

function renderAttachmentPreview() {
  attachmentPreview.innerHTML = "";
  attachmentPreview.classList.toggle("hidden", pendingAttachments.length === 0);
  for (const [index, item] of pendingAttachments.entries()) {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";

    const label = document.createElement("span");
    label.textContent = formatAttachmentLabel(item);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "attachment-remove";
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => {
      pendingAttachments.splice(index, 1);
      renderAttachmentPreview();
    });

    chip.append(label, removeButton);
    attachmentPreview.appendChild(chip);
  }
}

function clearPendingAttachments() {
  pendingAttachments = [];
  renderAttachmentPreview();
  if (fileInput) fileInput.value = "";
}

function sanitizeAttachmentForSend(item) {
  return {
    kind: item.kind || "file",
    name: item.name || "file",
    mime_type: item.mime_type || "",
    size: item.size || 0,
    text_excerpt: item.text_excerpt || "",
    data_url: item.data_url || "",
  };
}

function buildAttachmentElements(attachments) {
  if (!attachments || !attachments.length) return [];
  return attachments.map((item) => {
    const wrap = document.createElement("div");
    wrap.className = "attachment-item";

    const label = document.createElement("div");
    label.className = "attachment-name";
    label.textContent = formatAttachmentLabel(item);
    wrap.appendChild(label);

    if (item.kind === "audio" && item.data_url) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = item.data_url;
      wrap.appendChild(audio);
    } else if (item.kind === "video" && item.data_url) {
      const video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.src = item.data_url;
      wrap.appendChild(video);
    } else if (item.text_excerpt) {
      const pre = document.createElement("pre");
      pre.className = "attachment-text";
      pre.textContent = item.text_excerpt;
      wrap.appendChild(pre);
    }
    return wrap;
  });
}

async function fileToAttachment(file) {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`Файл слишком большой: ${file.name}`);
  }
  const isTextLike = file.type.startsWith("text/") || /\.(txt|md|py|js|ts|json|html|css|csv)$/i.test(file.name);
  if (isTextLike) {
    const text = await file.text();
    return {
      kind: "file",
      name: file.name,
      mime_type: file.type,
      size: file.size,
      text_excerpt: text.slice(0, 4000),
    };
  }

  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return {
      kind: file.type.startsWith("audio/") ? "audio" : "video",
      name: file.name,
      mime_type: file.type,
      size: file.size,
      data_url: dataUrl,
    };
  }

  return {
    kind: "file",
    name: file.name,
    mime_type: file.type,
    size: file.size,
  };
}

function supportsPushNotifications() {
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getPushConfig() {
  if (pushConfig) return pushConfig;
  pushConfig = await request("/api/push/config");
  return pushConfig;
}

async function ensurePushRegistration() {
  if (!supportsPushNotifications()) return null;
  if (pushRegistration) return pushRegistration;
  pushRegistration = await navigator.serviceWorker.register("/sw.js");
  return pushRegistration;
}

async function updateNotificationsButton() {
  if (!notificationsButton) return;
  if (!supportsPushNotifications()) {
    notificationsButton.disabled = true;
    notificationsButton.textContent = "Пуш-уведомления недоступны";
    return;
  }
  notificationsButton.disabled = false;
  try {
    const config = await getPushConfig();
    if (!config.enabled || !config.public_key) {
      notificationsButton.textContent = "Пуш не настроен";
      notificationsEnabled = false;
      return;
    }
    const registration = await ensurePushRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (subscription && Notification.permission === "granted") {
      notificationsButton.textContent = "Пуш-уведомления включены";
      notificationsEnabled = true;
    } else if (Notification.permission === "denied") {
      notificationsButton.textContent = "Пуш-уведомления заблокированы";
      notificationsEnabled = false;
    } else {
      notificationsButton.textContent = "Включить пуш-уведомления";
      notificationsEnabled = false;
    }
  } catch {
    notificationsButton.textContent = "Пуш-уведомления недоступны";
    notificationsEnabled = false;
  }
}

function setUnreadTitle(hasUnread) {
  document.title = hasUnread ? "• fluxa-ai" : baseDocumentTitle;
}

function notifyGlobalMessage(author, text) {
  const body = author ? `${author}: ${text}` : text;
  showBonusToast(`Общий чат: ${body}`);
}

function clearMessages() {
  messages.innerHTML = "";
  clearPendingAttachments();
  appendMessage("bot", activeChatMode === "global" ? "Открыт общий чат. Напиши сообщение для всех." : "Новый чат начат. Напиши сообщение.");
}

function appendMessage(role, text, author = "", attachments = []) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "bot" ? "AI" : "YOU";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = author ? `${author}: ${text}` : text;
  for (const node of buildAttachmentElements(attachments)) {
    bubble.appendChild(node);
  }

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
  promoButton.classList.toggle("hidden", !loggedIn);
  if (!loggedIn) {
    tasksOverlay.classList.add("hidden");
    promoOverlay.classList.add("hidden");
    notificationsButton.disabled = true;
    notificationsButton.textContent = "Войди, чтобы включить пуш";
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
    notificationsButton.disabled = false;
  }
  if (loggedIn) {
    void updateNotificationsButton();
  }
}

function setChatMode(mode) {
  activeChatMode = mode;
  globalChatButton.classList.toggle("active-toggle", mode === "global");
  newChatButton.classList.toggle("active-toggle", mode === "private");
  deleteChatButton.classList.toggle("hidden", mode === "global");
  chatTitle.textContent = mode === "global" ? "Общий чат" : "Болталка как приложение";
  setComposerEnabled(!authOverlay.classList.contains("hidden"));
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
    appendMessage("bot", activeChatMode === "global" ? "Общий чат пока пустой. Напиши первое сообщение." : "Привет. Напиши сообщение, и я отвечу.");
    return;
  }
  for (const item of history) {
    appendMessage(item.role, item.text, item.author || "", item.attachments || []);
  }
}

function snapshotHistory(history) {
  return JSON.stringify(history || []);
}

function snapshotUser(user) {
  if (!user) return "";
  return JSON.stringify({
    username: user.username,
    credits: user.credits,
    referrals: user.referrals,
    banned: user.banned,
    referral_code: user.referral_code,
    credit_history: user.credit_history,
    tasks: user.tasks,
  });
}

function stopLiveSync() {
  if (liveSyncTimer) {
    clearInterval(liveSyncTimer);
    liveSyncTimer = null;
  }
}

async function syncLiveState() {
  if (syncInFlight || authOverlay.classList.contains("hidden") === false) {
    return;
  }
  syncInFlight = true;
  try {
    const [activeData, globalData] = await Promise.all([
      activeChatMode === "global" ? request("/api/global-chat") : request("/api/me"),
      request("/api/global-chat"),
    ]);
    const data = activeData;
    const nextUserSnapshot = snapshotUser(data.user);
    const nextHistorySnapshot = snapshotHistory(data.history);
    const nextGlobalSnapshot = snapshotHistory(globalData.history);
    const nextGlobalCount = Array.isArray(globalData.history) ? globalData.history.length : 0;

    if (nextUserSnapshot !== lastUserSnapshot) {
      applyUser(data.user);
      lastUserSnapshot = nextUserSnapshot;
    }

    if (!awaitingChatReply && nextHistorySnapshot !== lastHistorySnapshot) {
      renderHistory(data.history);
      lastHistorySnapshot = nextHistorySnapshot;
    }

    if (lastGlobalHistorySnapshot && nextGlobalSnapshot !== lastGlobalHistorySnapshot && nextGlobalCount > lastGlobalMessageCount) {
      const latest = globalData.history[globalData.history.length - 1];
      const currentUsername = data.user?.username || "";
      const isForeignMessage = latest && latest.author && latest.author !== currentUsername;
      const shouldNotify = isForeignMessage && (activeChatMode !== "global" || document.hidden);
      if (shouldNotify) {
        notifyGlobalMessage(latest.author, latest.text);
        setUnreadTitle(true);
      }
    }

    lastGlobalHistorySnapshot = nextGlobalSnapshot;
    lastGlobalMessageCount = nextGlobalCount;
  } catch {
    stopLiveSync();
    lastUserSnapshot = "";
    lastHistorySnapshot = "";
    lastGlobalHistorySnapshot = "";
    lastGlobalMessageCount = 0;
    applyUser(null);
  } finally {
    syncInFlight = false;
  }
}

function startLiveSync() {
  stopLiveSync();
  liveSyncTimer = setInterval(syncLiveState, 2000);
}

async function boot() {
  try {
    setChatMode("private");
    const data = await request("/api/me");
    applyUser(data.user);
    renderHistory(data.history);
    lastUserSnapshot = snapshotUser(data.user);
    lastHistorySnapshot = snapshotHistory(data.history);
    try {
      const globalData = await request("/api/global-chat");
      lastGlobalHistorySnapshot = snapshotHistory(globalData.history);
      lastGlobalMessageCount = Array.isArray(globalData.history) ? globalData.history.length : 0;
    } catch {}
    if (data.user) {
      startLiveSync();
    }
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
    lastUserSnapshot = snapshotUser(data.user);
    lastHistorySnapshot = "";
    startLiveSync();
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
  stopLiveSync();
  lastUserSnapshot = "";
  lastHistorySnapshot = "";
  lastGlobalHistorySnapshot = "";
  lastGlobalMessageCount = 0;
  setUnreadTitle(false);
  applyUser(null);
});

newChatButton.addEventListener("click", () => {
  setChatMode("private");
  clearMessages();
  void syncLiveState();
});

globalChatButton.addEventListener("click", async () => {
  setChatMode("global");
  setUnreadTitle(false);
  clearMessages();
  try {
    const data = await request("/api/global-chat");
    if (data.user) {
      applyUser(data.user);
      lastUserSnapshot = snapshotUser(data.user);
    }
    renderHistory(data.history);
    lastHistorySnapshot = snapshotHistory(data.history);
    lastGlobalHistorySnapshot = lastHistorySnapshot;
    lastGlobalMessageCount = Array.isArray(data.history) ? data.history.length : 0;
  } catch (error) {
    appendMessage("bot", error.message);
  }
});

if (attachButton) {
  attachButton.addEventListener("click", () => {
    if (fileInput) fileInput.click();
  });
}

if (fileInput) {
  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []).slice(0, 4);
    for (const file of files) {
      try {
        const attachment = await fileToAttachment(file);
        pendingAttachments.push(attachment);
      } catch {
        showBonusToast(`Не удалось прочитать файл: ${file.name}`);
      }
    }
    pendingAttachments = pendingAttachments.slice(0, 4);
    renderAttachmentPreview();
  });
}

async function stopMediaRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    mediaStream = null;
  }
  mediaRecorder = null;
  mediaMode = "";
  voiceButton.textContent = "🎤";
  videoButton.textContent = "🎥";
}

async function startMediaRecording(mode) {
  if (activeChatMode !== "global") {
    showBonusToast("Голосовые и кружки доступны только в общем чате.");
    return;
  }
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    showBonusToast("Запись медиа не поддерживается этим браузером.");
    return;
  }
  if (mediaRecorder) {
    await stopMediaRecording();
    return;
  }

  mediaMode = mode;
  mediaChunks = [];
  mediaStream = await navigator.mediaDevices.getUserMedia(
    mode === "audio"
      ? { audio: true }
      : { video: { facingMode: "user" }, audio: true }
  );
  mediaRecorder = new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size) {
      mediaChunks.push(event.data);
    }
  };
  mediaRecorder.onstop = async () => {
    const blob = new Blob(mediaChunks, { type: mediaRecorder?.mimeType || (mode === "audio" ? "audio/webm" : "video/webm") });
    if (blob.size > MAX_ATTACHMENT_SIZE) {
      showBonusToast("Медиафайл слишком большой. Запиши короче.");
      mediaChunks = [];
      await stopMediaRecording();
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    pendingAttachments.push({
      kind: mode === "audio" ? "audio" : "video",
      name: mode === "audio" ? `voice-${Date.now()}.webm` : `circle-${Date.now()}.webm`,
      mime_type: blob.type,
      size: blob.size,
      data_url: dataUrl,
    });
    pendingAttachments = pendingAttachments.slice(0, 4);
    renderAttachmentPreview();
    mediaChunks = [];
    await stopMediaRecording();
  };
  mediaRecorder.start();
  if (mode === "audio") {
    voiceButton.textContent = "⏹";
  } else {
    videoButton.textContent = "⏺";
  }
}

if (voiceButton) {
  voiceButton.addEventListener("click", async () => {
    try {
      await startMediaRecording("audio");
    } catch {
      showBonusToast("Не удалось начать запись голосового.");
      await stopMediaRecording();
    }
  });
}

if (videoButton) {
  videoButton.addEventListener("click", async () => {
    try {
      await startMediaRecording("video");
    } catch {
      showBonusToast("Не удалось начать запись кружка.");
      await stopMediaRecording();
    }
  });
}

if (notificationsButton) {
  notificationsButton.addEventListener("click", async () => {
    if (!supportsPushNotifications()) {
      showBonusToast("Этот браузер не поддерживает push-уведомления.");
      return;
    }
    try {
      const config = await getPushConfig();
      if (!config.enabled || !config.public_key) {
        showBonusToast("Push пока не настроен на сервере.");
        return;
      }
      const registration = await ensurePushRegistration();
      if (!registration) {
        showBonusToast("Не удалось зарегистрировать service worker.");
        return;
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.public_key),
        });
      }

      await request("/api/push/subscribe", { subscription: subscription.toJSON() });
      notificationsEnabled = true;
      await updateNotificationsButton();
      showBonusToast("Push-уведомления включены на этом устройстве.");
    } catch (error) {
      showBonusToast(error.message || "Не удалось включить push-уведомления.");
      await updateNotificationsButton();
    }
  });
}

boot();

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && activeChatMode === "global") {
    setUnreadTitle(false);
  }
});

if (supportsPushNotifications()) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "fluxa-push-click") {
      setChatMode("global");
      setUnreadTitle(false);
      void syncLiveState();
    }
  });
}
tasksButton.addEventListener("click", () => {
  tasksOverlay.classList.remove("hidden");
});

closeTasksButton.addEventListener("click", () => {
  tasksOverlay.classList.add("hidden");
});

promoButton.addEventListener("click", () => {
  promoError.textContent = "";
  promoInput.value = "";
  promoOverlay.classList.remove("hidden");
  promoInput.focus();
});

closePromoButton.addEventListener("click", () => {
  promoOverlay.classList.add("hidden");
});

promoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  promoError.textContent = "";
  try {
    const data = await request("/api/promo/redeem", { code: promoInput.value.trim() });
    if (data.user) {
      applyUser(data.user);
    }
    promoOverlay.classList.add("hidden");
    promoInput.value = "";
    showBonusToast(data.message || "Промокод активирован");
  } catch (error) {
    promoError.textContent = error.message;
  }
});

deleteChatButton.addEventListener("click", async () => {
  await request("/api/chat/clear", {});
  setChatMode("private");
  clearMessages();
  lastHistorySnapshot = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message && pendingAttachments.length === 0) return;

  appendMessage("user", message || "(без текста)", "", pendingAttachments);
  input.value = "";
  setComposerEnabled(false);
  awaitingChatReply = true;
  const attachmentsForSend = pendingAttachments.map(sanitizeAttachmentForSend);
  showTyping(activeChatMode === "global" ? "Отправляю..." : (/ищи|найди|что такое|че такое/i.test(message) ? "Ищу..." : "Думаю..."));

  try {
    const payload = { message, attachments: attachmentsForSend };
    const data = activeChatMode === "global" ? await request("/api/global-chat", payload) : await request("/api/chat", payload);
    hideTyping();
    if (activeChatMode === "global") {
      renderHistory(data.history);
      lastGlobalHistorySnapshot = snapshotHistory(data.history);
      lastGlobalMessageCount = Array.isArray(data.history) ? data.history.length : 0;
    } else {
      appendMessage("bot", data.reply);
    }
    if (data.user) {
      applyUser(data.user);
      lastUserSnapshot = snapshotUser(data.user);
    }
    const currentHistory = data.history || Array.from(messages.querySelectorAll(".message")).map((node) => {
      const role = node.classList.contains("user") ? "user" : "bot";
      const bubble = node.querySelector(".bubble");
      return { role, text: bubble ? bubble.textContent : "" };
    });
    lastHistorySnapshot = snapshotHistory(currentHistory);
  } catch (error) {
    hideTyping();
    appendMessage("bot", error.message);
  } finally {
    awaitingChatReply = false;
    hideTyping();
    clearPendingAttachments();
    setComposerEnabled(true);
    input.focus();
  }
});
