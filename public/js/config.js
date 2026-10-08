"use strict";
/* Settings
 * Storage keys, screen checks and the server address. */

const DEFAULT_TOPIC = "My questions";
const LETTERS = ["A", "B", "C", "D"];
const PROGRESS_KEY = "quizhub-progress-v1";
const RESULTS_KEY = "quizhub-results-v1";
const ROUTE_KEY = "quizhub-route-v1";
const DRAFT_KEY = "quizhub-draft-v1";
const LOCAL_DATA_KEY = "quizhub-local-data-v1";
const WRITTEN_KEY = "quizhub-written-v1";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const phoneMQ = window.matchMedia("(max-width: 600px)");
// The Google Apps Script web app that stores accounts, chats, scores and shared edits.
const TRACK_URL = "https://script.google.com/macros/s/AKfycbzMBSOn-ZsLvhNwdPRyb1XV_xB_Abj7RBkh_681fWaHqfXapPv-87Ugnle9r4APBsxSfw/exec";
