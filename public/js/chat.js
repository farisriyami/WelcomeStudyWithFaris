"use strict";
/* Course chat
 * One chat per course, admin commands #closed, #open, #del. */

/* ---------- Course chat ---------- */
const CHAT = { course: null, msgs: [], closed: false, loading: false, error: "", sig: "", timer: null, busy: false, sending: false, draft: "", armed: "" };
const CHAT_COMMANDS = ["#closed", "#close", "#open", "#del", "#delete"];
// Proof of who is chatting: the owner password for the admin, the account's sign-in token for everyone else.
const chatAuth = () => (isAdmin() ? { key: ADMIN.key } : { token: IDENT ? IDENT.token : "" });
const fmtClock = t => {
  const d = new Date(t);
  if (isNaN(d)) return "";
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " " + time;
};
function resetChat(courseId) {
  stopChat();
  Object.assign(CHAT, { course: courseId, msgs: [], closed: false, loading: true, error: "", sig: "", draft: "", armed: "" });
}
function startChat() {
  stopChat();
  pollChat();
  CHAT.timer = setInterval(() => { if (document.visibilityState === "visible") pollChat(); }, 5000);
}
function stopChat() { if (CHAT.timer) { clearInterval(CHAT.timer); CHAT.timer = null; } }
async function pollChat() {
  if (!TRACK_URL || !CHAT.course || CHAT.busy || CHAT.sending) return;
  const course = CHAT.course;
  CHAT.busy = true;
  try {
    const d = await adminPost(Object.assign({ action: "chatList", course }, chatAuth()));
    if (course !== CHAT.course) return;
    if (!d || !d.ok) throw new Error((d && d.error) || "error");
    setChat(d);
  } catch (e) {
    if (course === CHAT.course) { CHAT.loading = false; CHAT.error = "Couldn't load the chat. Check your connection."; updateChatView(); }
  } finally { CHAT.busy = false; }
}
function setChat(d) {
  CHAT.loading = false; CHAT.error = "";
  CHAT.msgs = Array.isArray(d.messages) ? d.messages.filter(isObj) : [];
  CHAT.closed = !!d.closed;
  updateChatView();
}
function scoreChoices(course) {
  return course.chapters.filter(ch => isObj(RESULTS[ch.id]) && typeof RESULTS[ch.id].pct === "number")
    .sort((a, b) => (RESULTS[b.id].at || 0) - (RESULTS[a.id].at || 0));
}
function chatHTML(course) {
  if (!TRACK_URL) return `
    <article class="card"><div class="q-head">
      <div class="meta"><span class="topic">${esc(course.name)} chat</span></div>
      <h2>The chat isn't connected yet.</h2>
      <p class="muted">It turns on once the site is connected to its Google Sheet.</p>
    </div></article>`;
  const admin = isAdmin(), locked = CHAT.closed && !admin;
  const scores = scoreChoices(course);
  const opts = scores.map(ch => { const r = RESULTS[ch.id]; return `<option value="${esc(ch.id)}">${esc((ch.label ? ch.label + ": " : "") + ch.name)} · ${r.pct}%</option>`; }).join("");
  return `
    <article class="card chat-card">
      <div class="q-head">
        <div class="meta"><span class="topic">${esc(course.name)} chat</span><span id="chat-state">${CHAT.closed ? "Closed" : "Open"}</span></div>
        <p class="muted small">Share your scores and help each other. You can delete your own messages.</p>
      </div>
      <div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-label="${esc(course.name)} messages"></div>
      <form id="chat-form" class="chat-form" novalidate>
        <label class="sr-only" for="chat-text">Message</label>
        <textarea id="chat-text" rows="2" maxlength="500" placeholder="${locked ? "The admin has closed this chat." : "Write a message…"}" ${locked ? "disabled" : ""}></textarea>
        <div class="chat-actions">
          ${admin ? "" : scores.length ? `<select id="chat-score" aria-label="Score to share" ${locked ? "disabled" : ""}>${opts}</select>
          <button type="button" class="btn secondary small" id="chat-share" ${locked ? "disabled" : ""}>Share score</button>` : `<span class="muted small">Finish a quiz in this course to share your score.</span>`}
          <button class="btn primary small" type="submit" id="chat-send" ${locked ? "disabled" : ""}>Send</button>
        </div>
        <p class="form-msg" id="chat-msg" role="status"></p>
        ${admin ? `<p class="muted small">Admin commands: <b>#closed</b> (or #close) closes this chat · <b>#open</b> opens it · <b>#del</b> deletes every message.</p>` : ""}
      </form>
    </article>`;
}
function chatLogHTML() {
  if (CHAT.loading && !CHAT.msgs.length) return `<p class="chat-empty">Loading messages…</p>`;
  if (CHAT.error && !CHAT.msgs.length) return `<p class="chat-empty">${esc(CHAT.error)}</p>`;
  if (!CHAT.msgs.length) return `<p class="chat-empty">No messages yet. Say hello or share your score.</p>`;
  const admin = isAdmin();
  return CHAT.msgs.map(m => {
    if (m.kind === "system") return `<p class="msg-system">${esc(m.text)} · ${esc(fmtClock(m.t))}</p>`;
    const role = ROLE_LABEL[m.role] ? m.role : "student";
    return `<div class="msg${m.mine ? " mine" : ""}${m.kind === "score" ? " score" : ""}">
      <div class="msg-meta"><b>${esc(m.name)}</b>${role !== "student" ? `<span class="role-badge ${role}">${ROLE_LABEL[role]}</span>` : ""}<time>${esc(fmtClock(m.t))}</time>${admin || m.mine ? `<button class="msg-del" data-msgdel="${esc(m.id)}" aria-label="Delete message from ${esc(m.name)}">${CHAT.armed === m.id ? "Click again to delete" : "Delete"}</button>` : ""}</div>
      <p class="msg-text">${m.kind === "score" ? "🎯 " : ""}${esc(m.text)}</p>
    </div>`;
  }).join("");
}
function updateChatView() {
  const log = document.getElementById("chat-log");
  if (!log) return;
  const sig = JSON.stringify([CHAT.msgs.map(m => m.id), CHAT.closed, CHAT.error, CHAT.loading, CHAT.armed, isAdmin()]);
  if (sig === CHAT.sig) return;
  const first = !CHAT.sig;
  const atBottom = first || log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  CHAT.sig = sig;
  log.innerHTML = chatLogHTML();
  if (atBottom) log.scrollTop = log.scrollHeight;
  const st = document.getElementById("chat-state");
  if (st) st.textContent = CHAT.closed ? "Closed" : "Open";
  const locked = CHAT.closed && !isAdmin();
  ["chat-text", "chat-send", "chat-share", "chat-score"].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = locked || (CHAT.sending && id !== "chat-text"); });
  const ta = document.getElementById("chat-text");
  if (ta) ta.placeholder = locked ? "The admin has closed this chat." : "Write a message…";
}
function chatSay(msg) {
  const el = document.getElementById("chat-msg");
  if (el) { el.className = "form-msg" + (msg ? " is-error" : ""); el.textContent = msg; }
}
async function sendChat(text, kind) {
  const who = me();
  if (!who || !CHAT.course || CHAT.sending || !TRACK_URL) return;
  text = String(text || "").trim();
  if (!text) { chatSay("Write a message first."); return; }
  if (text.length > 500) { chatSay("Keep messages under 500 characters."); return; }
  const isCmd = CHAT_COMMANDS.includes(text.toLowerCase());
  if (isCmd && !isAdmin()) { chatSay("Only the admin can use chat commands."); return; }
  if (!isCmd && isAdmin() && /^#\S+$/.test(text)) { chatSay("Unknown command. Use #closed, #open or #del."); return; }
  if (CHAT.closed && !isAdmin()) { chatSay("The admin has closed this chat."); return; }
  CHAT.sending = true; chatSay("");
  updateChatView();
  const send = document.getElementById("chat-send");
  if (send) { send.disabled = true; send.textContent = "Sending…"; }
  try {
    const cid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const d = await adminPost(Object.assign({ action: "chatSend", course: CHAT.course, kind: kind === "score" ? "score" : "text", text, cid }, chatAuth()));
    if (!d || !d.ok) throw new Error((d && d.error) || "error");
    if (kind !== "score") { CHAT.draft = ""; const ta = document.getElementById("chat-text"); if (ta) ta.value = ""; }
    CHAT.sig = "";
    setChat(d);
  } catch (err) {
    const m = err && err.message;
    if (m === "signed out") { CHAT.sending = false; logout("Your sign-in has ended. Please sign in again."); return; }
    if (m === "closed") { CHAT.closed = true; CHAT.sig = ""; updateChatView(); }
    chatSay(m === "closed" ? "The admin has closed this chat."
      : m === "too fast" ? "You're sending too fast. Wait a moment, then send again."
      : m === "not admin" ? "Only the admin can use chat commands."
      : m === "unknown command" ? "Unknown command. Use #closed, #open or #del."
      : m === "wrong password" ? "Your admin sign-in has ended. Log out and sign in again."
      : "Couldn't send your message. Check your connection and try again.");
  } finally {
    CHAT.sending = false;
    if (send) send.textContent = "Send";
    CHAT.sig = CHAT.sig ? CHAT.sig + "~" : "";
    updateChatView();
  }
}
function shareScore() {
  const course = findCourse(DATA, CHAT.course);
  const sel = document.getElementById("chat-score");
  const ch = course && sel ? course.chapters.find(c => c.id === sel.value) : null;
  const r = ch && RESULTS[ch.id];
  if (!r) { chatSay("Finish a quiz in this course first."); return; }
  const where = (ch.label ? ch.label + ": " : "") + ch.name;
  sendChat(`Scored ${r.pct}% (${r.got}/${r.n}) on ${where}${r.secs != null ? " in " + fmtDur(r.secs) : ""}`, "score");
}
async function onDeleteMessage(b) {
  const id = b.dataset.msgdel;
  if (CHAT.armed !== id) {
    CHAT.armed = id; updateChatView();
    setTimeout(() => { if (CHAT.armed === id) { CHAT.armed = ""; updateChatView(); } }, 4000);
    return;
  }
  CHAT.armed = "";
  b.disabled = true; b.textContent = "Deleting…";
  try {
    const d = await adminPost(Object.assign({ action: "chatDel", course: CHAT.course, id }, chatAuth()));
    if (d && d.error === "not found") { CHAT.sig = CHAT.sig + "~"; pollChat(); return; }
    if (!d || !d.ok) throw new Error((d && d.error) || "error");
    CHAT.sig = CHAT.sig + "~";
    setChat(d);
  } catch (err) {
    if (err && err.message === "signed out") { logout("Your sign-in has ended. Please sign in again."); return; }
    chatSay(err && err.message === "not yours" ? "You can only delete your own messages." : "Couldn't delete that message. Try again.");
    CHAT.sig = CHAT.sig + "~"; updateChatView();
  }
}
