/**
 * shapes.mjs — the two anti-repetition axes that text dedup cannot see: SHAPE and LESSON.
 *
 * COPY TO: engine/app/src/lib/shapes.mjs (unchanged). Reference 4 §9.4 explains where each gate fires.
 * Brand-agnostic: the shape vocabulary comes from each tenant's brand kit (`strategy.json.shapes`), never
 * from here. Zero dependencies, plain ESM, so the Next app and a bare `node engine/tools/…` script import
 * this exact file.
 *
 * WHY THIS EXISTS
 * Text-similarity dedup (ideas-core.mjs) compares WORDING. Two ideas that both mean "something new came
 * out → we tried it for real" can share almost no words (different product, different test), so every
 * text rule passes them both, correctly. Do that daily and the store fills with dozens of records of ONE
 * form while looking perfectly deduplicated. Later, six ideas in six different shapes in one week all
 * taught the SAME lesson, and neither text dedup nor shape saturation could see it.
 *
 * So each idea carries:
 *   shape_id     — the FORM it takes (validated against the kit's `shapes`)
 *   core_lesson  — the ONE lesson it teaches, as a short canonical key
 * and both are gated:
 *   findShapeSaturation()  — per idea: is this shape already saturated in this pillar?
 *   findLessonSaturation() — per idea: has this lesson been taught enough lately?
 *   enforceRunDiversity()  — per radar run: is the whole run collapsing into one form, or into news?
 *   renderVarietyBlock()   — tells the scout all of the above UP FRONT (a run once lost 4 of its 6 verified
 *                            ideas to these gates at ingest because it had not been told).
 *
 * A shape is NOT a canvas: tenant.json `formats` (carousel, story…) are outputs. One shape ships on any canvas.
 */

/**
 * Starter vocabularies, offered in the interview when the owner can't name their shapes yet. They rename
 * and cut them; the kit then carries their version, in their language. `news: true` marks a shape that
 * needs a fresh external event to exist: those are the ones that quietly take over a radar-fed store.
 * Offer the list for the business's kind. These are EXAMPLES, never written into a kit without the
 * owner's yes, and every kit needs at least 2 shapes with news:false.
 */
export const STARTER_SHAPES = {
  // a person's personal brand (a creator, a consultant, a founder who posts as themselves)
  creator: [
    { id: "personal-story",     label: "A personal story with a turn",                news: false },
    { id: "behind-the-scenes",  label: "Behind the scenes of the real work",          news: false },
    { id: "quick-tip",          label: "One quick, concrete tip",                     news: false },
    { id: "common-mistake",     label: "The mistake everyone makes",                  news: false },
    { id: "failure-lesson",     label: "I got this wrong → what I'd do instead",      news: false },
    { id: "myth-correction",    label: "Everyone believes X → the reality",           news: false },
    { id: "confusion-solver",   label: "The difference between A, B and C",           news: false },
    { id: "checklist",          label: "The steps you must do",                       news: false },
    { id: "packaged-asset",     label: "A ready-made asset of our own (template, guide)", news: false },
    { id: "work-in-progress",   label: "Watch me make this, step by step",            news: false },
    { id: "reply-to-comment",   label: "Answering a real comment or question",        news: false },
    { id: "opinion-stand",      label: "A position we'll defend",                     news: false },
    { id: "trend-opinion",      label: "An honest take on something that just happened", news: true },
    { id: "new-thing-tryout",   label: "Something new came out → I tried it for real", news: true },
  ],
  // a company or an agency client (a shop, a clinic, a studio, a local service, a SaaS)
  company: [
    { id: "product-spotlight",  label: "One product or service, shown properly",      news: false },
    { id: "customer-question",  label: "A question customers really ask → the answer", news: false },
    { id: "before-after",       label: "Before → after (real, from the library)",     news: false },
    { id: "how-to-use",         label: "How to use / choose / care for it",           news: false },
    { id: "behind-the-scenes",  label: "How it's made or delivered",                  news: false },
    { id: "common-mistake",     label: "The mistake buyers make",                     news: false },
    { id: "myth-correction",    label: "A belief about the category → the reality",   news: false },
    { id: "comparison-guide",   label: "Which option fits whom",                      news: false },
    { id: "team-and-place",     label: "The people and the place behind the brand",   news: false },
    { id: "offer-explained",    label: "The current offer, plainly explained",        news: false },
    { id: "seasonal-hook",      label: "A season, holiday or local event → our angle", news: true },
    { id: "industry-news",      label: "Something changed in our market → what it means for you", news: true },
  ],
};

/**
 * The fallback when a kit carries no shapes at all (a hand-edited kit; the approval validator normally
 * refuses that). Neutral on purpose: forms that work for any kind of business. shapeTaxonomy() returns
 * it with ok:false, so callers know it is not the owner's vocabulary.
 */
export const DEFAULT_SHAPES = [
  { id: "quick-tip",          label: "One quick, concrete tip",                     news: false },
  { id: "common-mistake",     label: "The mistake everyone makes",                  news: false },
  { id: "myth-correction",    label: "Everyone believes X → the reality",           news: false },
  { id: "behind-the-scenes",  label: "Behind the scenes of the real work",          news: false },
  { id: "customer-question",  label: "A real question → the answer",                news: false },
  { id: "trend-opinion",      label: "An honest take on something that just happened", news: true },
];

/* ───────────────────────── policy (one place) ───────────────────────── */

export const MAX_PER_SHAPE_PER_RUN = 2;          // no single shape dominates one radar run
export const MIN_NON_NEWS_PER_RUN = 2;           // a run needs at least this many ideas that need no news
export const MIN_DISTINCT_SHAPES_PER_RUN = 2;    // …and at least this many different shapes
export const SHAPE_SATURATION_LIMIT = 3;         // active ideas of one shape+pillar before a new one is refused
export const SHAPE_SATURATION_WINDOW_DAYS = 30;
export const MAX_PER_LESSON_PER_RUN = 1;         // one idea per lesson per run
export const LESSON_SATURATION_LIMIT = 2;        // active ideas teaching one lesson before a new one is refused
export const LESSON_SATURATION_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;
const INACTIVE = new Set(["rejected", "archived"]);   // a shape the owner turned down must not also block the slot

/* ───────────────────────── vocabulary ───────────────────────── */

/** The kit's shapes (`strategy.json.shapes`); falls back to DEFAULT_SHAPES with ok:false (the interview never set them). */
export function shapeTaxonomy(kit) {
  const raw = kit?.shapes ?? kit?.strategy?.shapes;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, shapes: DEFAULT_SHAPES, ids: DEFAULT_SHAPES.map((s) => s.id) };
  }
  const clean = raw
    .filter((s) => s && typeof s.id === "string" && s.id.trim())
    .map((s) => ({ id: s.id.trim(), label: s.label || s.id, news: s.news === true }));
  return { ok: clean.length > 0, shapes: clean, ids: clean.map((s) => s.id) };
}

/** Which of the kit's shapes are news-dependent. */
export function newsShapeIds(kit) {
  return shapeTaxonomy(kit).shapes.filter((s) => s.news).map((s) => s.id);
}

export const isShape = (kit, id) => shapeTaxonomy(kit).ids.includes(String(id ?? ""));

/**
 * "Active Recall", "active_recall", " active-recall " → "active-recall". Any script: combining marks
 * (diacritics, Arabic harakat) and tatweel are stripped, every non-letter/number run becomes "-". ≤60 chars.
 */
export function normalizeLesson(v) {
  return String(v ?? "").normalize("NFKD").replace(/[\p{M}ـ]/gu, "").normalize("NFC")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/** Undated ideas COUNT (the conservative choice: a record with no date can't prove it is old). */
function withinDays(idea, days, now) {
  const iso = idea?.created_at || idea?.last_seen_at;
  if (!iso) return true;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  return now - t <= days * DAY_MS;
}

/* ───────────────────────── per-idea gates ───────────────────────── */

/**
 * Has this pillar already had enough ideas of this shape recently? Same pillar + different shape is fine;
 * same shape + different pillar is also fine: the PAIRING is what saturates.
 * @returns {{saturated:boolean, rule:"shape-saturated", shape_id, pillar_id, count, max, window_days, examples:string[], message:string}}
 */
export function findShapeSaturation(ideas, candidate, opts = {}) {
  const max = opts.max ?? SHAPE_SATURATION_LIMIT;
  const windowDays = opts.windowDays ?? SHAPE_SATURATION_WINDOW_DAYS;
  const now = opts.now ?? Date.now();
  const shape_id = candidate?.shape_id ? String(candidate.shape_id) : "";
  const pillar_id = candidate?.pillar_id ? String(candidate.pillar_id) : "";
  const base = { rule: "shape-saturated", shape_id, pillar_id, max, window_days: windowDays };
  if (!shape_id) return { ...base, saturated: false, count: 0, examples: [], message: "" };

  const matches = (ideas || []).filter((i) =>
    i && String(i.shape_id || "") === shape_id &&
    (!pillar_id || String(i.pillar_id || "") === pillar_id) &&
    !INACTIVE.has(i.status) && withinDays(i, windowDays, now));
  const saturated = matches.length >= max;
  return {
    ...base, saturated, count: matches.length,
    examples: matches.slice(0, 3).map((i) => i.text).filter(Boolean),
    message: saturated
      ? `already ${matches.length} active ideas of shape "${shape_id}"${pillar_id ? ` in pillar "${pillar_id}"` : ""} in the last ${windowDays} days (limit ${max})`
      : "",
  };
}

/**
 * Has this lesson been taught enough lately (any shape, any pillar)?
 * @returns {{saturated:boolean, rule:"lesson-saturated", core_lesson, count, max, window_days, examples:string[], message:string}}
 */
export function findLessonSaturation(ideas, candidate, opts = {}) {
  const max = opts.max ?? LESSON_SATURATION_LIMIT;
  const windowDays = opts.windowDays ?? LESSON_SATURATION_WINDOW_DAYS;
  const now = opts.now ?? Date.now();
  const lesson = normalizeLesson(candidate?.core_lesson);
  const base = { rule: "lesson-saturated", core_lesson: lesson, max, window_days: windowDays };
  if (!lesson) return { ...base, saturated: false, count: 0, examples: [], message: "" };

  const matches = (ideas || []).filter((i) =>
    i && normalizeLesson(i.core_lesson) === lesson && !INACTIVE.has(i.status) && withinDays(i, windowDays, now));
  const saturated = matches.length >= max;
  return {
    ...base, saturated, count: matches.length,
    examples: matches.slice(0, 3).map((i) => i.text).filter(Boolean),
    message: saturated
      ? `the lesson "${lesson}" was already taught by ${matches.length} active ideas in the last ${windowDays} days (limit ${max})`
      : "",
  };
}

/* ───────────────────────── per-run gate ───────────────────────── */

/**
 * Stop one radar run from collapsing into one form, one lesson, or pure news.
 *
 * Candidates arrive in the scout's own ranking order (best first), so when a cap forces a drop, the later
 * (weaker) ones go. Then the whole run is judged:
 *   • an idea with a missing or unknown shape_id → the WHOLE run fails (the vocabulary must not drift);
 *   • fewer than MIN_NON_NEWS_PER_RUN non-news ideas, or fewer than MIN_DISTINCT_SHAPES_PER_RUN shapes →
 *     the WHOLE run fails. A scout pointed at "what's new" finds something new every day; if each such run
 *     may contribute even one item, the store still ends up all news. Failing is the honest result:
 *     "today's scan found nothing durable" is information, and the health banner is where it shows.
 * Nothing here judges quality: that is the review queue's job. This only enforces variety.
 *
 * @returns {{ok:boolean, fatal:string|null, code:string|null, accepted:object[], dropped:{idea:object, reason:string}[],
 *            non_news_count:number, distinct_shapes:number}}
 */
export function enforceRunDiversity(candidates, kit, opts = {}) {
  const maxPerShape = opts.maxPerShape ?? MAX_PER_SHAPE_PER_RUN;
  const maxPerLesson = opts.maxPerLesson ?? MAX_PER_LESSON_PER_RUN;
  const minNonNews = opts.minNonNews ?? MIN_NON_NEWS_PER_RUN;
  const minDistinct = opts.minDistinctShapes ?? MIN_DISTINCT_SHAPES_PER_RUN;

  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const tax = shapeTaxonomy(kit);
  const newsIds = new Set(newsShapeIds(kit));

  const unknown = list.filter((i) => !tax.ids.includes(String(i.shape_id || "")));
  if (unknown.length) {
    return {
      ok: false, code: "missing-or-invalid-shape", accepted: [], dropped: [], non_news_count: 0, distinct_shapes: 0,
      fatal: `${unknown.length} idea(s) have a missing or unknown shape_id (valid: ${tax.ids.join(", ")}) — the whole run is rejected`,
    };
  }

  const accepted = [];
  const dropped = [];
  const perShape = new Map();
  const perLesson = new Map();
  for (const idea of list) {
    const shape = String(idea.shape_id);
    const lesson = normalizeLesson(idea.core_lesson);
    if ((perShape.get(shape) || 0) >= maxPerShape) {
      dropped.push({ idea, reason: `shape "${shape}" already has ${maxPerShape} ideas in this run` });
      continue;
    }
    if (lesson && (perLesson.get(lesson) || 0) >= maxPerLesson) {
      dropped.push({ idea, reason: `another idea in this run already teaches the lesson "${lesson}"` });
      continue;
    }
    perShape.set(shape, (perShape.get(shape) || 0) + 1);
    if (lesson) perLesson.set(lesson, (perLesson.get(lesson) || 0) + 1);
    accepted.push(idea);
  }

  const distinct = new Set(accepted.map((i) => String(i.shape_id))).size;
  const nonNews = accepted.filter((i) => !newsIds.has(String(i.shape_id))).length;

  let fatal = null;
  if (accepted.length === 0) fatal = "no ideas survived the per-run caps";
  else if (nonNews < minNonNews) fatal = `only ${nonNews} idea(s) that need no news (need ${minNonNews}) — an all-news run is rejected whole, not trimmed`;
  else if (distinct < minDistinct) fatal = `only ${distinct} distinct shape(s) (need ${minDistinct}) — the run collapsed into one form`;

  return {
    ok: fatal === null, fatal, code: fatal ? "run-not-diverse" : null,
    accepted: fatal ? [] : accepted, dropped, non_news_count: nonNews, distinct_shapes: distinct,
  };
}

/* ───────────────────────── reporting + the scout prompt ───────────────────────── */

/** How the last `windowDays` break down by shape. Surfacing this lets the owner notice the drift before a gate fires. */
export function shapeMix(ideas, opts = {}) {
  const windowDays = opts.windowDays ?? SHAPE_SATURATION_WINDOW_DAYS;
  const now = opts.now ?? Date.now();
  const counts = new Map();
  for (const i of ideas || []) {
    if (!i || i.status === "archived" || !withinDays(i, windowDays, now)) continue;
    const k = String(i.shape_id || "(unset)");
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .map(([shape_id, count]) => ({ shape_id, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

/** The shape × pillar pairs that are FULL right now (a new idea there would be refused). */
export function fullShapes(ideas, opts = {}) {
  const max = opts.max ?? SHAPE_SATURATION_LIMIT;
  const windowDays = opts.windowDays ?? SHAPE_SATURATION_WINDOW_DAYS;
  const now = opts.now ?? Date.now();
  const counts = new Map();
  for (const i of ideas || []) {
    if (!i?.shape_id || INACTIVE.has(i.status) || !withinDays(i, windowDays, now)) continue;
    const key = `${i.shape_id}\u0000${i.pillar_id || ""}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= max)
    .map(([key, count]) => { const [shape_id, pillar_id] = key.split("\u0000"); return { shape_id, pillar_id, count }; })
    .sort((a, b) => b.count - a.count);
}

/** Lessons taught in the window, most-taught first (max 25), each flagged `full` at the limit. */
export function recentLessons(ideas, opts = {}) {
  const max = opts.max ?? LESSON_SATURATION_LIMIT;
  const windowDays = opts.windowDays ?? LESSON_SATURATION_WINDOW_DAYS;
  const now = opts.now ?? Date.now();
  const counts = new Map();
  for (const i of ideas || []) {
    const l = normalizeLesson(i?.core_lesson);
    if (!l || INACTIVE.has(i.status) || !withinDays(i, windowDays, now)) continue;
    counts.set(l, (counts.get(l) || 0) + 1);
  }
  return [...counts.entries()].map(([lesson, count]) => ({ lesson, count, full: count >= max }))
    .sort((a, b) => b.count - a.count || a.lesson.localeCompare(b.lesson)).slice(0, 25);
}

/**
 * The block injected into every scout prompt, so the vocabulary cannot drift and the scout knows UP FRONT
 * what ingest will refuse. Labels come from the kit (in the brand's language); the rules are in English
 * because the prompt is.
 */
export function renderVarietyBlock(kit, ideas = []) {
  const { shapes } = shapeTaxonomy(kit);
  const full = fullShapes(ideas);
  const lessons = recentLessons(ideas);
  const lines = [
    "## SHAPES — every idea carries a `shape_id` from this list, exactly (never invent one)",
    ...shapes.map((s) => `- \`${s.id}\` — ${s.label}${s.news ? "  (needs fresh news)" : ""}`),
    "",
    "## VARIETY RULES (enforced at ingest — a broken rule wastes the run)",
    `- At most ${MAX_PER_SHAPE_PER_RUN} ideas per shape in this run.`,
    `- At least ${MIN_NON_NEWS_PER_RUN} ideas whose shape needs NO news, and at least ${MIN_DISTINCT_SHAPES_PER_RUN} different shapes. A run that is all news is rejected WHOLE.`,
    `- Every idea names its ONE \`core_lesson\` as a 1–4 word lowercase key (reuse an existing key for the same lesson). At most ${MAX_PER_LESSON_PER_RUN} idea per lesson per run.`,
  ];
  if (full.length) {
    lines.push("", "## FULL RIGHT NOW — a new idea here will be refused (shape × pillar):",
      ...full.map((f) => `- ${f.shape_id} × ${f.pillar_id || "(any pillar)"} — ${f.count} in the last ${SHAPE_SATURATION_WINDOW_DAYS} days`));
  }
  if (lessons.length) {
    lines.push("", `## LESSONS ALREADY TAUGHT (last ${LESSON_SATURATION_WINDOW_DAYS} days) — FULL ones will be refused:`,
      ...lessons.map((l) => `- ${l.lesson} ×${l.count}${l.full ? "  FULL" : ""}`));
  }
  return lines.join("\n");
}
