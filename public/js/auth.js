"use strict";
/* Sign in
 * Student and teacher accounts, admin sign-in, each person's own progress. */

/* ---------- Sign in: students and teachers use their own account, the admin uses the owner password ---------- */
const ACCOUNT_KEY = "quizhub-account-v1";
const ROLE_LABEL = { student: "Student", teacher: "Teacher", admin: "Admin" };
const tidyName = v => String(v || "").replace(/\s+/g, " ").trim();
// "" when the username is fine, otherwise what to fix. Letters from any alphabet, with spaces, hyphens, apostrophes and dots between.
function nameProblem(v) {
  const n = tidyName(v);
  if (!n) return "Write your username.";
  if (/\d/.test(n)) return "Usernames can't contain numbers.";
  if (!/^[\p{L}\p{M}]+(?:[ '’.-]+[\p{L}\p{M}]+)*\.?$/u.test(n)) return "Use letters only.";
  if (n.replace(/[^\p{L}]/gu, "").length < 2) return "Use at least 2 letters.";
  if (n.length > 40) return "Keep it under 40 characters.";
  return "";
}
let IDENT = (() => {
  const v = lsJSON(ACCOUNT_KEY);
  return isObj(v) && (v.role === "student" || v.role === "teacher") && typeof v.token === "string" && v.token && !nameProblem(v.name)
    ? { role: v.role, name: tidyName(v.name), token: v.token } : null;
})();
lsDel("quizhub-identity-v1");   // the old name-only sign-in
const LOGIN = { role: null, mode: "signin", name: "", error: "", info: "", loading: false };
const isAdmin = () => !!(TRACK_URL && ADMIN.key);
const me = () => (isAdmin() ? { role: "admin", name: "Admin" } : IDENT ? { role: IDENT.role, name: IDENT.name } : null);

// Each person's quiz progress and scores are kept apart, even on a shared phone or computer.
const userSlot = () => { const w = me(); return w ? (w.role === "admin" ? "admin" : "u:" + w.name.toLowerCase()) : ""; };
const userSet = (base, v) => { if (userSlot()) lsSet(base + "|" + userSlot(), v); };
function loadUserData() {
  const get = base => (userSlot() ? lsJSON(base + "|" + userSlot()) : null);
  const p = get(PROGRESS_KEY), r = get(RESULTS_KEY), wp = get(WRITTEN_KEY);
  PROG = isObj(p) ? p : {}; RESULTS = isObj(r) ? r : {}; WPROG = isObj(wp) ? wp : {};
  if (userSlot()) pruneStored();
}

function renderLogin() {
  const dock = document.getElementById("dock");
  dock.hidden = true; setDockVar();
  topEl.innerHTML = `
    <header>
      <span class="eyebrow">Welcome</span>
      <h1 id="page-h" tabindex="-1">UTAS Course Quizzes</h1>
      <p class="intro">Sign in to start studying. Every question shows its definition after you answer, and you get a percentage and your time at the end.</p>
    </header>`;
  const r = LOGIN.role, busy = LOGIN.loading;
  const card = (role, sub) => `<button class="role-card${r === role ? " is-on" : ""}" data-role="${role}" aria-pressed="${r === role}"><span class="role-title">${ROLE_LABEL[role]}</span><span class="role-sub">${sub}</span></button>`;
  let form = "";
  if (r && !TRACK_URL) {
    form = `<p class="muted">Sign-in opens once the site is connected to its Google Sheet.</p>`;
  } else if (r === "student" || r === "teacher") {
    const create = LOGIN.mode === "create", who = ROLE_LABEL[r];
    form = `
      <div class="tabs sub-tabs" role="tablist" aria-label="${who} account">
        <button class="tab" role="tab" data-mode="signin" aria-selected="${!create}">Sign in</button>
        <button class="tab" role="tab" data-mode="create" aria-selected="${create}">Create account</button>
      </div>
      <form id="${create ? "signup-form" : "signin-form"}" class="login-form" novalidate>
        <div class="field">
          <label class="flabel" for="acc-name">${create ? "Choose a username" : "Username"}</label>
          <input type="text" id="acc-name" maxlength="40" autocomplete="username" value="${esc(LOGIN.name)}" aria-describedby="login-msg">
        </div>
        <div class="field">
          <label class="flabel" for="acc-pw">${create ? "Choose a password" : "Password"}</label>
          <input type="password" id="acc-pw" maxlength="100" autocomplete="${create ? "new-password" : "current-password"}">
        </div>
        ${create ? `<div class="field">
          <label class="flabel" for="acc-pw2">Type the password again</label>
          <input type="password" id="acc-pw2" maxlength="100" autocomplete="new-password">
        </div>` : ""}
        <button class="btn primary" type="submit" ${busy ? "disabled" : ""}>${busy ? "Please wait…" : create ? `Create ${who.toLowerCase()} account` : "Sign in"}</button>
      </form>
      <p class="muted small">${create
        ? "Usernames use letters only, no numbers, and each one belongs to one person. Passwords need at least 6 characters."
        : "New here? Choose Create account. Forgot your password? Only the admin can reset it, so ask the site owner."}
        Your username, quiz scores, study time and activity are shared with the site owner.</p>`;
  } else if (r === "admin") {
    form = `
      <form id="login-admin" class="login-form" novalidate>
        <div class="field"><label class="flabel" for="login-pw">Admin password</label><input type="password" id="login-pw" autocomplete="current-password"></div>
        <button class="btn primary" type="submit" ${busy ? "disabled" : ""}>${busy ? "Checking…" : "Sign in"}</button>
      </form>
      <p class="muted small">Only the site owner can sign in as admin.</p>`;
  }
  const msg = LOGIN.error || LOGIN.info;
  app.innerHTML = `
    <article class="card login">
      <div class="q-head">
        <div class="meta"><span class="topic">Sign in</span></div>
        <h2>Who are you?</h2>
        <div class="roles" role="group" aria-label="Sign in as">
          ${card("student", "Username and password")}
          ${card("teacher", "Username and password")}
          ${card("admin", "Owner password")}
        </div>
        ${form}
        <p class="form-msg${LOGIN.error ? " is-error" : msg ? " is-ok" : ""}" id="login-msg" role="status">${esc(msg)}</p>
      </div>
    </article>`;
  if (!busy) {
    const first = ["acc-name", "acc-pw", "acc-pw2", "login-pw"].map(id => document.getElementById(id)).find(el => el && !el.value);
    first?.focus();
  }
}
function pickRole(role) {
  if (!ROLE_LABEL[role]) return;
  if (LOGIN.role !== role) LOGIN.mode = "signin";
  LOGIN.role = role; LOGIN.error = ""; LOGIN.info = "";
  renderAll();
}
function pickMode(mode) {
  LOGIN.name = document.getElementById("acc-name")?.value ?? LOGIN.name;
  LOGIN.mode = mode === "create" ? "create" : "signin";
  LOGIN.error = ""; LOGIN.info = "";
  renderAll();
}
function afterSignIn() {
  Object.assign(LOGIN, { role: null, mode: "signin", name: "", error: "", info: "", loading: false });
  loadUserData();
  route.chapter = null; route.view = "quiz";
  bindChapter();
  renderAll(); window.scrollTo(0, 0); focusHeading();
}
async function accountSubmit(create) {
  const name = document.getElementById("acc-name")?.value || "";
  const pw = document.getElementById("acc-pw")?.value || "";
  const pw2 = document.getElementById("acc-pw2")?.value || "";
  LOGIN.name = name; LOGIN.info = "";
  const fail = (m, id) => { LOGIN.error = m; renderAll(); const el = document.getElementById(id); if (el) el.focus(); };
  const problem = nameProblem(name);
  if (problem) return fail(problem, "acc-name");
  if (!pw) return fail("Write your password.", "acc-pw");
  if (create && pw.length < 6) return fail("Use at least 6 characters for the password.", "acc-pw");
  if (create && pw !== pw2) return fail("The two passwords don't match. Type them again.", "acc-pw2");
  const role = LOGIN.role === "teacher" ? "teacher" : "student";
  LOGIN.loading = true; LOGIN.error = ""; renderAll();
  try {
    let d = await adminPost({ action: create ? "register" : "login", username: tidyName(name), password: pw, role });
    if (create && d && d.error === "name taken") {
      const again = await adminPost({ action: "login", username: tidyName(name), password: pw });
      if (again && again.ok) d = again;
    }
    if (!d || !d.ok) throw new Error((d && d.error) || "error");
    const got = d.role === "teacher" ? "teacher" : "student";
    if (got !== role) throw new Error("role:" + got);
    IDENT = { role: got, name: String(d.name), token: String(d.token) };
    lsSet(ACCOUNT_KEY, JSON.stringify(IDENT));
    afterSignIn();
    track("login");
    trackVisit();
    return;
  } catch (err) {
    const m = (err && err.message) || "";
    LOGIN.error = m === "name taken" ? "That username is already taken. Choose another one."
      : m === "no account" ? "There's no account with that username. Check the spelling, or choose Create account."
      : m === "wrong password" ? "That password is wrong. Forgot it? Ask the admin to reset it."
      : m === "too many tries" ? "Too many wrong passwords. Wait 10 minutes, then try again."
      : m === "bad name" ? "Usernames use letters only, no numbers."
      : m === "bad password" ? "Use at least 6 characters for the password."
      : m.startsWith("role:") ? `That's a ${m.slice(5)} account. Choose ${ROLE_LABEL[m.slice(5)]} above to sign in.`
      : "Couldn't connect. Check your internet connection and try again.";
  }
  LOGIN.loading = false; renderAll();
}
function finishAdminLogin(pw) {
  ADMIN.key = pw; ssSet("quizhub-admin-key", pw); ADMIN.rows = null; ADMIN.error = "";
  if (!OPS.length) OPS = cleanOps(lsJSON(DRAFT_KEY));
  afterSignIn();
}
const authError = m => m === "wrong password" ? "That password is wrong."
  : m === "too many tries" ? "Too many wrong passwords. Wait 10 minutes, then try again."
  : "Couldn't sign in. Check your connection and try again.";
async function adminSignIn(pw) {
  if (!pw) { LOGIN.error = "Enter the admin password."; renderAll(); return; }
  LOGIN.loading = true; LOGIN.error = ""; LOGIN.info = ""; renderAll();
  try {
    const d = await adminPost({ action: "auth", key: pw });
    if (!d || !d.ok) throw new Error((d && d.error) || "error");
    finishAdminLogin(pw);
    return;
  } catch (err) {
    LOGIN.error = authError(err && err.message);
  }
  LOGIN.loading = false; renderAll();
}
// Check the saved sign-in is still valid (it ends when the admin changes that person's password).
async function verifyAccount() {
  if (!IDENT || !TRACK_URL || isAdmin()) return;
  try {
    const d = await adminPost({ action: "whoami", token: IDENT.token });
    if (d && d.ok) return;
    if (d && d.error === "signed out") logout("Your sign-in has ended. Please sign in again.");
  } catch (e) {}
}
function logout(msg) {
  flushTime();
  saveProgress();
  if (ADMIN.key) { ADMIN.key = ""; ADMIN.rows = null; ADMIN.student = null; ADMIN.users = null; ssDel("quizhub-admin-key"); OPS = []; }
  IDENT = null; lsDel(ACCOUNT_KEY); ssDel("quizhub-visit");
  Object.assign(LOGIN, { role: null, mode: "signin", name: "", error: "", info: typeof msg === "string" ? msg : "", loading: false });
  stopChat();
  PROG = {}; RESULTS = {}; WPROG = {};
  route.chapter = null; route.view = "quiz";
  bindChapter();
  renderAll(); window.scrollTo(0, 0); focusHeading();
}
