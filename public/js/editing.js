"use strict";
/* Editing (admin only)
 * Saving changes, the question bank screen and adding/deleting questions and chapters. */

/* ---------- Saving ---------- */
function applyData(newData, clearOps) {
  DATA = newData;
  OPS = clearOps ? [] : cleanOps(OPS);
  saveDraft();
  pruneStored();
  if (route.chapter && !chapterRef(route.chapter)) { route.chapter = null; route.view = "quiz"; }
  if (!findCourse(effective(), route.course)) route.course = (effective().courses[0] || {}).id || null;
  bindChapter();
  renderAll();
}
async function saveChanges() {
  if (saving || !OPS.length || !canEdit()) return;
  const ops = OPS.slice();
  saving = true; discardArmed = false;
  setBarMsg("Saving your changes for everyone…", false);
  try {
    const d = await adminPost({ action: "saveContent", key: ADMIN.key, ops });
    if (!d || !d.ok) throw new Error((d && d.error) || "error");
    setRemote(REMOTE_OPS.concat(ops));
    saving = false;
    if (usingLocal) { lsDel(LOCAL_DATA_KEY); usingLocal = false; }
    applyData(SHARED, true);
    setBarMsg("Saved. Everyone who opens the site now sees your changes.");
  } catch (err) {
    saving = false;
    if (err && err.message === "wrong password") {
      ADMIN.key = ""; ADMIN.rows = null; ssDel("quizhub-admin-key");
      setBarMsg("Your admin sign-in has ended. Open Admin at the bottom of the home page, sign in, then save again.", false);
    } else if (err && err.message === "too large") setBarMsg("That's too much to save at once. Save a few questions at a time.");
    else setBarMsg("Couldn't save your changes. Check your connection and try again.");
  }
}
function useShared() {
  lsDel(LOCAL_DATA_KEY);
  usingLocal = false;
  applyData(SHARED, false);
  setBarMsg("Switched to the shared questions.");
}

/* ---------- Rendering: manage questions ---------- */
function addFormHTML() {
  const f = chapterRef(route.chapter);
  const topics = topicList(f ? f.chapter.questions : []);
  return `
    <article class="card">
      <div class="q-head">
        <div class="meta"><span class="topic">Add a question</span><span>Appears in the quiz after you save</span></div>
        <h2>New question</h2>
      </div>
      <form id="addform" class="form" novalidate>
        <fieldset class="field">
          <legend class="flabel">Type</legend>
          <div class="pills">
            <label class="pill"><input type="radio" name="f-type" id="f-type-mc" value="mc" checked> Multiple choice</label>
            <label class="pill"><input type="radio" name="f-type" id="f-type-tf" value="tf"> True or false</label>
            <label class="pill"><input type="radio" name="f-type" id="f-type-wr" value="wr"> Written</label>
          </div>
        </fieldset>
        <div class="field">
          <label class="flabel" for="f-topic">Topic</label>
          <input type="text" id="f-topic" list="topic-list" placeholder="e.g. Key concepts" autocomplete="off" value="${esc(lastTopic)}">
          <datalist id="topic-list">${topics.map(t => `<option value="${esc(t)}"></option>`).join("")}</datalist>
        </div>
        <div class="field">
          <label class="flabel" for="f-q">Question</label>
          <textarea id="f-q" rows="2" placeholder="Write the question or the true/false statement"></textarea>
        </div>
        <div class="field mc-only">
          <label class="flabel" for="f-correct">Correct answer</label>
          <input type="text" id="f-correct" autocomplete="off">
        </div>
        <div class="field mc-only">
          <span class="flabel" id="wrong-label">Wrong answers <span class="muted">(at least one, up to three)</span></span>
          <div class="wrong-grid">
            <input type="text" id="f-wrong1" aria-labelledby="wrong-label" placeholder="Wrong answer 1" autocomplete="off">
            <input type="text" id="f-wrong2" aria-labelledby="wrong-label" placeholder="Wrong answer 2 (optional)" autocomplete="off">
            <input type="text" id="f-wrong3" aria-labelledby="wrong-label" placeholder="Wrong answer 3 (optional)" autocomplete="off">
          </div>
        </div>
        <fieldset class="field tf-only" hidden>
          <legend class="flabel">The statement is</legend>
          <div class="pills">
            <label class="pill"><input type="radio" name="f-tf" id="f-tf-true" value="true"> True</label>
            <label class="pill"><input type="radio" name="f-tf" id="f-tf-false" value="false"> False</label>
          </div>
        </fieldset>
        <div class="field wr-only" hidden>
          <label class="flabel" for="f-answer">Model answer</label>
          <textarea id="f-answer" rows="5" placeholder="Write the full answer, including any working"></textarea>
        </div>
        <div class="field">
          <label class="flabel" for="f-def">Definition <span class="muted">(shown after answering)</span></label>
          <textarea id="f-def" rows="3" placeholder="The key definition or formula behind the answer"></textarea>
        </div>
        <div class="field">
          <label class="flabel" for="f-why">Why <span class="muted">(optional)</span></label>
          <textarea id="f-why" rows="2" placeholder="Explain the reasoning or the working"></textarea>
        </div>
        <p class="form-msg" id="form-msg" role="status"></p>
        <div class="actions"><button class="btn primary" type="submit">Add question</button></div>
      </form>
    </article>`;
}
function renderManage() {
  const id = route.chapter;
  const isNew = isNewChapter(id), deleting = isDeletingChapter(id);
  app.innerHTML = `
    ${usingLocal ? localNotice() : ""}
    ${isNew ? `<div class="notice"><p>This chapter isn't saved yet. Add its questions, then save your changes.</p></div>` : ""}
    ${deleting ? `<div class="notice"><p>This chapter will be deleted when you save your changes.</p><button class="btn secondary small" id="undo-del-ch">Keep this chapter</button></div>` : ""}
    ${deleting ? "" : addFormHTML()}
    <article class="card">
      <div class="q-head">
        <div class="meta"><span class="topic">Question bank</span><span id="list-summary"></span></div>
        <div class="list-tools">
          <h2>All questions</h2>
          <input type="search" id="q-search" placeholder="Search questions" aria-label="Search questions" value="${esc(filterText)}">
        </div>
      </div>
      <ol class="qlist" id="qlist"></ol>
    </article>
    ${deleting ? "" : `<div class="danger-zone"><button class="btn danger" id="del-chapter">${delChArmed ? "Click again to delete this chapter" : "Delete this chapter"}</button></div>`}`;
  updateList();
}

function updateList() {
  const list = document.getElementById("qlist");
  if (!list) return;
  const id = route.chapter, deleting = isDeletingChapter(id);
  const savedQs = CH ? CH.questions : [];
  const dels = new Set(OPS.filter(o => o.op === "delQ" && o.ch === id).map(o => o.id));
  const adds = OPS.filter(o => o.op === "addQ" && o.ch === id).map(o => o.q);
  const summary = document.getElementById("list-summary");
  if (summary) summary.textContent = `${savedQs.length} saved${adds.length ? ` · ${adds.length} new` : ""}${dels.size ? ` · ${dels.size} to delete` : ""}`;
  let qn = 0, wn = 0;
  const rows = savedQs.map(q => ({ q, num: q.wr ? "W" + pad(++wn) : "Q" + pad(++qn), state: dels.has(q.id) ? "del" : "" }))
    .concat(adds.map(q => ({ q, num: "", state: "new" })));
  const f = filterText.trim().toLowerCase();
  const shown = f ? rows.filter(r => [r.q.q, topicOf(r.q), correctOf(r.q), r.q.d || ""].join(" ").toLowerCase().includes(f)) : rows;
  if (!rows.length) { list.innerHTML = `<li class="qempty">No questions yet. Add one above.</li>`; return; }
  if (!shown.length) { list.innerHTML = `<li class="qempty">No questions match "${esc(filterText.trim())}".</li>`; return; }
  list.innerHTML = shown.map(r => {
    const q = r.q, qid = esc(q.id);
    const badge = r.state === "new" ? `<span class="badge new">New</span>` : r.state === "del" ? `<span class="badge del">Will be deleted</span>` : "";
    const label = r.num || "Not saved";
    const btn = deleting ? ""
      : r.state === "new" ? `<button class="btn small ghost" data-remove="${qid}">Remove</button>`
      : r.state === "del" ? `<button class="btn small ghost" data-undo="${qid}">Undo</button>`
      : `<button class="btn small danger" data-del="${qid}" aria-label="Delete question ${r.num}">Delete</button>`;
    return `<li class="qrow${r.state ? " is-" + r.state : ""}">
      <div class="qrow-main">
        <div class="meta"><span>${label} · ${esc(topicOf(q))} · ${q.wr ? "Written" : q.tf ? "True or false" : "Multiple choice"}</span>${badge}</div>
        <p class="qrow-q">${esc(q.q)}</p>
        ${q.wr ? `<p class="qrow-d">${esc(q.a)}</p>` : `<p class="qrow-a">Answer: <b>${esc(correctOf(q))}</b></p>
        ${q.d ? `<p class="qrow-d">${esc(q.d)}</p>` : ""}`}
      </div>
      ${btn}
    </li>`;
  }).join("");
}

/* ---------- Editing actions ---------- */
function afterDraftChange(focusSel) {
  discardArmed = false;
  saveDraft();
  updateList();
  renderSavebar();
  if (focusSel) { const el = app.querySelector(focusSel); if (el) el.focus(); }
}
const newId = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function onAdd() {
  if (!canEdit()) return;
  const v = id => (document.getElementById(id)?.value || "").trim();
  const type = (app.querySelector('input[name="f-type"]:checked') || {}).value || "mc";
  const isTF = type === "tf";
  const topic = v("f-topic") || DEFAULT_TOPIC;
  const text = v("f-q"), def = v("f-def"), why = v("f-why");
  const errors = [];
  let firstBad = null;
  const bad = (fid, msg) => { errors.push(msg); if (!firstBad) firstBad = fid; };
  if (!text) bad("f-q", "Write the question.");
  const id = newId("u-");
  let item;
  if (type === "wr") {
    const ans = v("f-answer");
    if (!ans) bad("f-answer", "Write the model answer.");
    item = { id, t: topic, wr: true, q: text, a: ans, d: def };
  } else if (isTF) {
    const pick = app.querySelector('input[name="f-tf"]:checked');
    if (!pick) bad("f-tf-true", "Choose whether the statement is true or false.");
    item = { id, t: topic, tf: true, ans: !!pick && pick.value === "true", q: text, d: def };
  } else {
    const c = v("f-correct");
    const wrongs = ["f-wrong1", "f-wrong2", "f-wrong3"].map(v).filter(Boolean);
    if (!c) bad("f-correct", "Add the correct answer.");
    if (!wrongs.length) bad("f-wrong1", "Add at least one wrong answer.");
    const all = [c].concat(wrongs).filter(Boolean).map(s => s.toLowerCase());
    if (new Set(all).size !== all.length) bad("f-wrong1", "Each answer must be different.");
    item = { id, t: topic, q: text, o: [c].concat(wrongs), d: def };
  }
  if (!def) bad("f-def", "Write the definition to show after the answer.");
  if (item && why) item.w = why;
  const msgEl = document.getElementById("form-msg");
  if (errors.length) {
    msgEl.className = "form-msg is-error";
    msgEl.textContent = errors.join(" ");
    document.getElementById(firstBad)?.focus();
    return;
  }
  OPS.push({ op: "addQ", ch: route.chapter, q: item });
  lastTopic = topic === DEFAULT_TOPIC ? "" : topic;
  ["f-q", "f-correct", "f-wrong1", "f-wrong2", "f-wrong3", "f-answer", "f-def", "f-why"].forEach(fid => { const el = document.getElementById(fid); if (el) el.value = ""; });
  app.querySelectorAll('input[name="f-tf"]').forEach(r => { r.checked = false; });
  msgEl.className = "form-msg is-ok";
  msgEl.textContent = "Added to the list below. Save your changes to put it in the quiz.";
  afterDraftChange();
  document.getElementById("f-q").focus();
}

function onAddChapter() {
  if (!canEdit()) return;
  const input = document.getElementById("ch-name"), msg = document.getElementById("ch-msg");
  const name = (input.value || "").trim();
  if (!name) {
    msg.className = "form-msg is-error";
    msg.textContent = "Write the chapter name.";
    input.focus();
    return;
  }
  const course = findCourse(effective(), route.course);
  if (!course) return;
  const id = newId("u-ch-");
  OPS.push({ op: "addCh", course: course.id, ch: { id, label: "Chapter " + (course.chapters.length + 1), name, questions: [] } });
  saveDraft();
  openChapter(id, "manage");
}

function deleteChapter() {
  const id = route.chapter;
  if (isNewChapter(id)) {
    OPS = OPS.filter(o => !((o.op === "addCh" && o.ch.id === id) || (o.op === "addQ" && o.ch === id)));
    saveDraft();
    goHome();
    setBarMsg("Chapter removed.");
  } else {
    OPS = OPS.filter(o => !((o.op === "addQ" || o.op === "delQ") && o.ch === id));
    OPS.push({ op: "delCh", ch: id });
    saveDraft();
    goHome();
  }
}
