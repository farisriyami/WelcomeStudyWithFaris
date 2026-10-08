"use strict";
/* Small helpers
 * Browser storage, HTML escaping, numbers and times. */

const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
const lsJSON = k => { try { const r = lsGet(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } };
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const str = v => (typeof v === "string" ? v : "");
const clone = o => JSON.parse(JSON.stringify(o));

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad = n => String(n).padStart(2, "0");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// Time in minutes and seconds, e.g. "4m 05s".
const fmtDur = secs => { secs = Math.max(0, Math.round(Number(secs) || 0)); return Math.floor(secs / 60) + "m " + pad(secs % 60) + "s"; };
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
