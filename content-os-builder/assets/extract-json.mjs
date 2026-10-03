// extract-json.mjs — the ONE tolerant JSON reader for agent output (radar run files, editor verdicts).
//
// COPY TO: engine/app/src/lib/extract-json.mjs (unchanged). radar-contract.mjs re-exports it
// (`export { extractJson } from "./extract-json.mjs";`) so the verifier and the ingest parse with the
// SAME function. Measured: a run file the scout wrapped in a ```json fence made the verifier refuse it
// while a second, looser parser in the ingest still read every idea, unchecked.
//
// Order: a ``` fence first (```json or a bare ```), then the first balanced {...} in the text, string-
// and escape-aware. Returns the parsed value, or null. Never throws.

export function extractJson(text) {
  if (!text) return null;
  const s = String(text);
  const candidates = [];
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  const start = s.indexOf("{");
  if (start !== -1) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { candidates.push(s.slice(start, i + 1)); break; } }
    }
  }
  for (const c of candidates) {
    try { return JSON.parse(c); } catch { /* try the next candidate */ }
  }
  return null;
}
