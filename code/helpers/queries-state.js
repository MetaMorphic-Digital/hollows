// Zero-import module (intentionally dependency-free): holds the query-handler
// registry Map.
//
// Some ability modules call registerHandler() at module-eval time. Because the
// ability registry is reachable from
// queries.js (queries → reactions → registry → <ability>), a circular import
// can re-enter registerHandler while queries.js is still initialising. Keeping
// HANDLERS here — with no imports of its own — guarantees the Map is fully
// constructed before any such re-entry, avoiding a TDZ crash:
//   "Cannot access 'HANDLERS' before initialization".
// Do NOT add imports to this file.
export const HANDLERS = new Map();
