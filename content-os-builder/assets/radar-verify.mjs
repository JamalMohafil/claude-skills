// radar-verify.mjs — the radar's grounding check. The ENGINE, not the model, decides what is real.
//
// COPY TO: engine/app/src/lib/radar-verify.mjs (unchanged; edit only the blocks marked EDIT:).
// Imports: ./extract-json.mjs, ./tenant.mjs and ./shapes.mjs (all assets). Plain ESM + fetch, zero
// dependencies, shared by the app's radar job and the cron's offline path (engine/tools/radar-ingest.mjs).
// Reference 8 §3–§4 explains every check; this file is the measured implementation.
//
// WHY. In the first live radar, 5 of 7 ideas in one run cited the brand's OWN page as their "source"
// and the "news" was up to a month old; the owner called the output hallucination. So before any idea
// reaches ideas.json, this file checks every one of them:
//
//   news idea        → the source is EXTERNAL (after redirects too), not a social post and not a paid
//                      placement; the page opens behind an SSRF guard; the page's OWN publish date is
//                      ≤ max_age_days old and matches the claimed one; the quoted `evidence` (≥ 60 chars,
//                      ≥ 12 words) is really on it, in the article body, not the menu or the newsletter box;
//                      every name and number in `what_happened` is on the page
//   competitor idea  → it points at a post in THIS tenant's tracked hits (by post id, permalink or the
//                      platform's post key), the named competitor owns it, and it is not the brand's own
//   every idea       → it is in the brand's publishing language, readable (no internal ids or file
//                      names), states no number nothing proves, and at most 2 ideas stand on one source
//                      and 2 on one site
//
// A live probe beat the first version five ways (a redirect to the brand's own page, a two-year-old page
// dated "today", a 27-char boilerplate quote, a fabricated paragraph with one real 8-word run, a fenced
// run file that verify refused while ingest still read it). Each check below closes one.
//
// Failing ideas are dropped with an owner-language reason recorded in the run file (`verification`),
// never silently, and the scout's untouched output is kept next to it as <run>.raw.json. EVERY kept idea,
// news or competitor, gets `_verified_at` (the engine's stamp); the ingest admits only ideas whose stamp
// equals the `checked_at` this function RETURNED, and radarIdeaToRecord copies it to grounding.verified_at.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extractJson } from "./extract-json.mjs";
import { settingsOf } from "./tenant.mjs";
import { shapeTaxonomy } from "./shapes.mjs";

/* ───────────────────────── EDIT: the owner-language sentences ─────────────────────────
 * Every reason is shown to the owner as-is (the radar view, the run history, the chat's job note).
 * Translate the strings into the owner's UI language; keep the parameters. Never show a code instead. */
export const REASONS = {
  unreadableIdea: () => "this idea could not be read",
  wrongLanguage: (lang) => `written in another language, and this brand publishes in ${lang}`,
  emptyIdea: () => "the idea is empty or incomplete",
  tooLong: (n) => `the idea is too long (${n} characters); it must be one short sentence`,
  internalCode: (id) => (id ? `it carries an internal code «${id}»: written for the machine, not for a follower` : "it carries a file name or an internal code: written for the machine, not for a follower"),
  unprovenNumber: (nums) => `it states a number nothing proves: «${nums.join("», «")}» (not on the source, not in the brand's files)`,
  noSource: () => "no source",
  ownPage: () => "the source is the business's own page, not research",
  socialPost: (host) => `the source is a post on ${host}; it must be an article or a release page`,
  paid: () => "the source is a paid placement (advertorial / sponsored), not news",
  noDate: () => "the source has no publish date",
  futureDate: () => "the source date is in the future",
  tooOld: (days, d) => `the source is older than ${days} days (${d})`,
  noQuote: () => "no quote from the source",
  shortQuote: (chars, words) => `the quote is too short (${chars} characters · ${words} words); it must be one full sentence of at least ${MIN_EVIDENCE_CHARS} characters and ${MIN_EVIDENCE_WORDS} words`,
  notOpened: (why) => `the source did not open (${why})`,
  redirectOwn: () => "the link redirects to the business's own page, not research",
  redirectSocial: (host) => `the link redirects to ${host}; it must be an article or a release page`,
  redirectPaid: () => "the link redirects to a paid placement, not news",
  quoteMissing: (pct) => (pct > 0 ? `the quote is not on the source page (only ${pct}% of it)` : "the quote is not on the source page"),
  templated: (n) => `a generated page (the same sentence ${n} times), not a real article`,
  pageTooOld: (d, days) => `the page was published ${d}, older than ${days} days`,
  pageDateMismatch: (d, claimed) => `the page date ${d} is not the claimed source date ${claimed}`,
  pageMonthTooOld: (m, days) => `the page is from ${m}, older than ${days} days`,
  pageMonthMismatch: (m, claimed) => `the page's link is from ${m}, not the month of the claimed date ${claimed}`,
  noNearDate: (claimed) => `no date on the page is near ${claimed}`,
  noPageDate: (claimed) => `no publish date on the page confirms ${claimed}`,
  factsOff: (list) => `"what happened" says things the source does not: ${list.join(", ")}`,
  coveredNoDifferentiator: () => "a competitor already ran this, and there is no real difference from it",
  noHit: () => "no hit: neither a hit_post_id nor a link",
  articleNotHit: (host) => `the source is an article on ${host}, not a tracked competitor hit`,
  postNotHit: (pid) => `post ${pid} is not among the tracked hits`,
  linkNotHit: () => "the link is not a tracked hit",
  wrongCompetitor: (cid, name) => `competitor_id «${cid}» does not own this hit (${name})`,
  ownHit: () => "the hit is from the business's own account, not a competitor",
  notPicked: () => "not one of the hits the owner picked",
  competitorNoDifferentiator: () => "no real difference from the competitor: what do WE do differently?",
  perSource: (max) => `more than ${max} ideas from the same source; each idea needs its own`,
  perHost: (max, host) => `more than ${max} ideas from the same site (${host}); vary the sources`,
  // the fetch guard (shown inside notOpened)
  badUrl: () => "not a valid link",
  notWeb: () => "not a web link",
  internalPort: () => "a link on an internal port",
  internalHost: () => "an internal link",
  privateNetwork: () => "a link into a private network",
  noDomain: () => "the domain does not exist",
};
/** The title the owner reads on a competitor idea: the ENGINE's, built from the hit, never the model's copy. */
export const hitTitle = (name, multiplier, n, basis) =>
  `${name} · ${multiplier}× its own median${typeof n === "number" ? ` · ${n.toLocaleString("en-US")} ${basis === "likes" ? "likes" : "views"}` : ""}`;

/* ───────────────────────── EDIT: language data ─────────────────────────
 * Keyed by the base language code of tenant.json `settings.lang`. "en" is always active as well, because
 * sources are often English. `scale` = words that multiply a number; `metrics` = word STEMS that make a
 * number a claim about an audience or money; `months` = 12 entries, each a list of spellings. Add the
 * publishing language of every business you build for. */
export const LANGUAGE_WORDS = {
  en: {
    scale: { thousand: 1e3, million: 1e6 },
    metrics: ["follower", "subscriber", "view", "member", "client", "customer", "user", "download", "sale", "revenue", "comment", "like", "dollar", "euro", "$"],
    months: [["january", "jan"], ["february", "feb"], ["march", "mar"], ["april", "apr"], ["may"], ["june", "jun"], ["july", "jul"], ["august", "aug"], ["september", "sep", "sept"], ["october", "oct"], ["november", "nov"], ["december", "dec"]],
  },
  ar: {
    scale: { "ألف": 1e3, "الف": 1e3, "آلاف": 1e3, "مليون": 1e6 },
    metrics: ["متابع", "مشترك", "مشاهد", "عضو", "أعضاء", "عميل", "عملاء", "زبون", "زبائن", "مبيع", "تعليق", "إعجاب", "دولار", "ريال", "درهم", "دينار", "جنيه", "يورو", "ليرة"],
    months: [["يناير", "كانون الثاني"], ["فبراير", "شباط"], ["مارس", "آذار"], ["أبريل", "ابريل", "نيسان"], ["مايو", "أيار"], ["يونيو", "حزيران"], ["يوليو", "تموز"], ["أغسطس", "اغسطس", "آب"], ["سبتمبر", "أيلول"], ["أكتوبر", "اكتوبر", "تشرين الأول"], ["نوفمبر", "تشرين الثاني"], ["ديسمبر", "كانون الأول"]],
  },
};

/** EDIT: function words per Latin-script language, for the language gate (non-Latin scripts are gated by script). */
export const STOPWORDS = {
  en: ["the", "and", "to", "of", "in", "is", "for", "on", "with", "that", "you", "your", "this", "are", "how", "what", "from", "by", "be", "or", "we", "our", "it"],
  es: ["el", "la", "los", "las", "del", "y", "que", "un", "una", "es", "para", "con", "por", "su", "tu", "más", "como", "lo", "se", "al", "sus", "nuestro"],
  fr: ["le", "les", "des", "du", "et", "que", "une", "est", "pour", "avec", "sur", "vous", "votre", "pas", "plus", "ce", "qui", "au", "aux", "nous"],
  de: ["der", "die", "das", "und", "zu", "den", "ist", "mit", "für", "von", "ein", "eine", "nicht", "auf", "sie", "wie", "auch", "im", "dem", "des", "wir"],
  pt: ["os", "do", "da", "que", "em", "um", "uma", "é", "para", "com", "por", "seu", "sua", "não", "mais", "como", "no", "na", "você"],
  it: ["il", "lo", "gli", "di", "del", "della", "che", "un", "una", "è", "per", "con", "su", "non", "più", "come", "nel", "noi"],
  nl: ["de", "het", "een", "en", "van", "dat", "op", "te", "voor", "met", "niet", "zijn", "je", "jouw", "ook", "als", "bij", "aan", "wij"],
  tr: ["ve", "bir", "bu", "için", "ile", "çok", "daha", "gibi", "ne", "olarak", "sen", "senin", "biz"],
};

/** EDIT: public file-name conventions your niche talks about (a topic, not an internal code). */
const PUBLIC_FILES = new Set(["readme.md", "package.json", "llms.txt", "robots.txt"]);
/** EDIT: the community platform(s) the owners run, so a post there never counts as news (e.g. "circle.so"). */
const COMMUNITY_HOSTS = [];

/* ───────────────────────── policy ───────────────────────── */

export const MAX_IDEAS_PER_SOURCE = 2;
/** Ideas that may stand on one SITE: a slate of four ideas from one blog is one blog's opinion, not research. */
export const MAX_IDEAS_PER_HOST = 2;
/** The quote repeated this often on one page = a generated SEO page, not an article. */
const TEMPLATED_REPEATS = 4;
const MIN_EVIDENCE_CHARS = 60;
const MIN_EVIDENCE_WORDS = 12;
const SHINGLE = 8;            // words per shingle
const SHINGLE_SHARE = 0.8;    // share of the quote's shingles that must be on the page
const DATE_SLACK_DAYS = 2;    // page date vs claimed source_date
const MAX_TEXT_CHARS = 220;
const DAY = 86400000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

const SOCIAL_HOSTS = ["instagram.com", "x.com", "twitter.com", "youtube.com", "youtu.be", "tiktok.com", "facebook.com", "fb.com", "linkedin.com", "threads.net", "threads.com", ...COMMUNITY_HOSTS];
const isSocial = (host) => SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
/** A paid placement is marketing, not a report: it says what its sponsor paid it to say. */
const PAID = /(^|\/)(advertorial|advertorials|sponsored|sponsored-content|partner-content|paid-post|paidpost|brandvoice|brand-studio)(\/|$)/;

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const pathOf = (u) => { try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } };

/** "host" for a plain site, "host/first-segment" for a social profile: how "own page" is matched. */
function key(u) {
  try {
    const x = new URL(u);
    const host = x.hostname.replace(/^www\./, "").toLowerCase();
    if (isSocial(host)) return `${host}/${(x.pathname.split("/").filter(Boolean)[0] || "").toLowerCase()}`;
    return host;
  } catch { return ""; }
}

/** Every URL the brand's own kit, manifest and law name = its own pages (site, profiles, community). */
export function ownKeys(tenantRoot) {
  const keys = new Set();
  for (const f of ["brand/strategy.json", "tenant.json", "CLAUDE.md"]) {
    try {
      for (const u of readFileSync(join(tenantRoot, f), "utf-8").match(/https?:\/\/[^\s"'`)<>\]]+/g) || []) {
        const k = key(u);
        if (k && !k.endsWith("/")) keys.add(k);   // a bare social host ("instagram.com/") is everyone's, not the brand's
      }
    } catch { /* optional */ }
  }
  return keys;
}
const isOwn = (u, own) => { const k = key(u); return !!k && (own.has(k) || [...own].some((o) => k.endsWith("." + o))); };

/* ───────────────────────── language ───────────────────────── */

const LANG_SCRIPTS = {
  ar: ["Arabic"], fa: ["Arabic"], ur: ["Arabic"], ps: ["Arabic"], ckb: ["Arabic"], sd: ["Arabic"], ug: ["Arabic"],
  he: ["Hebrew"], iw: ["Hebrew"], yi: ["Hebrew"],
  ru: ["Cyrillic"], uk: ["Cyrillic"], bg: ["Cyrillic"], sr: ["Cyrillic"], mk: ["Cyrillic"], kk: ["Cyrillic"], mn: ["Cyrillic"],
  el: ["Greek"], hy: ["Armenian"], ka: ["Georgian"], hi: ["Devanagari"], mr: ["Devanagari"], ne: ["Devanagari"],
  bn: ["Bengali"], ta: ["Tamil"], te: ["Telugu"], th: ["Thai"], km: ["Khmer"], am: ["Ethiopic"],
  zh: ["Han"], ja: ["Han", "Hiragana", "Katakana"], ko: ["Hangul"],
};
const scriptRe = (scripts) => new RegExp(scripts.map((s) => `\\p{Script=${s}}`).join("|"), "u");
const baseLang = (lang) => String(lang || "").toLowerCase().split("-")[0];

/** Share of the letters in `t` written in `scripts` (a Latin product name inside a non-Latin sentence is fine). */
export function scriptShare(t, scripts) {
  const letters = String(t || "").match(/\p{L}/gu) || [];
  if (!letters.length) return 0;
  const re = scriptRe(scripts);
  return letters.filter((c) => re.test(c)).length / letters.length;
}
const latinShare = (t) => scriptShare(t, ["Latin"]);

/**
 * The language gate for one business: { lang, scripts|null, label } or null (no gate).
 * From tenant.json settings.lang; without it, the dominant non-Latin script of the kit's voice (≥ 50%).
 * A Latin-script language without a STOPWORDS list is gated only against other scripts: a known gap,
 * said here on purpose. Add its function words to STOPWORDS to close it.
 */
export function languageGate(lang, voiceText = "") {
  if (lang) {
    const b = baseLang(lang);
    return { lang: b, scripts: LANG_SCRIPTS[b] || null, label: lang };
  }
  for (const [code, scripts] of Object.entries(LANG_SCRIPTS)) {
    if (scriptShare(voiceText, scripts) >= 0.5) return { lang: code, scripts, label: code };
  }
  return null;
}

const tokens = (t) => (String(t || "").toLowerCase().normalize("NFC").match(/\p{L}+/gu) || []);
/** True when `text` is clearly NOT in the gate's language. Conservative: unsure means "fine". */
export function wrongLanguage(text, gate) {
  if (!gate || !String(text || "").trim()) return false;
  if (gate.scripts) return scriptShare(text, gate.scripts) < 0.4;
  if (latinShare(text) < 0.4) return true;                 // a Latin-script brand, a non-Latin sentence
  const own = STOPWORDS[gate.lang];
  if (!own) return false;                                  // the documented gap: no function words for this language
  const words = tokens(text);
  const count = (list) => words.filter((w) => list.includes(w)).length;
  const mine = count(own);
  return Object.entries(STOPWORDS).some(([code, list]) => code !== gate.lang && count(list) >= 2 && count(list) > mine);
}

/* ───────────────────────── numbers: a figure the audience would take as a fact ───────────────────────── */

const DIGIT_ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50, 0x0ed0, 0xff10];
/** Every decimal digit system → ASCII digits; Arabic decimal and thousands separators → "." and ",". */
export const foldDigits = (s) => String(s || "")
  .replace(/\p{Nd}/gu, (d) => { const c = d.codePointAt(0); for (const z of DIGIT_ZEROS) if (c >= z && c <= z + 9) return String(c - z); return d; })
  .replace(/٫/g, ".").replace(/٬/g, ",");
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function wordsFor(lang) {
  const en = LANGUAGE_WORDS.en, local = LANGUAGE_WORDS[baseLang(lang)] || {};
  const scale = { k: 1e3, m: 1e6, ...en.scale, ...(local.scale || {}) };
  const metrics = [...new Set([...en.metrics, ...(local.metrics || [])])];
  const months = en.months.map((list, i) => [...list, ...((local.months || [])[i] || [])]);
  const scaleAlt = Object.keys(scale).filter((w) => w.length > 1).sort((a, b) => b.length - a.length).map(esc).join("|");
  const numRe = new RegExp(`(\\d+(?:[.,]\\d+)*)\\s*(${scaleAlt}|[kKmM](?![a-zA-Z]))?`, "gu");
  // a number followed (within two words) by what it counts: followers, views, money, members, clients, a percentage
  const metricRe = new RegExp(`(\\$\\s*)?(\\d+(?:[.,]\\d+)*)\\s*(${scaleAlt}|[kKmM](?![a-zA-Z]))?\\s*(%|٪|(?:\\S+\\s+){0,2}?(?:${metrics.map(esc).join("|")}))`, "giu");
  return { scale, months, numRe, metricRe };
}
const toNumber = (raw) => (/^\d{1,3}(,\d{3})+$/.test(raw) ? Number(raw.replace(/,/g, "")) : Number(raw.replace(",", ".")));

/** Every number in `t` as a value (43.5K → 43500, 52,847 → 52847, a native-digit "29 thousand" → 29000). */
export function metricValues(t, lw = wordsFor(null)) {
  const out = new Set();
  for (const m of foldDigits(t).matchAll(lw.numRe)) {
    const n = toNumber(m[1]);
    if (Number.isFinite(n)) out.add(n * (m[2] ? lw.scale[m[2].toLowerCase()] || 1 : 1));
  }
  return out;
}

/**
 * The metrics in the words a follower reads (text, hook) that nothing proves: not on the verified source
 * (news), not in the hit or its transcript (competitor), not in the brand's own files. The model once
 * wrote a follower growth "from X to Y": Y was real analytics, X came from nowhere.
 */
export function unprovenMetrics(idea, support, facts, lw = wordsFor(null)) {
  const ok = new Set([...facts, ...metricValues(support, lw)]);
  const near = (v) => [...ok].some((x) => x === v || (v >= 1000 && Math.abs(x - v) <= v * 0.05));
  const bad = [];
  for (const f of [idea.text, idea.suggested_hook]) {
    for (const m of foldDigits(f).matchAll(lw.metricRe)) {
      const v = toNumber(m[2]) * (m[3] ? lw.scale[m[3].toLowerCase()] || 1 : 1);
      if (!Number.isFinite(v) || v < 10) continue;   // "3 questions" is a structure, not a claim
      if (!near(v)) bad.push(m[0].trim());
    }
  }
  return bad;
}

/* ───────────────────────── text: what the page really says ───────────────────────── */

const ENT = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "-", mdash: "-", hellip: "…" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return " "; } }
  return ENT[e.toLowerCase()] ?? " ";
});

/**
 * Words only, lower-cased, digits folded, combining marks (accents, harakat, hamza seats) stripped and the
 * Arabic letter variants folded, so a comma, a curly quote, a dropped accent or a "corrected" hamza cannot
 * fail a real quote. Returned space-padded: " w1 w2 ".
 */
export function words(text) {
  const s = foldDigits(String(text || "")).toLowerCase()
    .normalize("NFKD").replace(/[\p{M}ـ]/gu, "").normalize("NFC")
    .replace(/[آأإٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return s ? ` ${s} ` : " ";
}
const textOf = (html) => decode(html.replace(/<[^>]+>/g, " "));

/** The article body first (<article>/<main>), else the page minus its nav, footer, sidebars and forms. */
function pageScopes(html) {
  const clean = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<template[\s\S]*?<\/template>|<svg[\s\S]*?<\/svg>/gi, " ");
  const main = [...clean.matchAll(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]).join(" ");
  const body = clean.replace(/<(nav|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  return { main: words(textOf(main)), body: words(textOf(body)) };
}

/**
 * Share of the quote on the page: 1 when it is there whole, else the share of its 8-word shingles.
 * Some CMSs glue words at inline tags ("The<b>new</b>" renders "Thenew"), so each run is also looked up
 * with the spaces removed on both sides.
 */
function quoteShare(page, ev) {
  const flat = page.replace(/ /g, "");
  const on = (w) => page.includes(` ${w.join(" ")} `) || flat.includes(w.join(""));
  if (on(ev)) return 1;
  const n = ev.length - SHINGLE + 1;
  if (n < 1) return 0;
  let hit = 0;
  for (let i = 0; i < n; i++) if (on(ev.slice(i, i + SHINGLE))) hit++;
  return hit / n;
}

/* ───────────────────────── dates: when the page says it was published ───────────────────────── */

const dayOf = (s) => { const t = Date.parse(String(s || "").trim()); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
function attrs(tag) {
  const o = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) o[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return o;
}
const PUB_META = new Set([
  "article:published_time", "og:published_time", "og:article:published_time", "article.published", "article:published",
  "datepublished", "date", "pubdate", "publishdate", "publish-date", "publish_date", "published_time", "published-date",
  "dc.date", "dc.date.issued", "dcterms.created", "dcterms.date", "sailthru.date", "parsely-pub-date",
  "citation_publication_date", "citation_date", "publication_date", "release_date",
]);
const ARTICLE_LD = /Article|Posting|Report|PressRelease|VideoObject/i;
function ldDate(root) {
  const stack = [root];
  while (stack.length) {
    const x = stack.shift();
    if (Array.isArray(x)) { stack.push(...x); continue; }
    if (!x || typeof x !== "object") continue;
    const type = [].concat(x["@type"] || []).join(" ");
    if (x.datePublished && ARTICLE_LD.test(type) && !/LiveBlog/i.test(type)) { const d = dayOf(x.datePublished); if (d) return d; }
    for (const v of Object.values(x)) if (v && typeof v === "object") stack.push(v);
  }
  return null;
}

/**
 * The page's own publish date: <meta> (article:published_time…), itemprop, JSON-LD datePublished on an
 * article (not a live blog), then a full date in the URL path, then a month in the URL path, then <time>
 * tags. Several <time> dates = a multi-entry page (a changelog, a feed): returned as `times`.
 */
export function pageDate(html, url) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const k = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (PUB_META.has(k) && a.content) { const d = dayOf(a.content); if (d) return { date: d, source: "meta" }; }
  }
  for (const m of html.matchAll(/<[a-z]+\b[^>]*itemprop\s*=\s*["']datePublished["'][^>]*>/gi)) {
    const a = attrs(m[0]); const d = dayOf(a.content || a.datetime || "");
    if (d) return { date: d, source: "itemprop" };
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const d = ldDate(j); if (d) return { date: d, source: "json-ld" };
  }
  let path = "";
  try { path = decodeURIComponent(new URL(url).pathname); } catch { try { path = new URL(url).pathname; } catch { /* no url */ } }
  const full = path.match(/(?:^|[/_-])(20\d{2})[/_-](\d{1,2})[/_-](\d{1,2})(?=$|[/_.-])/);
  if (full && +full[2] >= 1 && +full[2] <= 12 && +full[3] >= 1 && +full[3] <= 31) {
    return { date: `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`, source: "url" };
  }
  const month = path.match(/(?:^|[/_-])(20\d{2})[/_-](\d{1,2})(?=$|[/_-])/);
  if (month && +month[2] >= 1 && +month[2] <= 12) return { month: `${month[1]}-${month[2].padStart(2, "0")}`, source: "url-month" };
  const times = [...new Set([...html.matchAll(/<(?:time|relative-time)\b[^>]*datetime\s*=\s*["']([^"']+)["']/gi)].map((m) => dayOf(m[1])).filter(Boolean))];
  if (times.length === 1) return { date: times[0], source: "time" };
  if (times.length > 1) return { times, source: "times" };
  return { source: null };
}

/** Is this YYYY-MM-DD written anywhere in the page text, in any of the usual shapes and month spellings? */
function dateInText(pageWords, day, lw) {
  const [y, m, d] = day.split("-"); const mi = +m - 1; const dn = String(+d);
  const names = lw.months[mi].map((n) => words(n).trim());
  const forms = [`${y} ${m} ${d}`, `${d} ${m} ${y}`, `${dn} ${+m} ${y}`, `${y} ${+m} ${dn}`,
    ...names.flatMap((n) => [`${n} ${dn} ${y}`, `${dn} ${n} ${y}`])];
  return forms.some((f) => pageWords.includes(` ${f} `));
}

/** Check the page's date against the claimed one. Returns { reason } or { date_source, page_date }. */
function checkPageDate(pd, claimed, pageWords, now, maxAgeDays, lw) {
  const c = Date.parse(claimed);
  const shown = (s) => String(s).slice(0, 10);
  if (pd.date) {
    const p = Date.parse(pd.date);
    if (now - p > maxAgeDays * DAY) return { reason: REASONS.pageTooOld(pd.date, maxAgeDays) };
    if (Math.abs(p - c) > DATE_SLACK_DAYS * DAY) return { reason: REASONS.pageDateMismatch(pd.date, shown(claimed)) };
    return { date_source: pd.source, page_date: pd.date };
  }
  if (pd.month) {
    const start = Date.parse(`${pd.month}-01`);
    const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
    if (now - end.getTime() > maxAgeDays * DAY) return { reason: REASONS.pageMonthTooOld(pd.month, maxAgeDays) };
    if (c < start - DATE_SLACK_DAYS * DAY || c > end.getTime() + DATE_SLACK_DAYS * DAY) return { reason: REASONS.pageMonthMismatch(pd.month, shown(claimed)) };
    return { date_source: "url-month", page_date: pd.month };
  }
  if (pd.times) {
    if (!pd.times.some((t) => Math.abs(Date.parse(t) - c) <= DATE_SLACK_DAYS * DAY)) return { reason: REASONS.noNearDate(shown(claimed)) };
    return { date_source: "near-times", page_date: shown(claimed) };
  }
  // No machine date on the page at all: the claimed day must at least be written on it.
  if (dateInText(pageWords, shown(claimed), lw)) return { date_source: "text", page_date: shown(claimed) };
  return { reason: REASONS.noPageDate(shown(claimed)) };
}

/* ───────────────────────── the sentence a follower reads ───────────────────────── */

/** An idea written for the machine, not for a follower: an internal id, a file name, a wall of text. */
function unreadable(idea, snap) {
  const text = String(idea.text || "").trim();
  if (text.length < 12) return REASONS.emptyIdea();
  if (text.length > MAX_TEXT_CHARS) return REASONS.tooLong(text.length);
  for (const field of [idea.text, idea.what_happened, idea.why_it_matters]) {
    const f = String(field || "");
    const files = (f.match(/\b[\w-]+\.(?:json|md|mjs|tsx?)\b/gi) || []).filter((x) => !PUBLIC_FILES.has(x.toLowerCase()));
    if (files.length || /\b\w+_id\b/i.test(f)) return REASONS.internalCode(null);
    const lower = ` ${f.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, " ")} `;
    const id = [...(snap.ids || [])].find((x) => lower.includes(` ${x} `));
    if (id) return REASONS.internalCode(id);
  }
  return null;
}

/* ───────────────────────── what_happened: only what the page says ───────────────────────── */

// Latin words a sentence uses as plain vocabulary, not names the page must carry.
const COMMON_LATIN = new Set(["ai", "api", "apis", "app", "apps", "pdf", "crm", "ceo", "cto", "cli", "ui", "ux", "seo", "saas", "b2b", "b2c", "id", "ok", "vs", "pro", "plus", "beta", "the", "and", "for", "of", "a", "an", "to", "in", "on", "with"]);
const CAPITALISED_NOUN_LANGS = new Set(["de", "lb"]);   // every noun is capitalised: only digits and ALL-CAPS mark a name

/** The name-like runs in a sentence: in a non-Latin sentence every Latin run; in a Latin one, the proper nouns. */
function nameRuns(src, latinBrand, lang) {
  if (!latinBrand) {
    // a run of Latin words is one name ("Acme Cloud", "Model X2")
    return [...new Set(src.match(/[A-Za-z][A-Za-z0-9]*(?:[.+-][A-Za-z0-9]+)*(?: [A-Za-z0-9][A-Za-z0-9]*(?:[.+-][A-Za-z0-9]+)*)*/g) || [])]
      .filter((tok) => /[A-Z]/.test(tok) || /\d/.test(tok));
  }
  // The sentence itself is Latin script: only tokens that look like names count, grouped into runs.
  const nounsCapitalised = CAPITALISED_NOUN_LANGS.has(baseLang(lang));
  const runs = []; let cur = []; let sentenceStart = true;
  for (const raw of src.split(/\s+/)) {
    const w = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const isName = !!w && /\p{L}/u.test(w) && (
      (/\d/.test(w)) || /^\p{Lu}{2,}/u.test(w) || (!nounsCapitalised && !sentenceStart && /^\p{Lu}/u.test(w)));
    if (isName) cur.push(w); else if (cur.length) { runs.push(cur.join(" ")); cur = []; }
    sentenceStart = /[.!?:]$/.test(raw) || raw === "";
  }
  if (cur.length) runs.push(cur.join(" "));
  return [...new Set(runs)];
}

/**
 * The names and numbers in `what_happened` that the page does NOT carry. A model that ties a real article
 * to a story from memory writes names the page never mentions: that is the hallucination this catches.
 * Checked: every 2+-digit number (native digits folded) and every name run (see nameRuns).
 */
export function factsOffPage(whatHappened, pageWords, { latinBrand = false, lang = null } = {}) {
  const src = String(whatHappened || "");
  const flat = pageWords.replace(/ /g, "");
  const on = (w) => pageWords.includes(` ${w} `) || (w.length >= 5 && flat.includes(w));
  const missing = [];
  for (const n of new Set(foldDigits(src).match(/\d+/g) || [])) {
    if (n.length < 2) continue;   // a bare 1-digit count is prose
    if (!on(n) && !on(String(Number(n)))) missing.push(n);
  }
  for (const tok of nameRuns(src, latinBrand, lang)) {
    const parts = words(tok).trim().split(" ").filter((w) => w && !COMMON_LATIN.has(w) && !/^\d+$/.test(w));
    if (!parts.length) continue;
    if (!parts.every((w) => on(w))) missing.push(tok);
  }
  return missing;
}

/* ───────────────────────── fetch: only the public web (the SSRF guard) ───────────────────────── */

function privateIp(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return privateIp(mapped[1]);
    return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x);
  }
  return true;
}
/** The verifier never becomes a door into this machine or the LAN (it would GET /api/<tenant>/… for the agent). */
async function publicUrl(u) {
  let x; try { x = new URL(u); } catch { return REASONS.badUrl(); }
  if (x.protocol !== "https:" && x.protocol !== "http:") return REASONS.notWeb();
  if (x.port && x.port !== "80" && x.port !== "443") return REASONS.internalPort();
  const h = x.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return REASONS.internalHost();
  try {
    const addrs = isIP(h) ? [{ address: h }] : await lookup(h, { all: true });
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) return REASONS.privateNetwork();
  } catch { return REASONS.noDomain(); }
  return null;
}

/** GET a page: redirects followed MANUALLY (every hop re-checked), 15 s timeout, 3 MB cap. Never throws. */
export async function fetchPage(url, { acceptLanguage = "en" } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    let at = url;
    for (let hop = 0; hop < 6; hop++) {
      const bad = await publicUrl(at);
      if (bad) return { ok: false, status: bad, url: at };
      const r = await fetch(at, { headers: { "User-Agent": UA, "Accept-Language": acceptLanguage }, redirect: "manual", signal: ctl.signal });
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (loc) { at = new URL(loc, at).href; continue; }
      if (!r.ok) return { ok: false, status: r.status, url: at };
      const buf = await r.arrayBuffer();
      return { ok: true, html: Buffer.from(buf.slice(0, 3_000_000)).toString("utf-8"), url: at };
    }
    return { ok: false, status: "redirects", url: at };
  } catch (e) { return { ok: false, status: e?.name === "AbortError" ? "timeout" : "network", url }; }
  finally { clearTimeout(timer); }
}

/* ───────────────────────── the snapshot: what the checks trust ───────────────────────── */

/** Every *.md under memory/ (depth ≤ 3): the owner's own stated facts. */
function memoryTexts(root) {
  const out = [];
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith(".md")) { try { if (statSync(p).size < 500_000) out.push(readFileSync(p, "utf-8")); } catch { /* skip */ } }
    }
  };
  walk(join(root, "memory"), 0);
  return out;
}

/**
 * What the checks trust, read BEFORE the scout runs. The agent can write some files (memory/, analytics
 * caches), so a snapshot taken after it exits would be checking the agent against itself.
 */
export function groundingSnapshot(tenantRoot) {
  const readJson = (rel, fb) => { try { return JSON.parse(readFileSync(join(tenantRoot, rel), "utf-8")); } catch { return fb; } };
  const readText = (rel) => { try { return readFileSync(join(tenantRoot, rel), "utf-8"); } catch { return ""; } };
  const hits = readJson("content/analytics/competitor-hits.json", {}).hits || [];
  // the brand's own posts: a "hit" that is one of them is not a competitor's
  const ownPostIds = new Set();
  for (const f of ["instagram-posts.json", "youtube-posts.json", "tiktok-posts.json", "x-posts.json"]) {
    for (const p of readJson(`content/analytics/${f}`, {}).posts || []) if (p?.id) ownPostIds.add(String(p.id));
  }
  const kit = readJson("brand/strategy.json", {});
  const settings = settingsOf(readJson("tenant.json", {}));
  const voice = [kit.voice?.summary, ...(kit.voice?.dialect_markers || []), ...(kit.voice?.hard_rules || []), ...(kit.voice?.samples || [])].filter(Boolean).join(" ");
  const gate = languageGate(settings.lang, voice);
  // the brand's internal ids: a follower-facing sentence that carries one was written for the machine
  const ids = new Set(shapeTaxonomy(kit).ok ? shapeTaxonomy(kit).ids.map((x) => x.toLowerCase()) : []);
  for (const x of [...(kit.pillars || []), ...(kit.personas || []), ...(kit.brand_associations?.items || []), ...(kit.offers || []), ...(kit.cta_library || [])]) {
    if (x?.id && /[-_]/.test(String(x.id))) ids.add(String(x.id).toLowerCase());
  }
  const lw = wordsFor(gate?.lang);
  // what the brand's own files state: a metric about the owner's audience must be in here
  const facts = [readText("brand/strategy.json"), readText("content/analytics/audience.json"), readText("CLAUDE.md"), ...memoryTexts(tenantRoot)];
  try { for (const d of readdirSync(join(tenantRoot, "library", "products"))) facts.push(readText(`library/products/${d}/product.json`)); } catch { /* optional */ }
  const transcripts = readJson("content/analytics/transcripts.json", {});
  return { own: ownKeys(tenantRoot), hits, ownPostIds, gate, ids, facts: metricValues(facts.join("\n"), lw), transcripts, maxAgeDays: settings.radar.max_age_days };
}

/* ───────────────────────── the checks ───────────────────────── */

async function checkNews(idea, snap, maxAgeDays, now, pages, fetcher, lw) {
  const url = String(idea.source_url || "");
  if (!/^https?:\/\//.test(url)) return { reason: REASONS.noSource() };
  if (isOwn(url, snap.own)) return { reason: REASONS.ownPage() };
  if (isSocial(hostOf(url))) return { reason: REASONS.socialPost(hostOf(url)) };
  if (PAID.test(pathOf(url))) return { reason: REASONS.paid() };
  const d = Date.parse(String(idea.source_date || ""));
  if (!d) return { reason: REASONS.noDate() };
  if (d > now + 2 * DAY) return { reason: REASONS.futureDate() };
  if (now - d > maxAgeDays * DAY) return { reason: REASONS.tooOld(maxAgeDays, String(idea.source_date).slice(0, 10)) };
  const evText = String(idea.evidence || "").trim().replace(/^["'«“\s]+|["'»”\s.…]+$/g, "");
  const ev = words(evText).trim().split(" ").filter(Boolean);
  if (!evText) return { reason: REASONS.noQuote() };
  if (evText.length < MIN_EVIDENCE_CHARS || ev.length < MIN_EVIDENCE_WORDS) return { reason: REASONS.shortQuote(evText.length, ev.length) };

  if (!pages.has(url)) pages.set(url, fetcher(url));
  const p = await pages.get(url);
  if (!p.ok) return { reason: REASONS.notOpened(p.status) };
  // a shortener or an open redirect must not smuggle the brand's own page (or a social post) in
  if (p.url !== url && isOwn(p.url, snap.own)) return { reason: REASONS.redirectOwn() };
  if (p.url !== url && isSocial(hostOf(p.url))) return { reason: REASONS.redirectSocial(hostOf(p.url)) };
  if (p.url !== url && PAID.test(pathOf(p.url))) return { reason: REASONS.redirectPaid() };

  const sc = pageScopes(p.html);
  const share = Math.max(sc.main.length > 400 ? quoteShare(sc.main, ev) : 0, quoteShare(sc.body, ev));
  if (share < SHINGLE_SHARE) return { reason: REASONS.quoteMissing(Math.round(share * 100)) };
  const repeats = sc.body.split(` ${ev.join(" ")} `).length - 1;
  if (repeats >= TEMPLATED_REPEATS) return { reason: REASONS.templated(repeats) };

  const date = checkPageDate(pageDate(p.html, p.url), String(idea.source_date), sc.body, now, maxAgeDays, lw);
  if (date.reason) return { reason: date.reason };
  // "what happened" is what the owner reads as the news: a name or a number the page does not carry is invented
  const off = factsOffPage(idea.what_happened, sc.body, { latinBrand: !snap.gate?.scripts, lang: snap.gate?.lang });
  if (off.length) return { reason: REASONS.factsOff(off.slice(0, 3)) };
  const cp = idea.competitor_precedent;
  if (cp && (cp.covered === true || cp.covered === "true") && String(cp.differentiator || "").trim().length < 15) return { reason: REASONS.coveredNoDifferentiator() };
  return { ok: true, sourceKey: cleanUrl(p.url), hostKey: hostOf(p.url), grounding: { final_url: p.url, date_source: date.date_source, page_date: date.page_date, quote_share: Math.round(share * 100) } };
}

const cleanUrl = (u) => { try { const x = new URL(u); return `${x.hostname.replace(/^www\./, "").toLowerCase()}${x.pathname.replace(/\/+$/, "")}`; } catch { return String(u || "").split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase(); } };
/** The post id a social permalink carries (YouTube video id, Instagram shortcode, TikTok/X status id). */
function postKey(u) {
  try {
    const x = new URL(u);
    const h = x.hostname.replace(/^www\.|^m\./, "");
    const yt = h === "youtu.be" ? x.pathname.split("/")[1] : /youtube\.com$/.test(h) ? x.searchParams.get("v") || x.pathname.match(/\/(?:shorts|live|embed)\/([^/?#]+)/)?.[1] : null;
    if (yt !== null && yt !== undefined) return yt ? `yt:${yt}` : "";
    const ig = x.pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/); if (/instagram\.com$/.test(h) && ig) return `ig:${ig[1]}`;
    const id = x.pathname.match(/\/(?:video|status)\/(\d+)/); if (id) return `${h}:${id[1]}`;
  } catch { /* not a url */ }
  return "";
}

function checkCompetitor(idea, snap, focus) {
  const cid = String(idea.competitor_id || "").trim();
  const pid = String(idea.hit_post_id || "").trim();
  const url = String(idea.source_url || "").trim();
  if (!pid && !url) return { reason: REASONS.noHit() };
  const pk = postKey(url);
  const hit = (pid && snap.hits.find((h) => String(h.post?.id) === pid))
    || (url && snap.hits.find((h) => cleanUrl(h.post?.permalink) === cleanUrl(url)))
    || (pk && snap.hits.find((h) => postKey(h.post?.permalink) === pk));
  if (!hit) {
    if (url && !isSocial(hostOf(url))) return { reason: REASONS.articleNotHit(hostOf(url)) };
    return { reason: pid ? REASONS.postNotHit(pid) : REASONS.linkNotHit() };
  }
  if (cid && cid !== hit.competitor_id) return { reason: REASONS.wrongCompetitor(cid, hit.competitor) };
  if (snap.ownPostIds.has(String(hit.post.id))) return { reason: REASONS.ownHit() };
  if (focus?.length && !focus.includes(String(hit.post.id))) return { reason: REASONS.notPicked() };
  // the whole point of a competitor idea is what THIS brand does that they did not
  if (String(idea.competitor_precedent?.differentiator || "").trim().length < 15) return { reason: REASONS.competitorNoDifferentiator() };
  return { ok: true, sourceKey: String(hit.post.id), hit };
}

/**
 * Verify a run file in place. Returns { ok, kept, dropped, checked, checked_at, run }, or ok:false when the
 * file cannot be read or parsed (the caller then fails the run CLOSED: nothing is ingested).
 *
 * Parses with the SAME extractJson the ingest uses, and rewrites the file as clean JSON. The scout's
 * untouched output goes to <run>.raw.json first, so a wrongly dropped idea can still be audited.
 *
 * opts.mode       — "radar" (news) or "competitors"
 * opts.maxAgeDays — defaults to tenant.json settings.radar.max_age_days (10)
 * opts.snapshot   — groundingSnapshot() taken BEFORE the scout ran; read now when absent (cron CLI)
 * opts.focus      — competitor mode: the post ids the owner picked; ideas on other hits are dropped
 * opts.write      — false for a dry run: nothing on disk changes
 * opts.fetcher    — tests only: stands in for the network (url → { ok, html, url, status? })
 */
export async function verifyRunFile(tenantRoot, runRel, { mode = "radar", maxAgeDays, now = Date.now(), snapshot, focus, write = true, fetcher } = {}) {
  const abs = join(tenantRoot, runRel);
  if (!existsSync(abs)) return { ok: false, kept: 0, dropped: [], reason: "run file missing" };
  const run = extractJson(readFileSync(abs, "utf-8"));
  if (!run || typeof run !== "object" || Array.isArray(run)) return { ok: false, kept: 0, dropped: [], reason: "run file is not valid JSON" };
  if (!Array.isArray(run.ideas)) return { ok: false, kept: 0, dropped: [], reason: "no ideas array" };
  const rawRel = runRel.replace(/\.json$/, "") + ".raw.json";
  if (write) writeFileSync(join(tenantRoot, rawRel), JSON.stringify(run, null, 2) + "\n");

  const snap = snapshot || groundingSnapshot(tenantRoot);
  const maxAge = maxAgeDays ?? snap.maxAgeDays ?? 10;
  const lw = wordsFor(snap.gate?.lang);
  const acceptLanguage = snap.gate?.lang && snap.gate.lang !== "en" ? `en,${snap.gate.lang};q=0.8` : "en";
  const fetchOne = fetcher || ((u) => fetchPage(u, { acceptLanguage }));
  const pages = new Map();   // one fetch per URL, however many ideas cite it
  const results = [];
  for (let i = 0; i < run.ideas.length; i += 4) {
    const batch = run.ideas.slice(i, i + 4);
    results.push(...(await Promise.all(batch.map(async (idea) => {
      if (!idea || typeof idea !== "object") return { idea: {}, reason: REASONS.unreadableIdea() };
      // the owner reads and films these: prose in another language is unusable, whatever its source
      if ([idea.text, idea.what_happened, idea.why_it_matters].some((x) => x && wrongLanguage(x, snap.gate))) return { idea, reason: REASONS.wrongLanguage(snap.gate.label) };
      const bad = unreadable(idea, snap);
      if (bad) return { idea, reason: bad };
      // a number the follower takes as a fact must be proven by the source, the hit or the brand's own files
      const cp = idea.competitor_precedent || {};
      const hitOf = mode === "competitors" ? (snap.hits || []).find((h) => String(h.post?.id) === String(idea.hit_post_id || "")) : null;
      const support = mode === "competitors"
        ? [cp.performance, idea.source_title, hitOf && JSON.stringify(hitOf.post), hitOf && snap.transcripts?.[String(hitOf.post.id)]?.text].filter(Boolean).join("\n")
        : [idea.what_happened, idea.evidence, idea.source_title].filter(Boolean).join("\n");
      const unproven = unprovenMetrics(idea, support, snap.facts || new Set(), lw);
      if (unproven.length) return { idea, reason: REASONS.unprovenNumber(unproven.slice(0, 2)) };
      const r = mode === "competitors" ? checkCompetitor(idea, snap, focus) : await checkNews(idea, snap, maxAge, now, pages, fetchOne, lw);
      return { idea, ...r };
    }))));
  }

  // One source per idea: the 3rd idea on the same page is a slate built from one link, and the 3rd on
  // the same SITE is one blog's week, not research (a run once stood 4 of 5 ideas on one blog).
  const perSource = new Map(), perHost = new Map();
  for (const r of results) {
    if (r.reason) continue;
    const n = (perSource.get(r.sourceKey) || 0) + 1;
    perSource.set(r.sourceKey, n);
    if (n > MAX_IDEAS_PER_SOURCE) { r.reason = REASONS.perSource(MAX_IDEAS_PER_SOURCE); continue; }
    if (!r.hostKey) continue;
    const h = (perHost.get(r.hostKey) || 0) + 1;
    perHost.set(r.hostKey, h);
    if (h > MAX_IDEAS_PER_HOST) r.reason = REASONS.perHost(MAX_IDEAS_PER_HOST, r.hostKey);
  }

  const at = new Date(now).toISOString();
  const kept = results.filter((r) => !r.reason).map((r) => {
    if (!r.hit) return { ...r.idea, _verified_at: at, _grounding: r.grounding };
    // a competitor idea carries the ENGINE's facts about its hit, not the model's copy of them
    const ts = r.hit.post?.timestamp || r.hit.post?.date || null;
    const n = r.hit.basis === "likes" ? r.hit.post?.likes : r.hit.post?.views;
    return { ...r.idea, source_type: "competitor", competitor_id: r.hit.competitor_id, hit_post_id: String(r.hit.post.id),
      source_title: hitTitle(r.hit.competitor, r.hit.multiplier, n, r.hit.basis),
      source_url: r.hit.post.permalink || r.idea.source_url, ...(ts && !r.idea.source_date ? { source_date: String(ts).slice(0, 10) } : {}),
      _verified_at: at, _grounding: { hit: `${r.hit.competitor} · ${r.hit.multiplier}×` } };
  });
  const dropped = results.filter((r) => r.reason).map((r) => ({
    reason: r.reason, text: String(r.idea.text || ""), url: r.idea.source_url || null,
    source_title: r.idea.source_title || null, source_date: r.idea.source_date || null, evidence: r.idea.evidence || null,
    ...(r.idea.competitor_id ? { competitor_id: r.idea.competitor_id } : {}), ...(r.idea.hit_post_id ? { hit_post_id: r.idea.hit_post_id } : {}),
    shape_id: r.idea.shape_id || null,
  }));
  run.ideas = kept;
  run.verification = { checked_at: at, mode, checked: results.length, kept: kept.length, dropped, raw_file: rawRel };
  if (write) writeFileSync(abs, JSON.stringify(run, null, 2) + "\n");
  return { ok: true, kept: kept.length, dropped, checked: results.length, checked_at: at, run };
}
