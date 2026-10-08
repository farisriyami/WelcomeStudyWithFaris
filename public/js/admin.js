"use strict";
/* Admin dashboard
 * Student activity, scores, times, accounts and password resets. */

/* ---------- Admin dashboard ---------- */
const ADMIN = { key: ssGet("quizhub-admin-key") || "", rows: null, users: null, loading: false, error: "", filter: "all", role: "all", student: null,
  pwFor: "", pwMsg: "", pwErr: "", pwBusy: false };
function parseRow(r) {
  const num = v => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
  return {
    t: new Date(r[0]), vid: String(r[1] || ""), name: String(r[2] || "").trim(), role: r[3] === "teacher" ? "teacher" : "student", type: String(r[4] || ""),
    course: String(r[5] || ""), chId: String(r[6] || ""), chapter: String(r[7] || ""), qid: String(r[8] || ""),
    correct: r[9] === "" || r[9] == null ? null : Number(r[9]) === 1,
    pct: num(r[10]), got: num(r[11]), total: num(r[12]), round: String(r[13] || ""), secs: num(r[14]), device: String(r[15] || "")
  };
}
// Talk to the Google Apps Script server. Google sometimes drops or delays an answer,
// so wait at most 25 seconds and try up to 3 times.
async function adminPost(body, tries = 3) {
  let last = new Error("network");
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise(r => setTimeout(r, 1000 * i));
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 25000) : 0;
    try {
      const res = await fetch(TRACK_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
      const d = await res.json();
      if (d && d.error === "retry") { last = new Error("retry"); continue; }
      return d;
    } catch (err) {
      last = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}
async function loadAdmin(key) {
  ADMIN.loading = true; ADMIN.error = "";
  renderAdmin();
  try {
    const [data, acc] = await Promise.all([adminPost({ action: "read", key }), adminPost({ action: "users", key }).catch(() => null)]);
    if (!data || !data.ok) throw new Error((data && data.error) || "error");
    ADMIN.users = acc && acc.ok && Array.isArray(acc.users) ? acc.users.filter(isObj) : [];
    ADMIN.key = key; ssSet("quizhub-admin-key", key);
    ADMIN.rows = (Array.isArray(data.rows) ? data.rows : []).map(parseRow).filter(r => !isNaN(r.t)).sort((a, b) => a.t - b.t);
  } catch (err) {
    ADMIN.rows = null;
    if (err && (err.message === "wrong password" || err.message === "too many tries")) { ADMIN.error = authError(err.message); ADMIN.key = ""; ssDel("quizhub-admin-key"); }
    else ADMIN.error = "Couldn't load the data. Check your internet connection, then try again.";
  }
  ADMIN.loading = false;
  renderAdmin();
}
const fmtTime = d => (isNaN(d) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
const dayKey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const avgOf = a => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
const pctText = v => (v == null ? "–" : v + "%");
// Student and teacher accounts. Only the admin can change a password.
function accountsHTML() {
  const list = (ADMIN.users || []).filter(u => ADMIN.role === "all" || u.role === ADMIN.role)
    .sort((a, b) => String(b.last || "").localeCompare(String(a.last || "")));
  const when = t => (t ? fmtTime(new Date(t)) : "–");
  const rows = list.map(u => `<tr>
      <td>${esc(u.name)}</td>
      <td>${ROLE_LABEL[u.role] || "Student"}</td>
      <td class="nowrap">${esc(when(u.created))}</td>
      <td class="nowrap">${esc(when(u.last))}</td>
      <td>${ADMIN.pwFor === u.key ? `<form id="pw-form" class="pw-form" novalidate>
          <label class="sr-only" for="pw-new">New password for ${esc(u.name)}</label>
          <input type="text" id="pw-new" maxlength="100" autocomplete="off" spellcheck="false" placeholder="New password">
          <button class="btn primary small" type="submit" ${ADMIN.pwBusy ? "disabled" : ""}>${ADMIN.pwBusy ? "Saving…" : "Save"}</button>
          <button class="linkbtn" type="button" id="pw-cancel">Cancel</button>
        </form>` : `<button class="btn secondary small" data-pwfor="${esc(u.key)}">Change password</button>`}</td>
    </tr>`).join("");
  return `
    <article class="card" id="accounts">
      <div class="q-head">
        <div class="meta"><span class="topic">Accounts</span><span>${plural(list.length, "account")}</span></div>
        <h2>Usernames and passwords</h2>
        <p class="muted">Each username belongs to one person. Only you can change a password: choose an account, type the new password, then tell that person. Their old sign-ins stop working.</p>
        ${ADMIN.pwMsg ? `<p class="form-msg is-ok" role="status">${esc(ADMIN.pwMsg)}</p>` : ""}
        ${ADMIN.pwErr ? `<p class="form-msg is-error" role="status">${esc(ADMIN.pwErr)}</p>` : ""}
      </div>
      ${list.length ? `<div class="table-wrap"><table class="admin-table">
        <thead><tr><th>Username</th><th>Role</th><th>Created</th><th>Last sign-in</th><th>Password</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>` : `<p class="empty-note">No accounts yet.</p>`}
    </article>`;
}
async function setUserPassword() {
  const u = (ADMIN.users || []).find(x => x.key === ADMIN.pwFor);
  if (!u) return;
  const pw = document.getElementById("pw-new")?.value || "";
  if (pw.length < 6) { ADMIN.pwMsg = ""; ADMIN.pwErr = "Use at least 6 characters."; renderAdmin(); document.getElementById("pw-new")?.focus(); return; }
  ADMIN.pwBusy = true; ADMIN.pwErr = ""; ADMIN.pwMsg = "";
  renderAdmin();
  try {
    const d = await adminPost({ action: "setPassword", key: ADMIN.key, user: u.key, password: pw });
    if (!d || !d.ok) throw new Error((d && d.error) || "error");
    ADMIN.pwFor = "";
    ADMIN.pwMsg = `Password changed for ${u.name}. Tell them the new password. Their old sign-ins have ended.`;
  } catch (err) {
    ADMIN.pwErr = err && err.message === "wrong password" ? "Your admin sign-in has ended. Sign out and sign in again." : "Couldn't change the password. Try again.";
  }
  ADMIN.pwBusy = false;
  renderAdmin();
  document.getElementById("accounts")?.scrollIntoView({ block: "nearest" });
}
const kpiHTML = (v, label) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(label)}</span></div>`;
function describeEvent(r) {
  const where = [r.course, r.chapter].filter(Boolean).join(" · ");
  const took = r.secs != null ? " in " + fmtDur(r.secs) : "";
  if (r.type === "visit") return "Visited the site";
  if (r.type === "set_name") return "Entered their name";
  if (r.type === "login") return `Signed in as ${r.role === "teacher" ? "a teacher" : "a student"}`;
  if (r.type === "time") return "Studied for " + fmtDur(r.secs);
  if (r.type === "open_chapter") return "Opened " + where;
  if (r.type === "quiz_finish") return `Finished the quiz in ${where}: ${pctText(r.pct)} (${r.got}/${r.total})${took}`;
  if (r.type === "written_finish") return `Finished written practice in ${where}: ${pctText(r.pct)} (${r.got}/${r.total})${took}`;
  if (r.type === "answer") return `Answered a question in ${where}: ${r.correct ? "correct" : "wrong"}${took}`;
  return r.type;
}
function downloadCSV() {
  if (!ADMIN.rows) return;
  const cell = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const head = ["time", "visitor", "name", "role", "action", "course", "chapter", "question", "correct", "score %", "got", "total", "round", "seconds", "minutes and seconds", "device"];
  const lines = [head.map(cell).join(",")].concat(ADMIN.rows.map(r => [
    isNaN(r.t) ? "" : r.t.toISOString(), r.vid, r.name, r.role, r.type, r.course, r.chapter, r.qid,
    r.correct == null ? "" : r.correct ? 1 : 0, r.pct, r.got, r.total, r.round, r.secs, r.secs == null ? "" : fmtDur(r.secs), r.device
  ].map(cell).join(",")));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "student-activity-" + dayKey(new Date()) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function renderAdmin() {
  const dock = document.getElementById("dock");
  dock.hidden = true; setDockVar();
  topEl.innerHTML = `
    <a class="backlink" href="#"><span aria-hidden="true">←</span> Back to the quizzes</a>
    <header>
      <span class="eyebrow">Admin</span>
      <h1 id="page-h" tabindex="-1">Study dashboard</h1>
    </header>`;
  if (!TRACK_URL) {
    app.innerHTML = `
      <article class="card"><div class="q-head">
        <div class="meta"><span class="topic">Not connected</span></div>
        <h2>Student tracking isn't connected yet.</h2>
        <p class="muted">Names, scores, actions and visitor numbers will appear here once the tracking link is added to the site.</p>
      </div></article>`;
    return;
  }
  if (!ADMIN.rows) {
    if (ADMIN.key && !ADMIN.loading && !ADMIN.error) { loadAdmin(ADMIN.key); return; }
    app.innerHTML = `
      <article class="card"><div class="q-head">
        <div class="meta"><span class="topic">Admin sign in</span></div>
        <h2>Enter your admin password</h2>
        <form id="admin-login" class="addch" novalidate>
          <div class="field">
            <label class="flabel" for="admin-pw">Password</label>
            <input type="password" id="admin-pw" autocomplete="current-password">
          </div>
          <button class="btn primary" type="submit" ${ADMIN.loading ? "disabled" : ""}>${ADMIN.loading ? "Loading…" : "Open dashboard"}</button>
        </form>
        <p class="form-msg${ADMIN.error ? " is-error" : ""}" role="status">${esc(ADMIN.error)}</p>
        <p class="muted">Only the site owner can open the dashboard.</p>
      </div></article>`;
    if (!ADMIN.loading) document.getElementById("admin-pw")?.focus();
    return;
  }
  renderDashboard();
}
function renderDashboard() {
  const all = ADMIN.rows;
  const vidName = {};
  all.forEach(r => { if (r.name) vidName[r.vid] = r.name; });
  const nameOf = r => r.name || vidName[r.vid] || "";
  const personKey = r => (nameOf(r) ? "n:" + r.role + ":" + nameOf(r).toLowerCase() : "v:" + r.vid);
  const inCourse = r => ADMIN.filter === "all" || r.course === ADMIN.filter;
  const general = r => r.type === "visit" || r.type === "set_name" || r.type === "login" || r.type === "time";
  const rows = all.filter(r => ADMIN.role === "all" || r.role === ADMIN.role);
  const avgTime = a => (a.length ? fmtDur(a.reduce((x, y) => x + y, 0) / a.length) : "–");

  const finishes = rows.filter(r => r.type === "quiz_finish" && r.pct != null && inCourse(r));
  const studySecs = rows.filter(r => r.type === "time" && r.secs != null).reduce((x, r) => x + r.secs, 0);
  const now = new Date(), today = dayKey(now);
  const people = new Map();
  rows.forEach(r => {
    const k = personKey(r);
    let p = people.get(k);
    if (!p) { p = { key: k, name: nameOf(r) || "Visitor without a name", role: r.role, first: r.t, last: r.t, devices: new Set(), visits: 0, secs: 0, chapters: new Set(), quiz: [], quizSecs: [], written: [] }; people.set(k, p); }
    if (nameOf(r)) p.name = nameOf(r);
    if (r.t > p.last) p.last = r.t;
    if (r.device) p.devices.add(r.device);
    if (r.type === "visit") p.visits++;
    if (r.type === "time" && r.secs != null) p.secs += r.secs;
    if (general(r) || !inCourse(r)) return;
    if (r.type === "open_chapter" && r.chId) p.chapters.add(r.chId);
    if (r.type === "quiz_finish" && r.pct != null) { p.quiz.push(r.pct); if (r.secs != null) p.quizSecs.push(r.secs); }
    if (r.type === "written_finish" && r.pct != null) p.written.push(r.pct);
  });
  const peopleList = [...people.values()].sort((a, b) => b.last - a.last);
  const countRole = role => peopleList.filter(p => p.key.startsWith("n:" + role + ":")).length;

  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days.push(dayKey(d)); }
  const perDay = days.map(k => new Set(rows.filter(r => dayKey(r.t) === k).map(r => r.vid)).size);
  const maxDay = Math.max(1, ...perDay);

  const chMap = new Map();
  rows.filter(r => r.chId && !general(r) && inCourse(r)).forEach(r => {
    let c = chMap.get(r.chId);
    if (!c) { c = { course: r.course, chapter: r.chapter, opens: 0, people: new Set(), quiz: [], quizSecs: [], written: [] }; chMap.set(r.chId, c); }
    if (r.type === "open_chapter") { c.opens++; c.people.add(personKey(r)); }
    if (r.type === "quiz_finish" && r.pct != null) { c.quiz.push(r.pct); if (r.secs != null) c.quizSecs.push(r.secs); }
    if (r.type === "written_finish" && r.pct != null) c.written.push(r.pct);
  });
  const chList = [...chMap.values()].sort((a, b) => (a.course + a.chapter).localeCompare(b.course + b.chapter, undefined, { numeric: true }));

  const qText = {};
  DATA.courses.forEach(c => c.chapters.forEach(ch => ch.questions.forEach(q => { qText[q.id] = q.q; })));
  const qMap = new Map();
  rows.filter(r => r.type === "answer" && r.qid && inCourse(r)).forEach(r => {
    let q = qMap.get(r.qid);
    if (!q) { q = { id: r.qid, n: 0, right: 0, secs: [], where: [r.course, r.chapter].filter(Boolean).join(" · ") }; qMap.set(r.qid, q); }
    q.n++; if (r.correct) q.right++;
    if (r.secs != null) q.secs.push(r.secs);
  });
  const hard = [...qMap.values()].filter(q => q.n >= 3).map(q => Object.assign(q, { rate: Math.round(q.right / q.n * 100) }))
    .sort((a, b) => a.rate - b.rate || b.n - a.n).slice(0, 10);

  const showInFeed = r => r.type !== "answer" && r.type !== "time" && (general(r) || inCourse(r));
  const feed = rows.filter(showInFeed).slice(-40).reverse();

  let detail = "";
  const sel = ADMIN.student && people.get(ADMIN.student);
  if (sel) {
    const mine = rows.filter(r => personKey(r) === sel.key);
    const best = new Map();
    mine.filter(r => r.type === "quiz_finish" && r.pct != null && inCourse(r)).forEach(r => {
      const k = [r.course, r.chapter].filter(Boolean).join(" · ");
      const b = best.get(k) || { best: 0, tries: 0, fastest: null, last: null };
      b.best = Math.max(b.best, r.pct); b.tries++;
      if (r.secs != null) { b.fastest = b.fastest == null ? r.secs : Math.min(b.fastest, r.secs); b.last = r.secs; }
      best.set(k, b);
    });
    const evs = mine.filter(showInFeed).reverse().slice(0, 100);
    detail = `
      <article class="card">
        <div class="q-head">
          <div class="meta"><span class="topic">${ROLE_LABEL[sel.role] || "Student"}</span><button class="linkcell" data-student="">Close</button></div>
          <h2>${esc(sel.name)}</h2>
          <p class="muted">First seen ${esc(fmtTime(sel.first))} · last active ${esc(fmtTime(sel.last))} · ${sel.visits} ${sel.visits === 1 ? "visit" : "visits"} · studied for <b>${fmtDur(sel.secs)}</b></p>
        </div>
        ${best.size ? `<div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Chapter</th><th>Best quiz score</th><th>Attempts</th><th>Fastest time</th><th>Last time</th></tr></thead>
          <tbody>${[...best].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.best}%</td><td>${v.tries}</td><td>${v.fastest == null ? "–" : fmtDur(v.fastest)}</td><td>${v.last == null ? "–" : fmtDur(v.last)}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="empty-note">No finished quizzes yet.</p>`}
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>When</th><th>Action</th></tr></thead>
          <tbody>${evs.map(r => `<tr><td class="nowrap">${esc(fmtTime(r.t))}</td><td>${esc(describeEvent(r))}</td></tr>`).join("")}</tbody>
        </table></div>
      </article>`;
  }

  const courseOpts = `<option value="all">All courses</option>` +
    DATA.courses.map(c => `<option value="${esc(c.name)}"${ADMIN.filter === c.name ? " selected" : ""}>${esc(c.name)}</option>`).join("");
  const roleOpts = [["all", "Students and teachers"], ["student", "Students only"], ["teacher", "Teachers only"]]
    .map(([v, l]) => `<option value="${v}"${ADMIN.role === v ? " selected" : ""}>${l}</option>`).join("");
  const avgAll = avgOf(finishes.map(r => r.pct));

  app.innerHTML = `
    <div class="admin-tools">
      <select id="admin-course" aria-label="Filter by course">${courseOpts}</select>
      <select id="admin-role" aria-label="Filter by role">${roleOpts}</select>
      <button class="btn secondary small" id="admin-refresh">Refresh</button>
      <button class="btn secondary small" id="admin-csv">Download CSV</button>
      <a class="linkbtn" href="#">Edit quizzes</a>
      <button class="linkbtn" id="admin-logout">Sign out</button>
    </div>
    <div class="kpis">
      ${kpiHTML((ADMIN.users || []).length, "Accounts")}
      ${kpiHTML(new Set(rows.map(r => r.vid)).size, "Unique visitors")}
      ${kpiHTML(new Set(rows.filter(r => dayKey(r.t) === today).map(r => r.vid)).size, "Visitors today")}
      ${kpiHTML(countRole("student"), "Students")}
      ${kpiHTML(countRole("teacher"), "Teachers")}
      ${kpiHTML(finishes.length, "Quizzes finished")}
      ${kpiHTML(avgAll == null ? "–" : avgAll + "%", "Average quiz score")}
      ${kpiHTML(fmtDur(studySecs), "Total study time")}
      ${kpiHTML(avgTime(finishes.filter(r => r.secs != null).map(r => r.secs)), "Average quiz time")}
    </div>
    ${detail}
    <article class="card">
      <div class="q-head"><div class="meta"><span class="topic">Visitors</span><span>Last 14 days</span></div><h2>Visitors per day</h2></div>
      <div class="bars" role="img" aria-label="Unique visitors per day for the last 14 days">
        ${perDay.map((v, i) => `<div class="col" title="${days[i]}: ${v} ${v === 1 ? "visitor" : "visitors"}"><span class="n">${v || ""}</span><span class="b" style="height:${v / maxDay * 85}%"></span></div>`).join("")}
      </div>
      <div class="bars-x" aria-hidden="true">${days.map(k => `<span>${k.slice(8)}/${k.slice(5, 7)}</span>`).join("")}</div>
    </article>
    <article class="card">
      <div class="q-head">
        <div class="meta"><span class="topic">People</span><span>${peopleList.length} ${peopleList.length === 1 ? "person" : "people"}</span></div>
        <h2>Students, teachers and scores</h2>
        <p class="muted">Select a name to see everything that person did. Times are in minutes and seconds.</p>
      </div>
      ${peopleList.length ? `<div class="table-wrap"><table class="admin-table">
        <thead><tr><th>Name</th><th>Role</th><th>Last active</th><th>Visits</th><th>Study time</th><th>Chapters opened</th><th>Quizzes finished</th><th>Average quiz</th><th>Best quiz</th><th>Average quiz time</th><th>Written average</th><th>Device</th></tr></thead>
        <tbody>${peopleList.map(p => `<tr>
          <td><button class="linkcell" data-student="${esc(p.key)}">${esc(p.name)}</button></td>
          <td>${ROLE_LABEL[p.role] || "Student"}</td>
          <td class="nowrap">${esc(fmtTime(p.last))}</td>
          <td>${p.visits}</td>
          <td class="nowrap">${fmtDur(p.secs)}</td>
          <td>${p.chapters.size}</td>
          <td>${p.quiz.length}</td>
          <td>${pctText(avgOf(p.quiz))}</td>
          <td>${p.quiz.length ? Math.max(...p.quiz) + "%" : "–"}</td>
          <td class="nowrap">${avgTime(p.quizSecs)}</td>
          <td>${pctText(avgOf(p.written))}</td>
          <td>${esc([...p.devices].join(", "))}</td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<p class="empty-note">No visitors yet. Share the site link and activity will appear here.</p>`}
    </article>
    ${accountsHTML()}
    <article class="card">
      <div class="q-head"><div class="meta"><span class="topic">Chapters</span></div><h2>Chapter performance</h2></div>
      ${chList.length ? `<div class="table-wrap"><table class="admin-table">
        <thead><tr><th>Course</th><th>Chapter</th><th>Opened</th><th>People</th><th>Quizzes finished</th><th>Average quiz</th><th>Average quiz time</th><th>Written average</th></tr></thead>
        <tbody>${chList.map(c => `<tr><td>${esc(c.course)}</td><td>${esc(c.chapter)}</td><td>${c.opens}</td><td>${c.people.size}</td><td>${c.quiz.length}</td><td>${pctText(avgOf(c.quiz))}</td><td class="nowrap">${avgTime(c.quizSecs)}</td><td>${pctText(avgOf(c.written))}</td></tr>`).join("")}</tbody>
      </table></div>` : `<p class="empty-note">No chapters opened yet.</p>`}
    </article>
    <article class="card">
      <div class="q-head"><div class="meta"><span class="topic">Questions</span><span>At least 3 answers</span></div><h2>Hardest questions</h2></div>
      ${hard.length ? `<div class="table-wrap"><table class="admin-table">
        <thead><tr><th>Question</th><th>Chapter</th><th>Answers</th><th>Correct</th><th>Average time</th></tr></thead>
        <tbody>${hard.map(q => `<tr><td>${esc(qText[q.id] || q.id)}</td><td>${esc(q.where)}</td><td>${q.n}</td><td>${q.rate}%</td><td class="nowrap">${avgTime(q.secs)}</td></tr>`).join("")}</tbody>
      </table></div>` : `<p class="empty-note">Not enough answers yet.</p>`}
    </article>
    <article class="card">
      <div class="q-head"><div class="meta"><span class="topic">Activity</span><span>Latest 40</span></div><h2>Recent activity</h2></div>
      ${feed.length ? `<div class="table-wrap"><table class="admin-table">
        <thead><tr><th>When</th><th>Who</th><th>Role</th><th>Action</th></tr></thead>
        <tbody>${feed.map(r => `<tr><td class="nowrap">${esc(fmtTime(r.t))}</td><td>${esc(nameOf(r) || "Visitor without a name")}</td><td>${ROLE_LABEL[r.role] || "Student"}</td><td>${esc(describeEvent(r))}</td></tr>`).join("")}</tbody>
      </table></div>` : `<p class="empty-note">No activity yet.</p>`}
    </article>`;
}
