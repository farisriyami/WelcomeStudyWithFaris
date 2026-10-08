"use strict";
/* Courses and questions
 * Loads data/*.json, keeps the shared state, applies the admin's saved edits. */

function validQuestion(q) {
  if (!isObj(q) || typeof q.id !== "string" || typeof q.q !== "string" || !q.q.trim()) return false;
  if (q.wr) return typeof q.a === "string" && !!q.a.trim();
  if (q.tf) return typeof q.ans === "boolean";
  return Array.isArray(q.o) && q.o.length >= 2 && q.o.length <= 4 && q.o.every(s => typeof s === "string" && s);
}
function parseData(raw) {
  const courses = (isObj(raw) && Array.isArray(raw.courses) ? raw.courses : [])
    .filter(c => isObj(c) && typeof c.id === "string" && typeof c.name === "string")
    .map(c => ({
      id: c.id, name: c.name, sub: str(c.sub),
      chapters: (Array.isArray(c.chapters) ? c.chapters : [])
        .filter(ch => isObj(ch) && typeof ch.id === "string" && typeof ch.name === "string")
        .map(ch => ({
          id: ch.id, label: str(ch.label), name: ch.name,
          questions: (Array.isArray(ch.questions) ? ch.questions : []).filter(validQuestion)
        }))
    }));
  return { courses };
}

// The question banks live in data/: courses.json lists the courses in the order shown on the site,
// and each chapter has its own file, e.g. data/finance/chapter-3.json.
async function loadCourses() {
  const get = file => fetch("data/" + file, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(file + " " + r.status); return r.json(); });
  const index = await get("courses.json");
  const courses = await Promise.all((Array.isArray(index.courses) ? index.courses : []).map(async c =>
    Object.assign({}, c, { chapters: await Promise.all((Array.isArray(c.chapters) ? c.chapters : []).map(get)) })));
  return parseData({ courses });
}

let BASE = { courses: [] };   // questions from data/*.json
const REMOTE_KEY = "quizhub-remote-ops-v1";
let REMOTE_OPS = [];          // chapters and questions the owner added or deleted on the site
let SHARED = BASE;            // BASE with REMOTE_OPS applied: what every visitor sees
let pendingHash = "";
const localSaved = lsJSON(LOCAL_DATA_KEY);
let usingLocal = isObj(localSaved) && isObj(localSaved.data) && Array.isArray(localSaved.data.courses);
let DATA = usingLocal ? parseData(localSaved.data) : SHARED;

let OPS = [];       // unsaved changes: addQ, delQ, addCh, delCh
let PROG = {};      // quiz progress per chapter id
let RESULTS = {};   // last full-quiz score per chapter id
let route = { course: null, chapter: null, view: "quiz", tab: "chapters" };
let CH = null;      // the saved chapter being viewed
let byId = new Map();
let S = null;       // quiz progress for CH
let W = null;       // written practice progress for CH
let WPROG = {};     // written practice progress per chapter id
let saving = false;
let barMsg = "", barTimer = null;
let restartArmed = false, discardArmed = false, delChArmed = false;
let filterText = "", lastTopic = "";
let root, topEl, app;

/* ---------- Courses, chapters and unsaved changes ---------- */
const findCourse = (data, id) => data.courses.find(c => c.id === id) || null;
function findChapter(data, id) {
  for (const c of data.courses) { const ch = c.chapters.find(x => x.id === id); if (ch) return { course: c, chapter: ch }; }
  return null;
}
const hasQuestion = (data, qid) => data.courses.some(c => c.chapters.some(ch => ch.questions.some(q => q.id === qid)));
function applyOp(d, o) {
  if (o.op === "addCh") { const c = findCourse(d, o.course); if (c && !findChapter(d, o.ch.id)) c.chapters.push(clone(o.ch)); }
  else if (o.op === "delCh") d.courses.forEach(c => { c.chapters = c.chapters.filter(ch => ch.id !== o.ch); });
  else if (o.op === "addQ") { const f = findChapter(d, o.ch); if (f && !f.chapter.questions.some(q => q.id === o.q.id)) f.chapter.questions.push(clone(o.q)); }
  else if (o.op === "delQ") { const f = findChapter(d, o.ch); if (f) f.chapter.questions = f.chapter.questions.filter(q => q.id !== o.id); }
}
function applyOps(data, ops) {
  const d = clone(data);
  ops.forEach(o => applyOp(d, o));
  return d;
}
const effective = () => applyOps(DATA, OPS);
const chapterRef = id => findChapter(effective(), id) || findChapter(DATA, id);
const isNewChapter = id => OPS.some(o => o.op === "addCh" && o.ch.id === id);
const isDeletingChapter = id => OPS.some(o => o.op === "delCh" && o.ch === id);
// Drop draft changes that no longer apply (already saved, or their target is gone).
function cleanOps(raw) {
  const out = [];
  (Array.isArray(raw) ? raw : []).forEach(o => {
    if (!isObj(o)) return;
    if (o.op === "addCh") {
      if (isObj(o.ch) && typeof o.ch.id === "string" && typeof o.ch.name === "string" && findCourse(DATA, o.course) && !findChapter(DATA, o.ch.id))
        out.push({ op: "addCh", course: o.course, ch: { id: o.ch.id, label: str(o.ch.label), name: o.ch.name, questions: [] } });
    } else if (o.op === "delCh") {
      if (findChapter(DATA, o.ch)) out.push({ op: "delCh", ch: o.ch });
    } else if (o.op === "addQ") {
      const target = findChapter(DATA, o.ch) || out.some(x => x.op === "addCh" && x.ch.id === o.ch);
      if (validQuestion(o.q) && !hasQuestion(DATA, o.q.id) && target) out.push({ op: "addQ", ch: o.ch, q: o.q });
    } else if (o.op === "delQ") {
      const f = findChapter(DATA, o.ch);
      if (f && f.chapter.questions.some(q => q.id === o.id)) out.push({ op: "delQ", ch: o.ch, id: o.id });
    }
  });
  return out;
}
// Keep only well-formed shared edits that still fit the built-in questions, in order.
function cleanRemote(raw) {
  const d = clone(BASE), out = [];
  (Array.isArray(raw) ? raw : []).forEach(o => {
    if (!isObj(o)) return;
    let op = null;
    if (o.op === "addCh" && isObj(o.ch) && typeof o.ch.id === "string" && typeof o.ch.name === "string" && findCourse(d, o.course) && !findChapter(d, o.ch.id))
      op = { op: "addCh", course: o.course, ch: { id: o.ch.id, label: str(o.ch.label), name: o.ch.name, questions: [] } };
    else if (o.op === "delCh" && findChapter(d, o.ch)) op = { op: "delCh", ch: o.ch };
    else if (o.op === "addQ" && validQuestion(o.q) && findChapter(d, o.ch) && !hasQuestion(d, o.q.id)) op = { op: "addQ", ch: o.ch, q: o.q };
    else if (o.op === "delQ" && typeof o.id === "string" && findChapter(d, o.ch)) op = { op: "delQ", ch: o.ch, id: o.id };
    if (op) { out.push(op); applyOp(d, op); }
  });
  return { ops: out, data: d };
}
function setRemote(ops) {
  const r = cleanRemote(ops);
  REMOTE_OPS = r.ops;
  SHARED = r.data;
  if (REMOTE_OPS.length) lsSet(REMOTE_KEY, JSON.stringify(REMOTE_OPS)); else lsDel(REMOTE_KEY);
}
// Load the owner's latest saved edits so every visitor sees the same chapters and questions.
async function refreshContent() {
  let d;
  try { d = await adminPost({ action: "content" }); } catch (e) { return; }
  if (!d || !d.ok || !Array.isArray(d.ops)) return;
  const before = JSON.stringify(REMOTE_OPS);
  setRemote(d.ops);
  if (JSON.stringify(REMOTE_OPS) !== before && !usingLocal && !saving) applyData(SHARED, false);
  if (pendingHash && !route.chapter && !adminMode && chapterRef(pendingHash)) openChapter(pendingHash);
  pendingHash = "";
}
// Only the site owner, signed in on the Admin page in this tab, can add or delete chapters and questions.
const canEdit = () => !!(TRACK_URL && ADMIN.key);
const saveDraft = () => { if (canEdit()) (OPS.length ? lsSet(DRAFT_KEY, JSON.stringify(OPS)) : lsDel(DRAFT_KEY)); };
