"use strict";
/* Quiz and written practice
 * Rounds, progress, results, timers and answering questions. */

const topicOf = q => q.t || DEFAULT_TOPIC;
const topicList = qs => qs.reduce((a, q) => (a.includes(topicOf(q)) ? a : a.concat(topicOf(q))), []);
const correctOf = q => (q.wr ? q.a : q.tf ? (q.ans ? "True" : "False") : q.o[0]);
const correct = id => correctOf(byId.get(id));
const isRight = id => S.answers[id] === correct(id);
const quizQs = ch => (ch ? ch.questions.filter(q => !q.wr) : []);
const writtenQs = ch => (ch ? ch.questions.filter(q => q.wr) : []);
const numOf = id => quizQs(CH).findIndex(q => q.id === id) + 1;
const wNumOf = id => writtenQs(CH).findIndex(q => q.id === id) + 1;
const allIds = () => quizQs(CH).map(q => q.id);
const allWIds = () => writtenQs(CH).map(q => q.id);
const makeOpts = q => (q.tf ? ["True", "False"] : shuffle(q.o));

/* ---------- Quiz rounds ---------- */
function makeRound(ids, label, shuffleOrder) {
  const order = shuffleOrder ? shuffle(ids) : ids.slice();
  const opts = {};
  order.forEach(id => { opts[id] = makeOpts(byId.get(id)); });
  return { order, idx: 0, answers: {}, opts, phase: "quiz", label };
}
function newRound(ids, label, o = {}) {
  S = ids.length ? makeRound(ids, label, o.shuffle) : null;
  restartArmed = false;
  renderAll();
  if (o.focus) { scrollToApp(); focusQuestion(); }
}
// Keep saved progress in step with the chapter's current questions.
function reconcileRound() {
  if (!S || !Array.isArray(S.order) || !isObj(S.answers) || !isObj(S.opts)) { S = null; return; }
  const curId = S.order[S.idx];
  S.order = S.order.filter(id => typeof id === "string" && byId.has(id));
  if (!S.order.length) { S = null; return; }
  S.order.forEach(id => {
    const q = byId.get(id), o = S.opts[id];
    if (!Array.isArray(o) || !o.includes(correctOf(q)) || o.length !== (q.tf ? 2 : q.o.length)) {
      S.opts[id] = makeOpts(q); delete S.answers[id];
    }
  });
  let i = S.order.indexOf(curId);
  if (i < 0) i = S.order.findIndex(id => S.answers[id] === undefined);
  if (i < 0) { S.phase = "results"; i = S.order.length - 1; }
  else if (S.phase === "results" && S.order.some(id => S.answers[id] === undefined)) S.phase = "quiz";
  if (S.phase !== "quiz" && S.phase !== "results") S.phase = "quiz";
  S.idx = i;
  if (typeof S.label !== "string") S.label = "Full quiz";
}
function bindChapter() {
  const f = route.chapter ? findChapter(DATA, route.chapter) : null;
  CH = f ? f.chapter : null;
  byId = new Map((CH ? CH.questions : []).map(q => [q.id, q]));
  S = CH && isObj(PROG[CH.id]) ? PROG[CH.id] : null;
  W = CH && isObj(WPROG[CH.id]) ? WPROG[CH.id] : null;
  if (!CH) return;
  reconcileRound();
  if (!S && allIds().length) S = makeRound(allIds(), "Full quiz", false);
  reconcileWritten();
}
const newWritten = ids => ({ order: ids.slice(), idx: 0, marks: {}, shown: {}, notes: {}, phase: "write" });
// Keep saved written practice in step with the chapter's current written questions.
function reconcileWritten() {
  const ids = allWIds();
  if (!ids.length) { W = null; return; }
  if (!W || !Array.isArray(W.order) || !isObj(W.marks) || !isObj(W.notes) || !isObj(W.shown)) W = null;
  if (W) {
    const cur = W.order[W.idx];
    W.order = W.order.filter(id => ids.includes(id));
    if (!W.order.length) W = null;
    else {
      let i = W.order.indexOf(cur);
      if (i < 0) i = W.order.findIndex(id => W.marks[id] === undefined);
      if (i < 0) { W.phase = "results"; i = W.order.length - 1; }
      else if (W.phase === "results" && W.order.some(id => W.marks[id] === undefined)) W.phase = "write";
      if (W.phase !== "write" && W.phase !== "results") W.phase = "write";
      W.idx = i;
    }
  }
  if (!W) W = newWritten(ids);
}
function saveProgress() {
  if (CH) {
    if (S) PROG[CH.id] = S; else delete PROG[CH.id];
    if (W) WPROG[CH.id] = W; else delete WPROG[CH.id];
  }
  userSet(PROGRESS_KEY, JSON.stringify(PROG));
  userSet(WRITTEN_KEY, JSON.stringify(WPROG));
}
function pruneStored() {
  Object.keys(PROG).forEach(id => { if (!findChapter(DATA, id)) delete PROG[id]; });
  Object.keys(RESULTS).forEach(id => { if (!findChapter(DATA, id)) delete RESULTS[id]; });
  Object.keys(WPROG).forEach(id => { if (!findChapter(DATA, id)) delete WPROG[id]; });
  userSet(WRITTEN_KEY, JSON.stringify(WPROG));
  userSet(PROGRESS_KEY, JSON.stringify(PROG));
  userSet(RESULTS_KEY, JSON.stringify(RESULTS));
}
// Remember the score of a finished full-length round for the chapter card.
function recordResult() {
  if (!CH || !S || S.phase !== "results" || S.order.length !== allIds().length) return;
  const got = S.order.filter(isRight).length;
  RESULTS[CH.id] = { pct: Math.round(got / S.order.length * 100), got, n: S.order.length, at: Date.now(), secs: Math.round((S.ms || 0) / 1000) };
  userSet(RESULTS_KEY, JSON.stringify(RESULTS));
}

/* ---------- Rendering: chapter quiz ---------- */
function ticksHTML() {
  return `<div class="ticks" style="grid-template-columns:repeat(${S.order.length},1fr)" aria-hidden="true">` +
    S.order.map((id, k) => {
      let c = "";
      if (S.answers[id] !== undefined) c = isRight(id) ? "good" : "bad";
      else if (S.phase === "quiz" && k === S.idx) c = "now";
      return `<span class="${c}"></span>`;
    }).join("") + `</div>`;
}

function renderQuiz() {
  const n = S.order.length;
  const id = S.order[S.idx], q = byId.get(id);
  const picked = S.answers[id], done = picked !== undefined, right = correct(id);
  const answered = S.order.filter(i => S.answers[i] !== undefined);
  const got = answered.filter(isRight).length;
  const pct = answered.length ? Math.round(got / answered.length * 100) : 0;
  const last = S.idx === n - 1;

  const opts = S.opts[id].map((o, k) => {
    let cls = "opt", tag = "";
    if (done) {
      if (o === right) { cls += " is-right"; tag = o === picked ? "Your answer" : "Correct answer"; }
      else if (o === picked) { cls += " is-wrong"; tag = "Your answer"; }
      else cls += " is-dim";
    }
    return `<button class="${cls}" data-k="${k}" ${done ? "disabled" : ""}><span class="key">${LETTERS[k]}</span><span class="txt">${esc(o)}${tag ? `<span class="tag">${tag}</span>` : ""}</span></button>`;
  }).join("");

  const ok = done && picked === right;
  const feedback = !done ? "" : `
    <div class="tear"></div>
    <div class="feedback ${ok ? "ok" : "no"}" role="status">
      <p class="verdict"><span class="dot"></span>${ok ? "Correct" : "Not quite"}</p>
      ${ok ? "" : `<p class="answer-line">The correct answer is <strong>${esc(right)}</strong>.</p>`}
      <div class="def"><span class="label">Definition</span><p>${esc(q.d || "No definition was added for this question.")}</p></div>
      ${q.w ? `<div class="why"><span class="label">Why</span><p>${esc(q.w)}</p></div>` : ""}
      <div class="actions">
        <button class="btn primary" id="next">${last ? "See my score" : "Next question"}</button>
        <span class="hint">or press <kbd>Enter</kbd></span>
      </div>
    </div>`;

  app.innerHTML = `
    <div class="status">
      ${ticksHTML()}
      <div class="status-row">
        <span>Question <b>${S.idx + 1}</b> of ${n} · <span class="timer" id="q-timer" title="Time on this quiz">${fmtDur((S.ms || 0) / 1000)}</span></span>
        <span class="status-right">
          <span>Score <b>${got}</b> / ${answered.length}${answered.length ? ` · <b>${pct}%</b>` : ""}</span>
          ${answered.length ? `<button class="linkbtn" id="restart">${restartArmed ? "Click again to restart" : "Start over"}</button>` : ""}
        </span>
      </div>
    </div>
    <article class="card">
      <div class="q-head">
        <div class="meta"><span class="topic">Q${pad(numOf(id))} · ${esc(topicOf(q))}</span><span>${q.tf ? "True or false" : "Multiple choice"}</span></div>
        <h2 id="qtext" tabindex="-1">${esc(q.q)}</h2>
      </div>
      <div class="options" role="group" aria-labelledby="qtext">${opts}</div>
      ${feedback}
    </article>`;
}

function band(pct) {
  if (pct >= 90) return ["band-good", "Excellent. You know this chapter well."];
  if (pct >= 75) return ["band-good", "Good work. Go over the questions you missed below."];
  if (pct >= 50) return ["band-warn", "Getting there. Read the definitions for the questions you missed, then retry them."];
  return ["band-bad", "Keep studying. Re-read the chapter slides, then try the quiz again."];
}

function renderResults() {
  const n = S.order.length;
  const got = S.order.filter(isRight).length;
  const pct = Math.round(got / n * 100);
  const [bandCls, msg] = band(pct);
  const missed = S.order.filter(id => !isRight(id));

  const topicRows = topicList(quizQs(CH)).map(t => {
    const qs = S.order.filter(id => topicOf(byId.get(id)) === t);
    if (!qs.length) return "";
    const r = qs.filter(isRight).length, p = r / qs.length;
    const c = p >= .75 ? "good" : p >= .5 ? "warn" : "bad";
    return `<li><span>${esc(t)}</span><span class="bar" role="img" aria-label="${r} of ${qs.length} correct"><span class="${c}" style="width:${p * 100}%"></span></span><span class="frac">${r}/${qs.length}</span></li>`;
  }).join("");

  const missList = missed.map(id => `
    <details class="miss">
      <summary><span class="mono">Q${pad(numOf(id))}</span><span>${esc(byId.get(id).q)}</span></summary>
      <div class="body">
        <dl>
          <dt>Your answer</dt><dd class="bad-t">${esc(S.answers[id])}</dd>
          <dt>Correct</dt><dd class="good-t">${esc(correct(id))}</dd>
        </dl>
        <p>${esc(byId.get(id).d || "")}</p>
        ${byId.get(id).w ? `<p>${esc(byId.get(id).w)}</p>` : ""}
      </div>
    </details>`).join("");

  app.innerHTML = `
    <div class="status">
      ${ticksHTML()}
      <div class="status-row"><span>${esc(S.label)} · ${plural(n, "question")}</span><span>Finished</span></div>
    </div>
    <article class="card results">
      <div class="q-head">
        <div class="meta"><span class="topic">Your result</span><span>${got} right · ${n - got} wrong</span></div>
        <div class="score-row">
          <p class="pct ${bandCls}" id="qtext" tabindex="-1">${pct}<small>%</small></p>
          <div class="score-text">
            <p class="score-line">You got <b>${got}</b> of ${n} right in <b>${fmtDur((S.ms || 0) / 1000)}</b>.</p>
            <p class="band-msg">${msg}</p>
          </div>
        </div>
      </div>
      <div class="tear"></div>
      <section class="block">
        <h3>Score by topic</h3>
        <ul class="topics">${topicRows}</ul>
      </section>
      <section class="block">
        <h3>${missed.length ? `Questions you missed (${missed.length})` : "Questions you missed"}</h3>
        ${missed.length ? `<div class="misses">${missList}</div>` : `<p class="perfect">None. You answered every question correctly.</p>`}
      </section>
      <div class="actions">
        <button class="btn primary" id="retake-shuffle">Retake in a new order</button>
        <button class="btn secondary" id="retake">Retake in order</button>
        ${missed.length ? `<button class="btn secondary" id="retry">Retry the ${missed.length} I missed</button>` : ""}
      </div>
    </article>`;
}

function renderQuizView() {
  if (!S) {
    app.innerHTML = `
      <article class="card">
        <div class="q-head">
          <div class="meta"><span class="topic">No questions</span></div>
          <h2>This chapter has no quiz questions yet.</h2>
          ${canEdit() ? `<p class="muted">Add questions under Manage questions, save them, and they will show up here.</p>
          <div class="actions"><button class="btn primary" data-view="manage">Add a question</button></div>` : `<p class="muted">Questions for this chapter are coming soon.</p>`}
        </div>
      </article>`;
    return;
  }
  if (S.phase === "results") renderResults(); else renderQuiz();
}

/* ---------- Rendering: written practice ---------- */
function wTicks() {
  return `<div class="ticks" style="grid-template-columns:repeat(${W.order.length},1fr)" aria-hidden="true">` +
    W.order.map((id, k) => {
      const m = W.marks[id];
      const c = m === true ? "good" : m === false ? "bad" : (W.phase === "write" && k === W.idx ? "now" : "");
      return `<span class="${c}"></span>`;
    }).join("") + `</div>`;
}
function renderWritten() {
  if (!W) {
    app.innerHTML = `
      <article class="card">
        <div class="q-head">
          <div class="meta"><span class="topic">No written questions</span></div>
          <h2>This chapter has no written questions yet.</h2>
          <p class="muted">Add one under Manage and choose the Written type.</p>
        </div>
      </article>`;
    return;
  }
  if (W.phase === "results") { renderWrittenResults(); return; }
  const n = W.order.length, id = W.order[W.idx], q = byId.get(id);
  const shown = !!W.shown[id], mark = W.marks[id];
  const marked = W.order.filter(i => W.marks[i] !== undefined);
  const got = marked.filter(i => W.marks[i] === true).length;
  const last = W.idx === n - 1;
  app.innerHTML = `
    <div class="status">
      ${wTicks()}
      <div class="status-row">
        <span>Written question <b>${W.idx + 1}</b> of ${n} · <span class="timer" id="w-timer" title="Time on written practice">${fmtDur((W.ms || 0) / 1000)}</span></span>
        <span>Self-score <b>${got}</b> / ${marked.length}${marked.length ? ` · <b>${Math.round(got / marked.length * 100)}%</b>` : ""}</span>
      </div>
    </div>
    <article class="card">
      <div class="q-head">
        <div class="meta"><span class="topic">W${pad(wNumOf(id))} · ${esc(topicOf(q))}</span><span>Written answer</span></div>
        <h2 id="qtext" tabindex="-1">${esc(q.q)}</h2>
      </div>
      <div class="note-field">
        <label class="flabel" for="w-note">Your answer</label>
        <textarea id="w-note" rows="5" placeholder="Write your answer here, then compare it with the model answer">${esc(W.notes[id] || "")}</textarea>
        ${shown ? "" : `<div class="w-actions"><button class="btn primary" id="w-show">Show model answer</button></div>`}
      </div>
      ${!shown ? "" : `
      <div class="tear"></div>
      <div class="feedback" role="status">
        <div class="model"><span class="label">Model answer</span><p>${esc(q.a)}</p></div>
        ${q.d ? `<div class="def"><span class="label">Definition</span><p>${esc(q.d)}</p></div>` : ""}
        ${q.w ? `<div class="why"><span class="label">Why</span><p>${esc(q.w)}</p></div>` : ""}
        <p class="flabel" id="mark-label">How did your answer compare?</p>
        <div class="selfmark" role="group" aria-labelledby="mark-label">
          <button class="btn good${mark === true ? " is-on" : ""}" id="w-got" aria-pressed="${mark === true}">I got it right</button>
          <button class="btn bad${mark === false ? " is-on" : ""}" id="w-miss" aria-pressed="${mark === false}">I need to review it</button>
        </div>
        ${mark === undefined ? "" : `<div class="w-actions"><button class="btn primary" id="w-next">${last ? "See my written score" : "Next written question"}</button></div>`}
      </div>`}
    </article>`;
}
function renderWrittenResults() {
  const n = W.order.length, got = W.order.filter(id => W.marks[id] === true).length;
  const pct = Math.round(got / n * 100);
  const [bandCls, msg] = band(pct);
  const review = W.order.filter(id => W.marks[id] !== true);
  const reviewList = review.map(id => {
    const q = byId.get(id);
    return `
      <details class="miss">
        <summary><span class="mono">W${pad(wNumOf(id))}</span><span>${esc(q.q)}</span></summary>
        <div class="body">
          ${W.notes[id] ? `<dl><dt>Your answer</dt><dd class="note-dd">${esc(W.notes[id])}</dd></dl>` : ""}
          <div class="model"><span class="label">Model answer</span><p>${esc(q.a)}</p></div>
          ${q.w ? `<p>${esc(q.w)}</p>` : ""}
        </div>
      </details>`;
  }).join("");
  app.innerHTML = `
    <div class="status">
      ${wTicks()}
      <div class="status-row"><span>Written practice · ${plural(n, "question")}</span><span>Finished</span></div>
    </div>
    <article class="card results">
      <div class="q-head">
        <div class="meta"><span class="topic">Your written self-score</span><span>${got} right · ${n - got} to review</span></div>
        <div class="score-row">
          <p class="pct ${bandCls}" id="qtext" tabindex="-1">${pct}<small>%</small></p>
          <div class="score-text">
            <p class="score-line">You marked <b>${got}</b> of ${n} answers as right, in <b>${fmtDur((W.ms || 0) / 1000)}</b>.</p>
            <p class="band-msg">${msg}</p>
          </div>
        </div>
      </div>
      <div class="tear"></div>
      <section class="block">
        <h3>${review.length ? `Answers to review (${review.length})` : "Answers to review"}</h3>
        ${review.length ? `<div class="misses">${reviewList}</div>` : `<p class="perfect">None. You marked every answer as right.</p>`}
      </section>
      <div class="actions">
        <button class="btn primary" id="w-again">Practise all again</button>
        ${review.length ? `<button class="btn secondary" id="w-review">Practise the ${review.length} to review</button>` : ""}
      </div>
    </article>`;
}

function renderUnsavedQuiz() {
  app.innerHTML = `
    <article class="card">
      <div class="q-head">
        <div class="meta"><span class="topic">Not saved yet</span></div>
        <h2>Save this chapter to take its quiz.</h2>
        <p class="muted">Add its questions under Manage questions, then tap Save changes at the bottom of the screen.</p>
        <div class="actions"><button class="btn primary" data-view="manage">Manage questions</button></div>
      </div>
    </article>`;
}

/* ---------- Quiz actions ---------- */
function choose(k) {
  if (!S || S.phase !== "quiz") return;
  const id = S.order[S.idx];
  if (S.answers[id] !== undefined) return;
  S.answers[id] = S.opts[id][k];
  track("answer", Object.assign(chapterInfo(), { qid: id, correct: S.answers[id] === correct(id), secs: Math.round((S.qms || 0) / 1000) }));
  S.qms = 0;
  restartArmed = false;
  renderQuizView(); renderSavebar(); saveProgress();
  revealFeedback();
  const nb = ["next-m", "next"].map(i => document.getElementById(i)).find(b => b && b.getClientRects().length);
  if (nb) nb.focus({ preventScroll: true });
}
// Scroll just enough to show the definition (and the Next button on desktop),
// without pushing the question itself off the top of the screen.
function revealFeedback() {
  const fb = app.querySelector(".feedback"), head = app.querySelector(".q-head");
  if (!fb || !head) return;
  const dockH = parseFloat(document.body.style.getPropertyValue("--dock-h")) || 0;
  const target = phoneMQ.matches ? (fb.querySelector(".def") || fb) : fb;
  const want = target.getBoundingClientRect().bottom + window.scrollY - (window.innerHeight - dockH - 12);
  const cap = head.getBoundingClientRect().top + window.scrollY - 8;
  const top = Math.min(want, cap);
  if (top > window.scrollY) window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
}
function next() {
  if (!S || S.phase !== "quiz") return;
  if (S.idx < S.order.length - 1) S.idx++;
  else {
    S.phase = "results"; recordResult();
    const got = S.order.filter(isRight).length;
    track("quiz_finish", Object.assign(chapterInfo(), { got, total: S.order.length, pct: Math.round(got / S.order.length * 100), round: S.label, secs: Math.round((S.ms || 0) / 1000) }));
  }
  restartArmed = false;
  renderQuizView(); renderSavebar(); saveProgress();
  scrollToApp();
  focusQuestion();
}
