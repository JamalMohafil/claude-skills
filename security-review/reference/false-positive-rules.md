# False-positive filtering — apply to EVERY candidate finding

This is Pass 2. For each candidate from Pass 1, your job is to **try to disprove it**. You do not
need to run or reproduce anything — read the code and reason about whether untrusted input can
really reach the sink. **Do not** modify files during review.

Work through: **Hard exclusions → Precedents → Signal-quality → Confidence score.** Anything that
hits a hard exclusion is dropped immediately. Anything scoring **below 8/10** is dropped.

---

## HARD EXCLUSIONS — automatically drop findings that match

1. **Denial of Service (DoS)** or resource-exhaustion attacks — even if they can disrupt service.
2. **Secrets/credentials stored on disk** when they are otherwise secured (handled by other
   processes). *(Note: a secret **hardcoded in the source diff** is still a finding — that's
   different from "stored at rest by design".)*
3. **Rate-limiting** concerns or service-overload scenarios.
4. **Memory / CPU exhaustion** issues.
5. **Missing input validation on non-security-critical fields** without a proven security impact.
6. **Input-sanitization in CI/GitHub-Action workflows** unless clearly triggerable by untrusted input.
7. **Lack of hardening.** Code isn't expected to implement every best practice — only flag concrete
   vulnerabilities, not "could be more defensive".
8. **Theoretical race conditions / timing attacks.** Only report a race if it's concretely,
   practically exploitable.
9. **Outdated third-party dependencies.** Managed separately — do not report here.
10. **Memory-safety issues** (buffer overflow, use-after-free) in memory-safe languages (Rust, Go,
    Java, Python, JS, …) — impossible there; don't report.
11. **Files that are only tests** or only used to run tests.
12. **Log spoofing.** Writing un-sanitized user input to logs is not, by itself, a vulnerability.
13. **SSRF that only controls the path.** SSRF counts only if it can control the **host or protocol**.
14. **User-controlled content in AI/system prompts** is not a vulnerability.
15. **Regex injection** (injecting untrusted content into a regex) is not a vulnerability. **ReDoS**
    (regex denial of service) is also excluded.
16. **Findings in documentation** files (Markdown, etc.). And: **lack of audit logs** is not a
    vulnerability.

---

## PRECEDENTS — how to judge the tricky cases

1. Logging **high-value secrets in plaintext** = finding. Logging **URLs** = safe.
2. **UUIDs** can be assumed unguessable; they don't need validation.
3. **Environment variables and CLI flags are trusted.** Any attack that relies on the attacker
   controlling an env var or flag is invalid.
4. **Resource leaks** (memory/file-descriptor) are not valid findings.
5. Subtle/low-impact web bugs — **tabnabbing, XS-Leaks, prototype pollution, open redirects** —
   only if *extremely* high confidence.
6. **React and Angular are XSS-safe by default.** Do not report XSS in React/Angular/`.tsx` unless
   it uses `dangerouslySetInnerHTML`, `bypassSecurityTrustHtml`, or similar unsafe escapes.
7. **Most GitHub-Action-workflow vulns aren't exploitable in practice.** Require a concrete, very
   specific attack path before flagging one.
8. **Client-side JS/TS lacking authz/authentication is not a vulnerability** — client code is
   untrusted and these checks belong on the server. Likewise, any flow that sends data to the
   backend: the **backend** is responsible for validating/sanitizing it.
9. Include a **MEDIUM** finding only if it's an obvious, concrete issue.
10. **Notebooks (`.ipynb`)** — most vulns aren't practically exploitable; require a concrete path
    where untrusted input triggers it.
11. **Logging non-PII data is not a vulnerability** even if it seems sensitive. Only report logging
    that exposes secrets, passwords, or PII.
12. **Command injection in shell scripts** is usually not exploitable (shell scripts rarely take
    untrusted input). Only flag with a concrete untrusted-input path.

---

## SIGNAL-QUALITY CRITERIA — for everything that survived

Ask, for each remaining finding:

1. Is there a **concrete, exploitable** vulnerability with a **clear attack path**?
2. Is it a **real security risk** vs. a theoretical best-practice?
3. Are there **specific code locations** and reproduction steps?
4. Would a security team find it **actionable**?

---

## CONFIDENCE SCORE (1–10) — and the cut line

- **1–3:** low confidence — likely false positive / noise.
- **4–6:** medium confidence — needs investigation.
- **7–10:** high confidence — likely a true vulnerability.

**Keep only findings scoring ≥ 8.** (This is the same bar as the official command's "> 0.8"
confidence / two-pass sub-agent filter.) When you are on the fence, **cut it** — a missed
theoretical issue is far cheaper than a false positive that erodes trust in the review.
