"use strict";
/* Tracking
 * Activity events and study time sent to the Google Sheet. */

/* ---------- Student tracking ---------- */
const ssGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };
const ssDel = k => { try { sessionStorage.removeItem(k); } catch (e) {} };
let VID = lsGet("quizhub-visitor-id");
if (!VID) { VID = "v-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); lsSet("quizhub-visitor-id", VID); }
let adminMode = false;

function chapterInfo() {
  const f = route.chapter ? chapterRef(route.chapter) : null;
  return f ? { course: f.course.name, chapterId: f.chapter.id, chapter: (f.chapter.label ? f.chapter.label + ": " : "") + f.chapter.name } : {};
}
// Send one activity event to the tracking sheet. Fire-and-forget: the quiz never waits for it.
// The admin's own activity is not tracked.
function track(type, extra) {
  if (!TRACK_URL || !IDENT || isAdmin()) return;
  const ev = Object.assign({ action: "log", token: IDENT.token, vid: VID, type, device: phoneMQ.matches ? "phone" : "computer" }, extra || {});
  try {
    fetch(TRACK_URL, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(ev) }).catch(() => {});
  } catch (e) {}
}
function trackVisit() {
  if (!IDENT || isAdmin() || ssGet("quizhub-visit")) return;
  ssSet("quizhub-visit", "1");
  track("visit");
}

/* ---------- Study time: counts while the page is open and in use ---------- */
const IDLE_MS = 5 * 60 * 1000;   // stop counting after 5 minutes without a tap, click, key or scroll
let lastInput = Date.now(), unsentMs = 0;
["pointerdown", "keydown", "scroll", "touchstart", "input"].forEach(t => window.addEventListener(t, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
function tick() {
  if (document.visibilityState !== "visible" || Date.now() - lastInput > IDLE_MS || adminMode || !me() || isAdmin()) return;
  unsentMs += 1000;
  if (route.chapter && CH) {
    if (route.view === "quiz" && S && S.phase === "quiz") {
      S.ms = (S.ms || 0) + 1000;
      if (S.answers[S.order[S.idx]] === undefined) S.qms = (S.qms || 0) + 1000;
      const el = document.getElementById("q-timer");
      if (el) el.textContent = fmtDur(S.ms / 1000);
    } else if (route.view === "written" && W && W.phase === "write") {
      W.ms = (W.ms || 0) + 1000;
      const el = document.getElementById("w-timer");
      if (el) el.textContent = fmtDur(W.ms / 1000);
    }
  }
  if (unsentMs >= IDLE_MS) flushTime();
}
// Report study time in chunks: when the page is hidden or closed, and every 5 minutes.
function flushTime() {
  if (unsentMs < 1000) return;
  track("time", { secs: Math.round(unsentMs / 1000) });
  unsentMs = 0;
}
