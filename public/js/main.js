"use strict";
/* Start
 * Click, key and form handlers, then start the site. */

function onClick(e) {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  if (b.classList.contains("opt")) { choose(+b.dataset.k); return; }
  if (b.dataset.open) { openChapter(b.dataset.open); return; }
  if (b.dataset.go === "home") { goHome(); return; }
  if (b.dataset.course) { route.course = b.dataset.course; renderAll(); return; }
  if (b.dataset.role) { pickRole(b.dataset.role); return; }
  if (b.dataset.mode) { pickMode(b.dataset.mode); return; }
  if (b.dataset.pwfor) { ADMIN.pwFor = b.dataset.pwfor; ADMIN.pwMsg = ""; ADMIN.pwErr = ""; renderAdmin(); document.getElementById("pw-new")?.focus(); return; }
  if (b.dataset.tab) { route.tab = b.dataset.tab === "chat" ? "chat" : "chapters"; renderAll(); if (route.tab === "chat") document.getElementById("chat-text")?.focus({ preventScroll: true }); return; }
  if (b.dataset.msgdel) { onDeleteMessage(b); return; }
  if (b.dataset.view) { setView(b.dataset.view); return; }
  if (b.dataset.del) {
    const id = b.dataset.del;
    if (!OPS.some(o => o.op === "delQ" && o.id === id)) OPS.push({ op: "delQ", ch: route.chapter, id });
    afterDraftChange(`[data-undo="${id}"]`);
    return;
  }
  if (b.dataset.undo) { const id = b.dataset.undo; OPS = OPS.filter(o => !(o.op === "delQ" && o.id === id)); afterDraftChange(`[data-del="${id}"]`); return; }
  if (b.dataset.remove) { const id = b.dataset.remove; OPS = OPS.filter(o => !(o.op === "addQ" && o.q.id === id)); afterDraftChange("#q-search"); return; }
  if (b.dataset.student !== undefined) { ADMIN.student = b.dataset.student || null; renderAdmin(); window.scrollTo(0, 0); return; }
  switch (b.id) {
    case "next": case "next-m": next(); break;
    case "retake": newRound(allIds(), "Full quiz", { focus: true }); break;
    case "retake-shuffle": newRound(allIds(), "Shuffled quiz", { focus: true, shuffle: true }); break;
    case "retry": newRound(S.order.filter(id => !isRight(id)), "Retry round", { focus: true }); break;
    case "restart":
      if (restartArmed) { newRound(allIds(), "Full quiz", { focus: true }); break; }
      restartArmed = true; renderQuizView();
      document.getElementById("restart")?.focus();
      setTimeout(() => { if (restartArmed) { restartArmed = false; if (route.view === "quiz" && S && S.phase === "quiz") renderQuizView(); } }, 4000);
      break;
    case "del-chapter":
      if (delChArmed) { delChArmed = false; deleteChapter(); break; }
      delChArmed = true;
      b.textContent = "Click again to delete this chapter";
      setTimeout(() => { if (delChArmed) { delChArmed = false; const el = document.getElementById("del-chapter"); if (el) el.textContent = "Delete this chapter"; } }, 4000);
      break;
    case "undo-del-ch":
      OPS = OPS.filter(o => !(o.op === "delCh" && o.ch === route.chapter));
      saveDraft();
      renderAll();
      break;
    case "w-show": {
      W.shown[W.order[W.idx]] = true;
      renderWritten(); saveProgress();
      const m = app.querySelector(".model");
      if (m) m.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      document.getElementById("w-got")?.focus({ preventScroll: true });
      break;
    }
    case "w-got": case "w-miss":
      W.marks[W.order[W.idx]] = b.id === "w-got";
      renderWritten(); saveProgress();
      document.getElementById("w-next")?.focus({ preventScroll: true });
      break;
    case "w-next":
      if (W.idx < W.order.length - 1) W.idx++;
      else {
        W.phase = "results";
        const wGot = W.order.filter(i => W.marks[i] === true).length;
        track("written_finish", Object.assign(chapterInfo(), { got: wGot, total: W.order.length, pct: Math.round(wGot / W.order.length * 100), secs: Math.round((W.ms || 0) / 1000) }));
      }
      renderWritten(); saveProgress();
      scrollToApp(); focusQuestion();
      break;
    case "w-again": W = newWritten(allWIds()); renderAll(); scrollToApp(); focusQuestion(); break;
    case "w-review": W = newWritten(W.order.filter(id => W.marks[id] !== true)); renderAll(); scrollToApp(); focusQuestion(); break;
    case "logout": logout(); break;
    case "pw-cancel": ADMIN.pwFor = ""; ADMIN.pwErr = ""; renderAdmin(); break;
    case "chat-share": shareScore(); break;
    case "admin-refresh": ADMIN.rows = null; loadAdmin(ADMIN.key); break;
    case "admin-logout": ADMIN.key = ""; ADMIN.rows = null; ADMIN.error = ""; ADMIN.student = null; ssDel("quizhub-admin-key"); OPS = []; LOGIN.role = null; renderAdmin(); break;
    case "admin-csv": downloadCSV(); break;
    case "use-shared": useShared(); break;
    case "save": saveChanges(); break;
    case "discard":
      if (discardArmed) {
        discardArmed = false; OPS = []; saveDraft();
        if (route.chapter && !findChapter(DATA, route.chapter)) goHome(); else renderAll();
        setBarMsg("Changes discarded.");
      } else {
        discardArmed = true; renderSavebar();
        document.getElementById("discard")?.focus();
        setTimeout(() => { if (discardArmed) { discardArmed = false; renderSavebar(); } }, 4000);
      }
      break;
  }
}

function onKey(e) {
  if (!route.chapter || route.view !== "quiz" || !CH || !S || S.phase !== "quiz" || e.altKey || e.ctrlKey || e.metaKey) return;
  const tg = e.target;
  if (tg && tg.closest && (tg.closest("input, textarea, select") || tg.isContentEditable)) return;
  const id = S.order[S.idx];
  if (S.answers[id] === undefined) {
    const key = e.key.toLowerCase();
    let k = "abcd".indexOf(key);
    if (k < 0) k = "1234".indexOf(key);
    if (k < 0 && byId.get(id).tf) k = "tf".indexOf(key);
    if (k >= 0 && k < S.opts[id].length) { e.preventDefault(); choose(k); }
  } else if ((e.key === "Enter" || e.key === "ArrowRight") && !(tg instanceof HTMLButtonElement)) {
    e.preventDefault(); next();
  }
}

/* ---------- Start ---------- */
// Build the page, load the question banks, then show the right screen.
async function init() {
  root = document.getElementById("root");
  root.innerHTML = `
    <div id="top" class="top"></div>
    <main id="app"></main>
    <div id="dock" class="dock" hidden>
      <div id="nextbar" class="nextbar" hidden></div>
      <div id="savebar" class="savebar" hidden></div>
    </div>`;
  topEl = document.getElementById("top");
  app = document.getElementById("app");

  root.addEventListener("click", onClick);
  root.addEventListener("submit", e => {
    if (e.target.id === "addform") { e.preventDefault(); onAdd(); }
    else if (e.target.id === "addch") { e.preventDefault(); onAddChapter(); }
    else if (e.target.id === "admin-login") { e.preventDefault(); const pw = document.getElementById("admin-pw").value; if (pw) loadAdmin(pw); }
    else if (e.target.id === "signin-form" || e.target.id === "signup-form") { e.preventDefault(); accountSubmit(e.target.id === "signup-form"); }
    else if (e.target.id === "pw-form") { e.preventDefault(); setUserPassword(); }
    else if (e.target.id === "login-admin") { e.preventDefault(); adminSignIn(document.getElementById("login-pw").value); }
    else if (e.target.id === "chat-form") { e.preventDefault(); sendChat(document.getElementById("chat-text").value, "text"); }
  });
  root.addEventListener("keydown", e => {
    // Enter sends a chat message on computers; Shift+Enter starts a new line.
    if (e.target.id === "chat-text" && e.key === "Enter" && !e.shiftKey && !e.isComposing && !phoneMQ.matches) {
      e.preventDefault(); sendChat(e.target.value, "text");
    }
  });
  root.addEventListener("change", e => {
    if (e.target.id === "admin-course") { ADMIN.filter = e.target.value; renderAdmin(); return; }
    if (e.target.id === "admin-role") { ADMIN.role = e.target.value; ADMIN.student = null; renderAdmin(); return; }
    if (e.target.name !== "f-type") return;
    const type = (app.querySelector('input[name="f-type"]:checked') || {}).value || "mc";
    app.querySelectorAll(".mc-only").forEach(el => { el.hidden = type !== "mc"; });
    app.querySelectorAll(".tf-only").forEach(el => { el.hidden = type !== "tf"; });
    app.querySelectorAll(".wr-only").forEach(el => { el.hidden = type !== "wr"; });
  });
  root.addEventListener("input", e => {
    if (e.target.id === "q-search") { filterText = e.target.value; updateList(); }
    else if (e.target.id === "chat-text") CHAT.draft = e.target.value;
    else if (e.target.id === "acc-name") {
      // Point out numbers as soon as they are typed.
      const m = document.getElementById("login-msg");
      const bad = /\d/.test(e.target.value);
      if (m && (bad || m.textContent === "Usernames can't contain numbers.")) { m.className = "form-msg" + (bad ? " is-error" : ""); m.textContent = bad ? "Usernames can't contain numbers." : ""; }
    }
    else if (e.target.id === "w-note" && W) { W.notes[W.order[W.idx]] = e.target.value; saveProgress(); }
  });
  document.addEventListener("keydown", onKey);
  if (phoneMQ.addEventListener) phoneMQ.addEventListener("change", renderSavebar);
  window.addEventListener("resize", setDockVar);
  if (window.ResizeObserver) new ResizeObserver(setDockVar).observe(document.getElementById("dock"));

  app.innerHTML = `<p class="muted">Loading the questions…</p>`;
  try {
    BASE = await loadCourses();
  } catch (err) {
    app.innerHTML = `<article class="card"><div class="q-head"><h2>Couldn't load the questions.</h2><p class="muted">Check your internet connection, then reload the page.</p></div></article>`;
    return;
  }
  SHARED = BASE;

  setRemote(lsJSON(REMOTE_KEY));
  if (!usingLocal) DATA = SHARED;
  loadUserData();
  OPS = canEdit() ? cleanOps(lsJSON(DRAFT_KEY)) : [];
  saveDraft();

  const saved = lsJSON(ROUTE_KEY);
  if (isObj(saved)) route = { course: str(saved.course) || null, chapter: str(saved.chapter) || null, view: saved.view === "manage" && canEdit() ? "manage" : "quiz", tab: saved.tab === "chat" ? "chat" : "chapters" };
  let hash = "";
  try { hash = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
  if (hash) {
    if (chapterRef(hash)) { route.chapter = hash; route.view = "quiz"; }
    else if (findCourse(DATA, hash)) { route.course = hash; route.chapter = null; }
    else if (hash !== "admin") pendingHash = hash;
  }
  if (route.chapter && !chapterRef(route.chapter)) route.chapter = null;
  if (route.chapter) route.course = chapterRef(route.chapter).course.id;
  if (!findCourse(effective(), route.course)) route.course = (effective().courses[0] || {}).id || null;
  if (route.chapter && route.view === "quiz" && !findChapter(DATA, route.chapter)) route.view = "manage";
  bindChapter();
  adminMode = location.hash === "#admin";
  window.addEventListener("hashchange", () => {
    const a = location.hash === "#admin";
    if (a !== adminMode) {
      adminMode = a;
      if (!a && canEdit() && !OPS.length) OPS = cleanOps(lsJSON(DRAFT_KEY));
      if (!a) { loadUserData(); bindChapter(); }
      window.scrollTo(0, 0); renderAll();
    }
  });
  renderAll();
  if (TRACK_URL) refreshContent();
  if (!adminMode) trackVisit();
  verifyAccount();
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { flushTime(); saveProgress(); }
    else if (CHAT.timer) pollChat();
  });
  window.addEventListener("pagehide", () => { flushTime(); saveProgress(); });
}
init();
