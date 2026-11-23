# Deploy and watch the live system

Read this before the first deploy, and whenever a slice touches the build, env vars,
infrastructure, credentials or an integration.

Why: in one real build, features worked on every machine but the server. The build dropped an
env var; a worker image could not load a library it needed; a provider key was broken for a
week while the app quietly fell back to another provider; a token swap broke a messaging
channel for days; deploys caused downtime; and parallel agents polling over SSH got everyone
locked out by the firewall. Nothing told the human; he found each one by using the product.

## 1. Know what is live

- Expose the deployed commit (a `/version` or `/health` endpoint that returns the git sha and
  build time). Status claims check it.
- Keep one deploy log: when, which commit, who, result. HANDOFF points to it.

## 2. Deploy without downtime, and prove it

Deploys once caused downtime until a zero-downtime deploy plus a request probe proved it (0
failed out of 8,100 requests).

- Start the new version next to the old one, wait for its health check, switch traffic, then
  drain and stop the old one (blue-green, rolling replicas, or your platform's equivalent).
- **Prove it with a request probe** that runs during the deploy and counts failures:

```sh
# probe.sh URL SECONDS: hit URL repeatedly; print totals; exit 1 on any failure
url=$1; end=$(( $(date +%s) + ${2:-120} )); ok=0; bad=0
while [ "$(date +%s)" -lt "$end" ]; do
  code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$url")
  case $code in 2*|3*) ok=$((ok+1));; *) bad=$((bad+1)); echo "fail: $code";; esac
  sleep 0.1
done
echo "ok=$ok failed=$bad"; [ "$bad" -eq 0 ]
```

  Run it in the background, deploy, then read its result. Any failure means the deploy is not
  zero-downtime yet.
- Boot each built image and run **one real job** inside it before switching traffic. A worker
  image once could not import its browser library, every job failed in production, and the
  read-only filesystem blocked a hot fix.

## 3. Declare every env var in the build pipeline

A build tool's strict env mode silently dropped a variable, and an embedded panel was refused
in production only. Add a check that fails when code reads a variable the pipeline does not
declare. An untested sketch for a Node monorepo; adapt the grep and the declaration file to your
stack:

```sh
# env-check.sh: every process.env.X read in src/ must be declared in the build config
declared=$(cat turbo.json .env.example 2>/dev/null | grep -oE '[A-Z][A-Z0-9_]{2,}' | sort -u)
used=$(grep -rhoE 'process\.env\.[A-Z][A-Z0-9_]+' --include='*.ts' --include='*.tsx' apps packages \
       | sed 's/process\.env\.//' | sort -u)
missing=$(comm -23 <(printf '%s\n' "$used") <(printf '%s\n' "$declared"))
[ -z "$missing" ] || { echo "Env vars read but not declared in the build:"; echo "$missing"; exit 1; }
```

(`<( )` needs bash.) Test the check against a file with a planted undeclared variable: a broken
pattern looks exactly like a clean repo.

## 4. Live journeys after every deploy and every night

The browser journeys from `verification.md`, pointed at the live URL:

- **After every deploy** and **every night**, from a scheduled job on a machine that holds the
  test keys. CI usually holds no production keys by design, so run them on the server (a
  systemd timer or cron) or a trusted runner.
- About 12–15 journeys cover the paths a user takes most: sign in, the core action, the
  integrations (a real message from a test account gets a reply, a voice note gets a
  transcript, an upload can be read back, the embedded panels open).
- Desktop and phone sizes.
- Test data is marked by fixed IDs, creates no leads, alerts or bills, and journeys stop before
  anything irreversible (publish, pay, message a real customer).
- **A failed journey caused by our own code rolls the deploy back. A failed provider only sends
  an alert** (you can't roll back someone else's outage).
- Nightly failures message the human somewhere they actually read.

## 5. Health and key checks, with alerts

A broken key once went unnoticed for a week because the app fell back silently.

- A scheduled check (every 15–60 minutes) calls `/health` and, per provider, one **free** call
  (whoami, quota, list), and reads each integration's status for the real account
  (configured, connected, last success).
- **Every fallback logs and alerts.** Falling back is fine; doing it silently is not.
- **After any credential change,** send one real request through that integration from a test
  account before calling the change done.
- Test the alert path itself once: break a test key on purpose and confirm the alert arrives.

## 6. Let agents read the live system

Give the fixing agent the live logs, the error tracker and the version endpoint (read-only), so
it debugs from what happened instead of guessing. Where you can, give each worktree its own
logs, metrics and traces, so an agent can see what its change did.

## 7. SSH from agents: one multiplexed connection

A firewall that rate-limits new SSH connections (about 6 per 30 seconds in one setup) locked
everyone out when polling loops and parallel agents each opened their own.

```sshconfig
# ~/.ssh/config
Host app-server
  HostName <server>
  User <user>
  ControlMaster auto
  ControlPath ~/.ssh/cm-%r@%h:%p
  ControlPersist 10m
```

Open the master once (`ssh -fN app-server`); every later `ssh app-server ...` reuses it.
Never poll with fresh connections in a loop; poll inside one remote command
(`ssh app-server 'for i in $(seq 60); do ...; sleep 5; done'`). Match processes with
`ps -eo args | grep "[n]ame"`, not `pgrep -f`, inside remote commands, and pass SSH options as
arrays in zsh.

## 8. Rules for agents touching production

- Deploy only what is committed, from a clean checkout of that commit.
- Watchers and deploy waiters are time-bounded and idempotent (`multi-agent.md`).
- Money, publishing, customer messages and destructive data changes need the human's explicit
  yes for that action.
- After a deploy: probe result, journeys result, version endpoint shows the new sha. All three
  go in the proof pack.
