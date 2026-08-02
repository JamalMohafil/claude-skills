# Report format — markdown only

Output **only** the markdown report (no preamble, no "here is your review"). Order findings by
severity (HIGH first, then MEDIUM). Include a short summary line at the top.

## Per-finding shape

Each finding is a section titled `Vuln N: CATEGORY: \`file:line\`` followed by these exact fields:

```markdown
# Vuln 1: sql_injection: `app/api/search.py:42`

- **Severity:** High
- **Confidence:** 0.95
- **Description:** User input from the `q` query parameter is interpolated directly into a SQL
  string with an f-string, so query syntax is attacker-controlled.
- **Exploit Scenario:** A request to `/search?q=1%27%20OR%20%271%27%3D%271` (`1' OR '1'='1`) returns
  every row; `'; DROP TABLE users;--` or a UNION payload lets an attacker read/modify arbitrary
  data in the database.
- **Recommendation:** Use a parameterized query — pass `q` as a bound parameter
  (`cursor.execute("… WHERE name = %s", (q,))`) or the ORM's query builder so the value never
  becomes SQL. Example:
  ```python
  cursor.execute("SELECT id, name FROM items WHERE name = %s", (q,))
  ```
```

Fields, in order:

- **Title:** `Vuln N: <category>: ` then the `file:line` in backticks. Category is a short slug
  like `sql_injection`, `command_injection`, `xss`, `idor`, `auth_bypass`, `ssti`, `path_traversal`,
  `insecure_deserialization`, `ssrf`, `hardcoded_secret`, `weak_crypto`, `sensitive_data_exposure`.
- **Severity:** `High` / `Medium` (see guide below). Only High and Medium ship.
- **Confidence:** a number 0.0–1.0 (must be ≥ 0.8 to appear).
- **Description:** one or two sentences — *what* is wrong and *why* it's exploitable.
- **Exploit Scenario:** a concrete attack — a real payload/request and the resulting impact.
- **Recommendation:** the concrete fix, ideally with a small corrected code snippet that matches
  the project's existing secure pattern.

## Severity guide

- **HIGH:** directly exploitable → RCE, data breach, authentication/authorization bypass, secret
  disclosure. Also: high-impact bugs even if only reachable from the local network.
- **MEDIUM:** real vulnerability that needs specific conditions, or meaningful info exposure.
  Include only if obvious and concrete.
- **LOW:** defense-in-depth / low impact — **do not report** (noise).

## Top-of-report summary

Start with one line, e.g.:

```markdown
**Security review** — scope: pending changes on `feature/x` (7 files). Findings: 1 High, 1 Medium.
```

## The empty (good) result

If nothing survives the filter:

```markdown
✅ **No high-confidence, newly-introduced vulnerabilities found.**
Scope: <what was reviewed>. This does not guarantee the code is free of all bugs — it means no
concrete, exploitable issue met the confidence bar in the changed code.
```

Never invent findings to fill the report. An empty report is a legitimate, valuable outcome.
