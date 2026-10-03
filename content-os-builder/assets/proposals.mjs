// proposals.mjs — the publish-proposal store: what the chat agent PROPOSED, kept where it cannot reach.
//
// COPY TO: engine/app/src/lib/proposals.mjs (unchanged; translate MESSAGES, marked EDIT:).
// Reference 10 §5 explains the flow.
//
// The chat agent may only PROPOSE a publish / schedule / unschedule; the owner clicks «confirm». Before
// this store the proposal travelled INSIDE the chat message (a payload after a ◆ line), and the UI drew a
// button for any message of that shape, so the model's own reply, or a line written into
// content/chats.json, rendered a working «confirm» with an agent-chosen caption, channel and time. Now:
//
//   • the ROUTE (the chat route's action runner) validates the request against the scheduler itself and
//     writes the proposal HERE, engine/app/.data/proposals.json, outside every tenant folder, so no agent
//     (confined to its tenant by Read/Edit(../**)) can read, write or mint one;
//   • the chat message carries only ‹proposal:<uuid>›, and the proposal is bound to THAT message's id
//     once the route has persisted it: a copy of the token anywhere else resolves to nothing;
//   • the UI draws the confirm card only from GET /publish?proposal=<id>&message=<id>, showing the
//     server's record (channel, time, the full caption), never text from the message;
//   • POST / DELETE /publish take { proposal_id, message_id, confirm: true } and re-validate everything;
//   • tenant-bound, 24 h TTL, single use. A failed send releases the claim so the owner can retry the
//     same card; a success settles it for good.
//
// Plain ESM, zero deps. Reads NEVER throw: an unreadable store reads as empty, which fails CLOSED (no
// proposal → no button). Same mutex + atomic-write pattern as ideas-core.mjs.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

export const PROPOSAL_TTL_MS = 24 * 3600 * 1000;
/** Settled and expired records stay this long so an old card can still say what happened. */
const KEEP_MS = 7 * 24 * 3600 * 1000;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const OPS = ["publish", "unschedule"];

/** EDIT: the owner-language sentences a refused claim returns (shown on the card as-is). */
export const MESSAGES = {
  notFound: "there is no proposal with this id",
  wrongOp: "this proposal is not of that kind",
  expired: "this proposal expired (24 hours); ask for it again",
  used: "this proposal was already carried out",
  claimed: "this proposal is being carried out right now",
  unavailable: "this proposal is not available",
  failed: "failed",
};


/** engine/app/.data/proposals.json: the app runs from engine/app (the same convention as REPO_ROOT). */
export function storePath() {
  return join(process.cwd(), ".data", "proposals.json");
}

function readStore() {
  try {
    const j = JSON.parse(readFileSync(storePath(), "utf-8"));
    return { proposals: Array.isArray(j?.proposals) ? j.proposals.filter((p) => p && typeof p === "object" && ID_RE.test(p.id || "")) : [] };
  } catch { return { proposals: [] }; }
}

function writeStore(store) {
  const p = storePath();
  mkdirSync(dirname(p), { recursive: true });
  // .data/ is engine state, never repo content — it ignores itself.
  const gi = join(dirname(p), ".gitignore");
  if (!existsSync(gi)) { try { writeFileSync(gi, "*\n"); } catch { /* best effort */ } }
  const now = Date.now();
  // Prune: anything past its TTL for longer than KEEP_MS is gone; the file stays small.
  const proposals = store.proposals.filter((x) => (Date.parse(x.expires_at || "") || 0) + KEEP_MS > now);
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, JSON.stringify({ updated_at: new Date().toISOString(), proposals }, null, 2) + "\n", "utf-8");
    renameSync(tmp, p);
  } catch (e) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best effort */ }
    throw e;
  }
}

/** Serialised read-modify-write — globalThis so a dev-server HMR reload keeps one chain. */
const g = globalThis;
if (!g.__proposalsMutex) g.__proposalsMutex = Promise.resolve();
function withStore(fn) {
  const run = g.__proposalsMutex.then(async () => {
    const store = readStore();
    const result = await fn(store);
    if (result?.__noWrite !== true) writeStore(store);
    return result;
  });
  g.__proposalsMutex = run.then(() => undefined, () => undefined);
  return run;
}

/** "open" past its TTL reads as "expired"; every other status is final or in flight. */
function derive(p, now = Date.now()) {
  const status = p.status === "open" && now > (Date.parse(p.expires_at || "") || 0) ? "expired" : p.status;
  return { ...p, status };
}

/**
 * Store a proposal the route has ALREADY validated. `fields` = { op, chat_id, …op fields }.
 * Returns the record. It has no message binding yet — nothing can resolve it until bindProposals().
 * @param {string} tenantId
 * @param {Record<string, unknown>} fields
 */
export function createProposal(tenantId, fields) {
  if (!OPS.includes(String(fields?.op))) throw new Error(`unknown proposal op "${fields?.op}"`);
  const now = new Date();
  const rec = {
    ...fields,
    id: randomUUID(),
    tenant: String(tenantId),
    message_id: null,
    status: "open",
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
  };
  return withStore((s) => { s.proposals.push(rec); return { ...rec }; });
}

/** Tie proposals to the ONE chat message that carries them (the route's own note). */
export function bindProposals(tenantId, ids, { chat_id, message_id }) {
  if (!ids?.length || !message_id) return Promise.resolve(0);
  return withStore((s) => {
    let n = 0;
    for (const p of s.proposals) {
      if (p.tenant === String(tenantId) && ids.includes(p.id) && !p.message_id && p.chat_id === chat_id) { p.message_id = String(message_id); n++; }
    }
    return n ? { n } : { __noWrite: true, n };
  }).then((r) => r.n);
}

/**
 * The record for the UI — or null when the id is unknown, belongs to another tenant, was never
 * bound to a message, or is being asked about from a DIFFERENT message (a copied token).
 */
export function getProposal(tenantId, id, { messageId } = {}) {
  if (!ID_RE.test(String(id || ""))) return null;
  const p = readStore().proposals.find((x) => x.id === id);
  if (!p || p.tenant !== String(tenantId) || !p.message_id) return null;
  if (String(messageId || "") !== p.message_id) return null;
  return derive(p);
}

/**
 * Take a proposal for execution (single use). The claim is atomic under the mutex, so a double
 * click sends once. Returns { ok:true, proposal } or { ok:false, status, error } (HTTP status).
 * `messageId`, when given, must match the binding too.
 */
export function claimProposal(tenantId, id, op, { messageId } = {}) {
  if (!ID_RE.test(String(id || ""))) return Promise.resolve({ ok: false, status: 404, error: MESSAGES.notFound });
  return withStore((s) => {
    const p = s.proposals.find((x) => x.id === id);
    const no = (status, error) => ({ __noWrite: true, ok: false, status, error });
    if (!p || p.tenant !== String(tenantId) || !p.message_id) return no(404, MESSAGES.notFound);
    if (messageId && String(messageId) !== p.message_id) return no(404, MESSAGES.notFound);
    if (p.op !== op) return no(400, MESSAGES.wrongOp);
    const d = derive(p);
    if (d.status === "expired") return no(410, MESSAGES.expired);
    if (d.status === "used") return no(409, MESSAGES.used);
    if (d.status === "claimed") return no(409, MESSAGES.claimed);
    if (d.status !== "open") return no(409, MESSAGES.unavailable);
    p.status = "claimed";
    p.claimed_at = new Date().toISOString();
    return { ok: true, proposal: { ...p } };
  });
}

/** Close a claim: success → "used" for good; failure → back to "open" with the error, retryable. */
export function settleProposal(tenantId, id, { ok, result, error } = {}) {
  return withStore((s) => {
    const p = s.proposals.find((x) => x.id === id && x.tenant === String(tenantId));
    if (!p || p.status !== "claimed") return { __noWrite: true };
    if (ok) { p.status = "used"; p.used_at = new Date().toISOString(); if (result) p.result = result; delete p.last_error; }
    else { p.status = "open"; p.last_error = String(error || MESSAGES.failed).slice(0, 300); }
    delete p.claimed_at;
    return { ok: true };
  });
}
