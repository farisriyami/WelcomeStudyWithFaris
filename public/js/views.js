"use strict";
/* Screens and navigation
 * Top bar, course home, bottom dock and moving between screens. */

/* ---------- Rendering: top bar ---------- */
function renderTop() {
  if (!route.chapter) {
    const eff = effective();
    topEl.innerHTML = `
      <header>
        <span class="eyebrow">Study quizzes${usingLocal ? " · your copy" : ""}</span>
        <h1 id="page-h" tabindex="-1">UTAS Course Quizzes</h1>
        <p class="intro">Pick a course, then a chapter. Every question shows its definition after you answer, and you get a percentage at the end.</p>
        ${me() ? `<p class="name-line muted">Signed in as <b>${esc(me().name)}</b> · ${ROLE_LABEL[me().role]} · <button class="linkbtn" id="logout">Log out</button>${isAdmin() ? ` · <a href="#admin">Dashboard</a>` : ""}</p>` : ""}
        ${canEdit() ? `<p class="name-line muted"><b>Editing is on.</b> Only you can see the tools to add and delete chapters and questions.</p>` : ""}
      </header>
      <div class="tabs course-tabs" role="tablist" aria-label="Courses">
        ${eff.courses.map(c => `<button class="tab" role="tab" data-course="${esc(c.id)}" aria-selected="${c.id === route.course}">${esc(c.name)} <span class="count">${c.chapters.length}</span></button>`).join("")}
      </div>`;
    return;
  }
  const f = chapterRef(route.chapter);
  const ch = f.chapter, src = CH || ch;
  const n = quizQs(src).length, wn = writtenQs(src).length;
  topEl.innerHTML = `
    <button class="backlink" data-go="home"><span aria-hidden="true">←</span> ${esc(f.course.name)}</button>
    <header>
      <span class="eyebrow">${esc(f.course.name)}${ch.label ? " · " + esc(ch.label) : ""} · ${plural(n, "question")}${wn ? ` · ${wn} written` : ""}${usingLocal ? " · your copy" : ""}</span>
      <h1 id="page-h" tabindex="-1">${esc(ch.name)}</h1>
    </header>
    <div class="tabs" role="tablist" aria-label="Sections">
      ${isAdmin() ? `<button class="tab" role="tab" data-view="manage" aria-selected="true">Questions <span class="count">${n + wn}</span></button>` : `
      <button class="tab" role="tab" data-view="quiz" aria-selected="${route.view === "quiz"}">Quiz</button>
      ${wn ? `<button class="tab" role="tab" data-view="written" aria-selected="${route.view === "written"}">Written Q&amp;A</button>` : ""}`}
    </div>`;
}

const localNotice = () => `<div class="notice"><p>You're using a copy of the questions saved in this browser. Other people who open this page see the shared questions.</p><button class="btn secondary small" id="use-shared">Switch to the shared questions</button></div>`;

/* ---------- Rendering: course home ---------- */
function statusHTML(id) {
  const p = PROG[id], r = RESULTS[id];
  if (isObj(p) && p.phase === "quiz" && Array.isArray(p.order) && isObj(p.answers)) {
    const a = p.order.filter(q => p.answers[q] !== undefined).length;
    if (a > 0) return `<span class="st st-prog">In progress · ${a} of ${p.order.length}</span>${isObj(r) ? `<span>Last score ${r.pct}%</span>` : ""}`;
  }
  if (isObj(r) && typeof r.pct === "number") {
    const c = r.pct >= 75 ? "st-good" : r.pct >= 50 ? "st-warn" : "st-bad";
    return `<span class="st ${c}">Last score ${r.pct}%${r.secs != null ? " · " + fmtDur(r.secs) : ""}</span>`;
  }
  return `<span class="st st-none">Not started</span>`;
}
function chapterCard(r, eff) {
  const ch = r.ch, live = findChapter(eff, ch.id);
  const src = live ? live.chapter : ch;
  const n = quizQs(src).length, wn = writtenQs(src).length;
  const status = r.state === "new" ? `<span class="st st-prog">Not saved yet</span>`
    : r.state === "del" ? `<span class="st st-bad">Will be deleted</span>`
    : isAdmin() ? "" : statusHTML(ch.id);
  return `<li><button class="chapter-card${r.state ? " is-" + r.state : ""}" data-open="${esc(ch.id)}">
    <span class="cc-main">
      <span class="cc-label">${esc(ch.label || "Chapter")}</span>
      <span class="cc-name">${esc(ch.name)}</span>
      <span class="cc-meta"><span>${plural(n, "question")}${wn ? ` · ${wn} written` : ""}</span>${status}</span>
    </span>
    <span class="cc-arrow" aria-hidden="true">→</span>
  </button></li>`;
}
function renderHome() {
  const eff = effective();
  const course = findCourse(eff, route.course) || eff.courses[0] || null;
  if (!course) { app.innerHTML = `<p class="muted">There are no courses yet.</p>`; return; }
  route.course = course.id;
  const saved = findCourse(DATA, course.id);
  const rows = (saved ? saved.chapters : []).map(ch => ({ ch, state: isDeletingChapter(ch.id) ? "del" : "" }))
    .concat(OPS.filter(o => o.op === "addCh" && o.course === course.id).map(o => ({ ch: o.ch, state: "new" })));
  const tab = route.tab === "chat" ? "chat" : "chapters";
  const head = `
    ${usingLocal ? localNotice() : ""}
    <section class="course-head">
      <h2>${esc(course.name)}</h2>
      ${course.sub ? `<p class="muted">${esc(course.sub)}</p>` : ""}
    </section>
    <div class="tabs sub-tabs" role="tablist" aria-label="${esc(course.name)} sections">
      <button class="tab" role="tab" data-tab="chapters" aria-selected="${tab === "chapters"}">Chapters <span class="count">${rows.length}</span></button>
      <button class="tab" role="tab" data-tab="chat" aria-selected="${tab === "chat"}">Chat</button>
    </div>`;
  const foot = `<p class="site-foot">${TRACK_URL ? "Your name, role, quiz scores, study time and activity are shared with the site owner. · " : ""}<a href="#admin">Admin</a></p>`;
  if (tab === "chat") {
    if (CHAT.course !== course.id) resetChat(course.id);
    app.innerHTML = head + chatHTML(course) + foot;
    CHAT.sig = "";
    updateChatView();
    const ta = document.getElementById("chat-text");
    if (ta) ta.value = CHAT.draft;
    if (!CHAT.timer && TRACK_URL) startChat();
    return;
  }
  app.innerHTML = `${head}
    ${rows.length ? `<ol class="chapters">${rows.map(r => chapterCard(r, eff)).join("")}</ol>` : `<p class="muted">No chapters yet.${canEdit() ? " Add the first one below." : ""}</p>`}
    ${canEdit() ? `<article class="card">
      <div class="q-head">
        <div class="meta"><span class="topic">Add a chapter</span><span>to ${esc(course.name)}</span></div>
        <form id="addch" class="addch" novalidate>
          <div class="field">
            <label class="flabel" for="ch-name">Chapter ${course.chapters.length + 1} name</label>
            <input type="text" id="ch-name" placeholder="e.g. Visitor Attractions and Events" autocomplete="off">
          </div>
          <button class="btn primary" type="submit">Add chapter</button>
        </form>
        <p class="form-msg" id="ch-msg" role="status"></p>
      </div>
    </article>` : ""}
    ${foot}`;
}

/* ---------- Rendering: bottom dock ---------- */
// Redraws the whole bottom dock: Next bar (phones) and save bar.
function renderSavebar() {
  drawSavebar();
  drawNextbar();
  syncDock();
}
function drawNextbar() {
  const nb = document.getElementById("nextbar");
  const id = S && S.order[S.idx];
  const show = phoneMQ.matches && !!route.chapter && route.view === "quiz" && !!CH && !!S && S.phase === "quiz" && S.answers[id] !== undefined;
  nb.hidden = !show;
  if (!show) { nb.innerHTML = ""; return; }
  const ok = isRight(id), last = S.idx === S.order.length - 1;
  nb.innerHTML = `<div class="nextbar-inner">
    <span class="nb-verdict ${ok ? "ok" : "no"}"><span class="dot"></span>${ok ? "Correct" : "Not quite"}</span>
    <button class="btn primary" id="next-m">${last ? "See my score" : "Next question"}</button>
  </div>`;
}
function setDockVar() {
  const dock = document.getElementById("dock");
  document.body.style.setProperty("--dock-h", (dock.hidden ? 0 : dock.offsetHeight) + "px");
}
function syncDock() {
  const dock = document.getElementById("dock");
  dock.hidden = document.getElementById("nextbar").hidden && document.getElementById("savebar").hidden;
  setDockVar();
}
function drawSavebar() {
  const bar = document.getElementById("savebar");
  const n = OPS.length;
  const show = n > 0 || !!barMsg;
  bar.hidden = !show;
  if (!show) { bar.innerHTML = ""; return; }
  const text = barMsg ? esc(barMsg)
    : `<b>${n}</b> unsaved ${n === 1 ? "change" : "changes"}${usingLocal ? " · saves to this browser" : ""}`;
  bar.innerHTML = `<div class="savebar-inner">
    <p class="bar-text" role="status">${text}</p>
    ${n ? `<div class="bar-actions">
      <button class="btn secondary small" id="discard" ${saving ? "disabled" : ""}>${discardArmed ? "Click again to discard" : "Discard"}</button>
      <button class="btn primary small" id="save" ${saving ? "disabled" : ""}>${saving ? "Saving…" : "Save changes"}</button>
    </div>` : ""}
  </div>`;
}
function setBarMsg(msg, autoClear = true) {
  barMsg = msg;
  clearTimeout(barTimer);
  if (autoClear) barTimer = setTimeout(() => { barMsg = ""; renderSavebar(); }, 7000);
  renderSavebar();
}

function renderAll() {
  if (adminMode) { stopChat(); renderAdmin(); return; }
  if (!me()) { stopChat(); renderLogin(); return; }
  if (route.view === "manage" && !canEdit()) route.view = "quiz";
  if (isAdmin() && route.chapter) route.view = "manage";
  if (route.chapter || route.tab !== "chat") stopChat();
  renderTop();
  if (!route.chapter) renderHome();
  else if (route.view === "manage") renderManage();
  else if (!CH) renderUnsavedQuiz();
  else if (route.view === "written" && W) renderWritten();
  else { if (route.view === "written") route.view = "quiz"; renderQuizView(); }
  renderSavebar();
  saveProgress();
  lsSet(ROUTE_KEY, JSON.stringify(route));
}

/* ---------- Navigation ---------- */
function focusHeading() { const h = document.getElementById("page-h"); if (h) h.focus({ preventScroll: true }); }
function focusQuestion() { const h = document.getElementById("qtext"); if (h) h.focus({ preventScroll: true }); }
function scrollToApp() {
  const top = app.getBoundingClientRect().top + window.scrollY - 16;
  if (window.scrollY > top) window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
}
function openChapter(id, view) {
  const f = chapterRef(id);
  if (!f) return;
  route.chapter = id;
  route.course = f.course.id;
  route.view = view || (findChapter(DATA, id) ? "quiz" : "manage");
  track("open_chapter", chapterInfo());
  restartArmed = false; delChArmed = false; filterText = "";
  bindChapter();
  renderAll();
  window.scrollTo(0, 0);
  focusHeading();
}
function goHome() {
  route.chapter = null;
  route.view = "quiz";
  restartArmed = false; delChArmed = false;
  bindChapter();
  renderAll();
  window.scrollTo(0, 0);
  focusHeading();
}
function setView(v) {
  if (v === route.view || (v === "manage" && !canEdit()) || (isAdmin() && v !== "manage")) return;
  route.view = v;
  delChArmed = false;
  renderAll();
}
