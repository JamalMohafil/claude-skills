# Reference 11: CRM and partners (Stage 10, optional, for service businesses)

The `crm` module is for a tenant that sells services: an agency's own workspace, a consultant. It
tracks leads → calls → clients → payments, and computes the funnel numbers. A content-only tenant leaves
it off, and the chat's CRM paragraph disappears along with it.

```
src/lib/crm-core.mjs             contacts, calls, the Cal.com sync, computed metrics (zero deps)
api/[tenant]/crm/route.ts        GET (a month view) · POST {action}
src/views/crm.tsx
<tenant>/work/crm/contacts.json  {contacts: Contact[]}
<tenant>/work/crm/calls.json     {synced_at, calls: Call[]}
<tenant>/work/partners/<slug>.md partner businesses (files starting with "_" are ignored)
<tenant>/.env.local              CAL_API_KEY (an ACCOUNT key: never inherited from the engine env)
```
`work/crm/**` is write-denied to every agent; only the CRM route writes it. The chat agent READS it to
answer questions like "who pays what", "what did this client ask for", "what is still to deliver" or
"calls this month".

## 1. The data

```jsonc
// work/crm/contacts.json
{ "contacts": [ {
  "id": "<uuid>", "name": "", "company": "", "email": "<lowercased, validated>", "phone": "", "source": "",
  "stage": "lead|qualified|call_booked|showed|won|lost", "notes": "",
  "stage_history": [ { "from": "", "to": "", "at": "ISO", "by": "cal.com?" } ],          // ≤50
  "won_at": "ISO?", "lost_at": "ISO?",
  // the client record (stage won)
  "service": "", "monthly_fee": 0, "setup_fee": 0, "currency": "<settings.crm.currency>", "start_date": "YYYY-MM-DD|null",
  "client_status": "active|paused|ended", "specs": "<markdown ≤20k>",
  "requirements": [ { "text": "", "done": false } ],                                   // ≤100
  "payments": [ { "date": "YYYY-MM-DD", "amount": 0, "note": "" } ],                    // ≤500, amount > 0
  "created_at": "ISO", "updated_at": "ISO" } ] }

// work/crm/calls.json
{ "synced_at": "ISO|null", "calls": [ {
  "id": "cal-<uid>|manual-<uuid>", "source": "cal.com|manual", "title": "", "start": "ISO", "end": "ISO",
  "status": "accepted|cancelled|rejected|pending|…", "no_show": false,
  "attendee": { "name": "", "email": "" }, "event": "<event-type slug>", "booked_at": "ISO|null",
  "override": "showed|no_show|cancelled?" } ] }
```

## 2. `crm-core.mjs`

- `clean(input, prev)`: a field whitelist, trimming, length caps, numbers ≥0 rounded to cents, dates as
  `YYYY-MM-DD`, enums validated. A new client's `currency` defaults to `settings.crm.currency` (tenant.json);
  when that is unset, the contact editor asks for one instead of assuming.
- `addContact` (a name is required; a duplicate email is refused; the default stage is `lead`; won →
  `won_at` + `client_status: active`), `updateContact` (a stage change appends history; the first win
  sets `won_at`; lost sets `lost_at`), `deleteContact`.
- Writes are atomic (temp + rename), with **one promise-chain lock per file** on `globalThis.__crmLocks`.
- `outcomeOf(call, now)`: the owner's `override` first → cancelled/rejected → `cancelled` → pending →
  `pending` → in the future → `upcoming` → otherwise `no_show` if flagged, else `showed`.
- `setCallOverride(id, "showed"|"no_show"|"cancelled"|null)` and `addManualCall({start, title?, name?, email?})`.
- **`syncCal(root, apiKey, {fetchImpl, maxPages = 40})`**: `GET https://api.cal.com/v2/bookings?take=100&cursor=…`
  with `Authorization: Bearer <key>` and the API-version header the bookings docs require (check the
  current docs). A 401 or 403 → "key rejected". Follow `pagination.nextCursor` until it is null or
  `hasMore === false`.
  - Merge by `cal-<uid>`: title, times, status, `no_show` (every attendee marked absent), the first
    attendee, the event slug, `booked_at`, and **keep the owner's existing `override`**.
  - Then contacts: every attendee with an email becomes a contact (stage `showed` if the call showed,
    `call_booked` otherwise, `lead` if cancelled; source `cal.com`). **An existing contact only moves
    FORWARD** (rank lead 0, qualified 1, call_booked 2, showed 3, won 4), and `lost` is never touched.
  - Returns `{bookings, added, contacts_created, synced_at}`.
- **`metrics(root, "YYYY-MM", now)` is COMPUTED on every read, never stored**, so the numbers can't drift:
  - `leads` = contacts created in the month; `qualified` = of those, stage rank ≥ qualified (lost
    excluded); `qualified_pct`
  - `booked_calls` = calls whose `booked_at` (else `start`) is in the month, not cancelled
  - `calls_held` = calls starting in the month with outcome showed or no_show; `showed`;
    `show_up_pct = showed / held`
  - `won` = contacts won in the month; `closing_pct = won / showed`
  - `upcoming_calls`; `mrr` = Σ `monthly_fee` of won + active clients; `active_clients`;
    `collected` = Σ payments dated in the month
  - Percentages have one decimal and are `null` when the denominator is 0 (never a fake 0%).
- `calConnected(env)`; `saveCalKey(root, key)` rewrites **the tenant's** `.env.local`, keeping every
  other line, adds or removes `CAL_API_KEY`, and sets mode 0600.

## 3. `/api/[tenant]/crm` (module `crm`)

- `GET ?month=YYYY-MM` → `{month, metrics, trend (the 6 months ending at month), contacts, calls (with
  outcome), cal:{connected, synced_at, syncing}, partners:[{slug, name, body, updated}]}`. If Cal.com is
  connected, the last sync was >15 minutes ago and none is in flight, start a **background** sync
  (deduped per tenant on a `globalThis` Map). The page never waits on the provider.
- `POST {action}`: `add_contact` · `update_contact` · `delete_contact` · `call_override` · `add_call` ·
  `sync` (409 if not connected; it awaits any in-flight sync first) · **`cal_key {key}`** (empty =
  disconnect; a non-empty key must match the provider's key format and is **proven by a real one-page
  sync before saving**, returning 422 with the provider's message on failure; **the key is never echoed
  back**) · `partner_save {slug?, name, body}` (slug `^[a-z0-9][a-z0-9-]{0,60}$` or derived from the name;
  the body gets `# <name>` if it doesn't start with a heading) · `partner_delete {slug}`. Errors → 409
  `{error}`.

## 4. The CRM view

A month switcher; **five number cards** (leads + qualified count · qualified % · booked + upcoming ·
show-up % with "x of y" · closing % + new clients); a money row (MRR, collected this month, active
clients) with 6-month mini bars; the Cal.com panel (not connected: where to create the key, a password
input, and «connect», which says "testing the key…"; connected: status, last sync, «sync now»,
«disconnect»); and tabs:
- **Clients**: cards with status, start date, name and company, service, monthly fee, collected, and
  requirements done/total.
- **Leads**: kanban columns (lead, qualified, call_booked, showed, lost) with an inline stage select.
- **Calls**: a manual-add row; upcoming vs past; showed/no-show override pills plus «auto» reset; an
  "edited by you" marker.
- **Partners**: markdown cards with an editor, delete, and "tell the assistant about them".

The contact editor modal: base fields + stage; when the stage is won, the service, fees, currency,
start date, client status, a specs markdown editor, a requirements checklist (Enter adds) and a
payments list.

## 5. Partners memory (`work/partners/<slug>.md`)

Other businesses the owner works with, or describes to the assistant. The chat agent writes (and later
updates the same file) `# <name>`, who they are, their services (prices only if stated), their
clients, and how the two could work together, **only from what the owner said**. Asked "what could we
offer together?", it reads every partner file plus this business's offers and proposes concrete
combined offers (who sells, who delivers, which client it fits), and **never invents a service either
side lacks**. Partner files are private.

## 6. Lessons

- **The numbers are computed, never stored.**
- **A sync never overwrites the owner's override and never moves a contact backwards.**
- **Prove a key before saving it**; store it 0600 in the tenant's file; never echo it.
- **Account keys are never inherited** from the engine env.
- **The provider sync runs in the background** from the page load, at most every 15 minutes.

## Checkpoint

Add a lead, move it through the stages, mark it won with a fee and a payment: the five numbers and the
MRR change accordingly, and percentages with a zero denominator show "—", not 0%. Connect a wrong Cal.com
key → 422 with the provider's message and nothing saved. Ask the assistant "who are my active clients
and what do they pay?" → it answers from the files. Ask it to change a fee → it explains that changes
go through the CRM page.
