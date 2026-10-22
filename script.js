
"use strict";

/* =========================
   江南 AI 第一阶段
   纯前端模拟聊天，无外部 API
   ========================= */

const STORAGE_KEY = "jiangnan_ai_sessions_v1";
const STORAGE_ACTIVE_KEY = "jiangnan_ai_active_session_v1";
const MAX_SESSIONS = 100;
const MAX_MESSAGES_PER_SESSION = 500;
const MAX_MESSAGE_LENGTH = 4000;

/* 获取页面元素 */

const elements = {
  sidebar: document.getElementById("sidebar"),
  sidebarOverlay: document.getElementById("sidebarOverlay"),
  closeSidebar: document.getElementById("closeSidebar"),
  menuButton: document.getElementById("menuButton"),
  newChatButton: document.getElementById("newChatButton"),
  historyList: document.getElementById("historyList"),
  historyCount: document.getElementById("historyCount"),
  chatArea: document.getElementById("chatArea"),
  welcomeScreen: document.getElementById("welcomeScreen"),
  suggestionGrid: document.getElementById("suggestionGrid"),
  messageList: document.getElementById("messageList"),
  typingRow: document.getElementById("typingRow"),
  chatBottomAnchor: document.getElementById("chatBottomAnchor"),
  messageInput: document.getElementById("messageInput"),
  sendButton: document.getElementById("sendButton"),
  characterCount: document.getElementById("characterCount"),
  toast: document.getElementById("toast")
};

let sessions = [];
let activeSessionId = null;
let isGeneratingReply = false;
let toastTimer = null;
let replyTimer = null;

/* 通用工具 */

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 12)
  );
}

function now() {
  return new Date().toISOString();
}

function formatTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2400);
}

function scrollToBottom() {
  window.requestAnimationFrame(() => {
    elements.chatArea.scrollTop = elements.chatArea.scrollHeight;
  });
}

function resizeInput() {
  elements.messageInput.style.height = "auto";

  elements.messageInput.style.height =
    Math.min(elements.messageInput.scrollHeight, 150) + "px";
}

function updateCharacterCount() {
  elements.characterCount.textContent =
    elements.messageInput.value.length + " / " + MAX_MESSAGE_LENGTH;
}

/* 会话数据 */

function createSession() {
  return {
    id: createId(),
    title: "新对话",
    createdAt: now(),
    updatedAt: now(),
    messages: []
  };
}

function getActiveSession() {
  return sessions.find(session => session.id === activeSessionId) || null;
}

function normalizeSessions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const validSessions = [];

  for (const item of value) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !Array.isArray(item.messages)
    ) {
      continue;
    }

    const messages = item.messages
      .filter(message =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string"
      )
      .slice(-MAX_MESSAGES_PER_SESSION)
      .map(message => ({
        id: typeof message.id === "string" ? message.id : createId(),
        role: message.role,
        content: message.content.slice(0, MAX_MESSAGE_LENGTH),
        createdAt:
          typeof message.createdAt === "string"
            ? message.createdAt
            : now()
      }));

    validSessions.push({
      id: item.id,
      title:
        typeof item.title === "string"
          ? item.title.slice(0, 60)
          : "新对话",
      createdAt:
        typeof item.createdAt === "string" ? item.createdAt : now(),
      updatedAt:
        typeof item.updatedAt === "string" ? item.updatedAt : now(),
      messages
    });
  }

  return validSessions
    .sort((a, b) =>
      new Date(b.updatedAt).getTime() -
      new Date(a.updatedAt).getTime()
    )
    .slice(0, MAX_SESSIONS);
}

function saveSessions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));

    if (activeSessionId) {
      localStorage.setItem(STORAGE_ACTIVE_KEY, activeSessionId);
    } else {
      localStorage.removeItem(STORAGE_ACTIVE_KEY);
    }

    return true;
  } catch (error) {
    console.error("保存聊天记录失败：", error);
    showToast("浏览器存储空间不足或不可用，请检查浏览器设置。");
    return false;
  }
}

function loadSessions() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedActiveId = localStorage.getItem(STORAGE_ACTIVE_KEY);

    sessions = saved ? normalizeSessions(JSON.parse(saved)) : [];

    if (
      savedActiveId &&
      sessions.some(session => session.id === savedActiveId)
    ) {
      activeSessionId = savedActiveId;
    } else {
      activeSessionId = sessions.length > 0 ? sessions[0].id : null;
    }
  } catch (error) {
    console.error("读取聊天记录失败：", error);

    sessions = [];
    activeSessionId = null;

    showToast("无法读取旧记录，已进入新的本地会话。");
  }

  if (sessions.length === 0) {
    const session = createSession();
    sessions = [session];
    activeSessionId = session.id;
    saveSessions();
  }
}

/* 会话标题 */

function updateSessionTitle(session, firstMessage) {
  if (session.messages.length === 1 && firstMessage) {
    const title = firstMessage.replace(/\s+/g, " ").trim();

    session.title =
      title.length > 22 ? title.slice(0, 22) + "…" : title;
  }
}

/* 侧边栏 */

function renderHistory() {
  elements.historyList.replaceChildren();
  elements.historyCount.textContent = String(sessions.length);

  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "还没有聊天记录，开启一段新对话吧。";
    elements.historyList.appendChild(empty);
    return;
  }

  for (const session of sessions) {
    const item = document.createElement("div");
    item.className = "history-item";

    if (session.id === activeSessionId) {
      item.classList.add("active");
    }

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "history-select";
    selectButton.textContent = session.title || "新对话";
    selectButton.title = session.title || "新对话";
    selectButton.setAttribute(
      "aria-label",
      "切换到会话：" + (session.title || "新对话")
    );

    selectButton.addEventListener("click", () => {
      switchSession(session.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-chat-button";
    deleteButton.textContent = "×";
    deleteButton.title = "删除此对话";
    deleteButton.setAttribute("aria-label", "删除此对话");

    deleteButton.addEventListener("click", () => {
      deleteSession(session.id);
    });

    item.append(selectButton, deleteButton);
    elements.historyList.appendChild(item);
  }
}

/* 消息渲染 */

function createMessageElement(message) {
  const isUser = message.role === "user";

  const row = document.createElement("div");
  row.className = "message-row " + (isUser ? "user" : "assistant");

  if (!isUser) {
    const avatar = document.createElement("div");
    avatar.className = "ai-avatar";
    avatar.textContent = "江";
    avatar.setAttribute("aria-label", "江南 AI");
    row.appendChild(avatar);
  }

  const content = document.createElement("div");
  content.className = "message-content";

  const author = document.createElement("div");
  author.className = "message-author";
  author.textContent = isUser ? "你" : "江南 AI";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  /*
   * 使用 textContent 而不是 innerHTML，
   * 避免把用户输入当作 HTML 执行。
   */
  bubble.textContent = message.content;

  const time = document.createElement("div");
  time.className = "message-time";
  time.textContent = formatTime(message.createdAt);

  content.append(author, bubble, time);
  row.appendChild(content);

  return row;
}

function renderMessages() {
  const session = getActiveSession();

  elements.messageList.replaceChildren();

  const hasMessages = Boolean(
    session && session.messages.length > 0
  );

  elements.welcomeScreen.classList.toggle("hidden", hasMessages);

  if (session) {
    for (const message of session.messages) {
      elements.messageList.appendChild(
        createMessageElement(message)
      );
    }
  }

  if (isGeneratingReply) {
    elements.typingRow.classList.remove("hidden");
  } else {
    elements.typingRow.classList.add("hidden");
  }

  if (hasMessages || isGeneratingReply) {
    scrollToBottom();
  } else {
    elements.chatArea.scrollTop = 0;
  }
}

function renderAll() {
  renderHistory();
  renderMessages();
}

/* 新建、切换与删除会话 */

function cancelPendingReply() {
  if (replyTimer !== null) {
    window.clearTimeout(replyTimer);
    replyTimer = null;
  }

  isGeneratingReply = false;
  elements.typingRow.classList.add("hidden");
  elements.sendButton.disabled = false;
}

function createNewChat() {
  cancelPendingReply();

  if (sessions.length >= MAX_SESSIONS) {
    showToast("本地最多保存 100 个会话，请先删除部分旧记录。");
    return;
  }

  const session = createSession();

  sessions.unshift(session);
  activeSessionId = session.id;

  saveSessions();
  renderAll();
  closeMobileSidebar();

  elements.messageInput.value = "";
  resizeInput();
  updateCharacterCount();
  elements.messageInput.focus();
}

function switchSession(sessionId) {
  if (!sessions.some(session => session.id === sessionId)) {
    return;
  }

  cancelPendingReply();

  activeSessionId = sessionId;

  saveSessions();
  renderAll();
  closeMobileSidebar();

  elements.messageInput.value = "";
  resizeInput();
  updateCharacterCount();
}

function deleteSession(sessionId) {
  const session = sessions.find(item => item.id === sessionId);

  if (!session) {
    return;
  }

  const confirmed = window.confirm(
    '确定删除对话“' + (session.title || "新对话") + '”吗？\n删除后无法恢复。'
  );

  if (!confirmed) {
    return;
  }

  if (sessionId === activeSessionId) {
    cancelPendingReply();
  }

  sessions = sessions.filter(item => item.id !== sessionId);

  if (activeSessionId === sessionId) {
    activeSessionId = sessions.length > 0 ? sessions[0].id : null;
  }

  if (!activeSessionId) {
    const replacement = createSession();
    sessions.unshift(replacement);
    activeSessionId = replacement.id;
  }

  saveSessions();
  renderAll();
  showToast("对话已删除。");
}

/* 模拟回复：完全在浏览器本地生成 */

function generateMockReply(userText) {
  const text = userText.trim();

  if (/你好|您好|嗨|哈喽|hello|hi\b/i.test(text)) {
    return [
      "你好呀，欢迎来到江南 AI！",
      "",
      "很高兴和你开启这段对话。你可以和我聊聊学习、工作、创意或生活中的任何问题。",
      "",
      "当前是第一阶段模拟体验版，我会根据关键词给出预设回复。"
    ].join("\n");
  }

  if (/学习|计划|复习|考试|时间管理/.test(text)) {
    return [
      "我们可以把目标拆解成更容易执行的小步骤。",
      "",
      "一、明确目标：先确定你希望完成的任务和截止时间。",
      "二、安排优先级：把最重要、最紧急的事情排在前面。",
      "三、分段执行：每次专注 25—40 分钟，中间安排短暂休息。",
      "四、复盘调整：每天结束时记录完成情况，及时修改计划。",
      "",
      "小建议：先从今天最重要的一件事开始，不必一开始就追求完美。",
      "",
      "说明：这是一条预设模拟回复，并非真实 AI 实时生成。"
    ].join("\n");
  }

  if (/品牌|创意|设计|灵感|名称|故事|文案/.test(text)) {
    return [
      "好的！创意任务可以从目标人群、核心价值和视觉记忆点三个方面展开。",
      "",
      "1. 核心定位：用一句话说清楚你希望传达什么。",
      "2. 目标人群：明确主要受众的需求与偏好。",
      "3. 创意表达：围绕一个核心概念延展名称、文案和视觉元素。",
      "4. 方案筛选：从辨识度、易传播性和执行成本三个维度进行比较。",
      "",
      "你可以继续补充项目背景、目标受众或喜欢的风格，让后续方案更有针对性。",
      "",
      "说明：当前回复由本地关键词规则生成。"
    ].join("\n");
  }

  if (/人工智能|AI|模型|算法|机器学习|深度学习/i.test(text)) {
    return [
      "可以把人工智能简单理解为：让计算机通过算法和数据完成某些通常需要人类智能参与的任务。",
      "",
      "常见应用包括：",
      "• 自然语言处理：理解和生成文字。",
      "• 图像识别：识别照片中的物体或场景。",
      "• 推荐系统：根据行为和偏好推荐内容。",
      "• 智能助手：帮助整理信息、回答问题和辅助创作。",
      "",
      "不同 AI 系统的能力差异很大。真实的大语言模型通常还需要复杂的模型服务和计算资源。",
      "",
      "说明：这是一条预设科普回复，不代表已连接真实 AI 模型。"
    ].join("\n");
  }

  if (/项目|方案|大纲|报告|策划|总结|工作/.test(text)) {
    return [
      "你可以参考下面这套通用的项目文档结构：",
      "",
      "一、项目背景与现状",
      "二、项目目标与核心定位",
      "三、实施内容与执行步骤",
      "四、时间安排与人员分工",
      "五、资源预算与成本控制",
      "六、风险分析与应对措施",
      "七、成果评估与后续规划",
      "",
      "撰写时建议做到目标具体、任务可执行、时间可检查、成果可衡量。",
      "",
      "说明：当前是模拟体验，以上内容由预设规则生成。"
    ].join("\n");
  }

  if (/谢谢|感谢|辛苦了/.test(text)) {
    return [
      "不客气！很高兴这段对话能给你带来帮助。",
      "",
      "你可以继续输入新的问题，或者点击左侧的“开启新对话”探索其他主题。",
      "",
      "温馨提示：当前版本尚未接入真实 AI 服务。"
    ].join("\n");
  }

  return [
    "我收到你的问题了：",
    "",
    "“" + text + "”",
    "",
    "目前的江南 AI 处于第一阶段，使用本地模拟规则生成回复，还不能像真实大语言模型一样理解所有问题。",
    "",
    "你可以尝试询问以下方向：",
    "• 如何制定学习计划？",
    "• 怎样构思品牌名称与故事？",
    "• 人工智能是什么？",
    "• 如何撰写项目计划书？",
    "",
    "等界面验收完成后，我们再进入 API 接入阶段。"
  ].join("\n");
}

/* 发送消息 */

function addMessage(session, role, content) {
  const message = {
    id: createId(),
    role,
    content,
    createdAt: now()
  };

  session.messages.push(message);

  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    session.messages = session.messages.slice(
      -MAX_MESSAGES_PER_SESSION
    );
  }

  session.updatedAt = now();

  return message;
}

function sendMessage() {
async function sendMessage() {
  if (isGeneratingReply) return;

  const content = elements.messageInput.value.trim();

  if (!content) return;

  if (content.length > MAX_MESSAGE_LENGTH) {
    showToast("消息太长了，请缩短后再发送");
    return;
  }

  const session = getActiveSession();

  if (!session) {
    showToast("请先新建一个聊天");
    return;
  }

  // 保存用户消息
  addMessage(session, "user", content);
  updateSessionTitle(session, content);

  // 清空输入框
  elements.messageInput.value = "";
  resizeInput();
  updateCharacterCount();

  // 开始请求 AI
  isGeneratingReply = true;
  elements.sendButton.disabled = true;
  renderAll();

  // 记住本次聊天，防止切换会话后回复跑错位置
  const sessionId = session.id;

  try {
    const response = await fetch(
      "https://jiangnan-ai-api.zhujianian19521636740.workers.dev/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: session.messages
            .filter(message =>
              message.role === "user" ||
              message.role === "assistant" ||
              message.role === "system"
            )
            .slice(-20)
            .map(message => ({
              role: message.role,
              content: message.content
            }))
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "AI 请求失败");
    }

    if (!data.reply) {
      throw new Error("AI 暂时没有返回内容");
    }

    // 将回答保存到原来的会话中
    const targetSession = sessions.find(
      item => item.id === sessionId
    );

    if (targetSession) {
      addMessage(targetSession, "assistant", data.reply);
      saveSessions();
      renderAll();
    }
  } catch (error) {
    console.error("江南 AI 请求失败：", error);
    showToast(
      "AI 回复失败：" +
      (error.message || "请检查网络后重试").slice(0, 100)
    );
  } finally {
    isGeneratingReply = false;
    elements.sendButton.disabled = false;
    renderAll();
  }
}

}

/* 手机端侧边栏 */

function openMobileSidebar() {
  if (window.innerWidth > 640) {
    return;
  }

  elements.sidebar.classList.add("open");
  elements.sidebarOverlay.classList.add("visible");
}

function closeMobileSidebar() {
  elements.sidebar.classList.remove("open");
  elements.sidebarOverlay.classList.remove("visible");
}

/* 事件绑定 */

elements.newChatButton.addEventListener("click", createNewChat);

elements.sendButton.addEventListener("click", sendMessage);

elements.messageInput.addEventListener("input", () => {
  resizeInput();
  updateCharacterCount();
});

elements.messageInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendMessage();
  }
});

elements.suggestionGrid.addEventListener("click", event => {
  const button = event.target.closest("[data-prompt]");

  if (!button) {
    return;
  }

  elements.messageInput.value = button.dataset.prompt;
  resizeInput();
  updateCharacterCount();
  sendMessage();
});

elements.menuButton.addEventListener("click", openMobileSidebar);
elements.closeSidebar.addEventListener("click", closeMobileSidebar);
elements.sidebarOverlay.addEventListener("click", closeMobileSidebar);

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeMobileSidebar();
  }
});

/* 页面初始化 */

loadSessions();
renderAll();
resizeInput();
updateCharacterCount();
