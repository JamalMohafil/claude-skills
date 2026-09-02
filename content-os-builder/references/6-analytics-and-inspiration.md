# Reference 6 — Analytics (your accounts) + Inspiration (competitors) + Transcription

The "never open Instagram/YouTube again" layer: every post with its real numbers, comments, inline playback, click-to-transcribe, and a competitor library you can study.

Everything below was **verified against the live APIs**. The ⚠️ notes are traps that cost real debugging time — honor them or you'll ship the same bugs.

---

## 6a. Credentials (ask in the interview, store in `.env.local`)

`content-os/app/.env.local` — **local only, `chmod 600`, and add `.env*.local` to `.gitignore`.** Tell the user to rotate any key they paste into a chat.

```
META_APP_ID=        META_APP_SECRET=        META_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=   FACEBOOK_PAGE_ID=
YOUTUBE_API_KEY=    YOUTUBE_CHANNEL_ID=
OPENAI_API_KEY=
```

**Instagram gate:** requires a **Business/Creator** account linked to a Facebook Page + a Meta app. A personal IG account cannot use the API at all — check this before promising the feature.

Required scopes: `instagram_basic`, `instagram_manage_comments`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `read_insights`.

⚠️ **Tokens from the Graph Explorer expire in ~2 hours.** Always exchange for a 60-day long-lived token immediately and store THAT:
```
GET /oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<SECRET>&fb_exchange_token=<SHORT>
```
Validate any token with `/debug_token` first — `is_valid`, `expires_at`, and `scopes`. A dead token reports *"session is invalid because the user logged out."* Surface that as a clear, actionable message, never a silent empty grid.

---

## 6b. Instagram — your own posts

**List:** `GET /{ig-user-id}/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=100`
Page with `paging.cursors.after` until you have everything (a 275-post account = 3 calls).

**Insights per post** — the metric list differs by media type. These are the exact sets the API accepts (probed one-by-one; anything else 400s):
```
REELS: views, reach, likes, comments, saved, shares, total_interactions,
       ig_reels_avg_watch_time, ig_reels_video_view_total_time      (watch times are in ms → /1000)
FEED (IMAGE/VIDEO/CAROUSEL_ALBUM): views, reach, likes, comments, saved, shares,
       total_interactions, profile_visits, profile_activity, follows
```

⚠️ **Never fetch insights one post at a time.** 275 posts = 275 HTTP calls (minutes). Use the **Graph batch API** — 50 sub-requests per POST to `https://graph.facebook.com/v21.0/`:
```json
{ "access_token": "...", "include_headers": false,
  "batch": [ { "method": "GET", "relative_url": "<mediaId>/insights?metric=views,reach,..." }, ... ] }
```
Read each sub-result's `code` (skip non-200 — old posts legitimately have no insights) and `JSON.parse(body)`. **Measured: 275 posts in ~68s cold.**

⚠️ **Never let an insights value of `0` overwrite the real `like_count` / `comments_count` from the media list.** Some posts return `comments: 0` in insights while genuinely having thousands. Guard: `else if (row.name === "comments" && v) post.comments = v;` — this exact bug made comment counts vanish across a whole account.

**Cache + incremental refresh:** persist to `content-os/analytics/instagram-posts.json`. On refresh, reuse insights for posts already cached and only batch-fetch the *new* ones. **Measured: 68s cold → 4s warm.**

**Comments:** `GET /{media-id}/comments?fields=id,text,username,timestamp,like_count&limit=50`

---

## 6c. Instagram — audience (ACCOUNT level only)

⚠️ **Per-post audience does not exist.** `GET /{media-id}/insights?metric=reach&breakdown=follow_type` returns
`(#100) Incompatible breakdowns (follow_type) for metric (reach)`. Do not promise it.

Account demographics DO work:
```
GET /{ig-user-id}/insights?metric=follower_demographics&period=lifetime
    &metric_type=total_value&timeframe=this_month&breakdown=age|gender|city|country
```
Read `data[].total_value.breakdowns[].results[]` → `{dimension_values[0], value}`.

⚠️ **UX rule learned the hard way:** never render account-level demographics inside a single post's window. A user saw "24.2K ذكور" in a 4K-view video's panel and reasonably concluded the numbers were broken. **Give audience its own top-level tab**, with an explicit line like *"هي أرقام حسابك كامل، مش أرقام بوست معيّن."*

---

## 6d. Instagram — competitors (`business_discovery`)

The only way to read another account (must also be Business/Creator):
```
GET /{my-ig-id}?fields=business_discovery.username(THEIR_NAME){
      username,name,followers_count,media_count,profile_picture_url,
      media.limit(50){id,caption,media_type,media_product_type,media_url,
                      thumbnail_url,permalink,timestamp,like_count,comments_count,view_count}}
```

⚠️ **`view_count` is the ONLY view metric available for other accounts.** `play_count`, `views`, `impressions`, `reach`, `video_view_count` are all silently ignored (they return nothing rather than erroring — easy to miss). `view_count` is present on Reels, absent on photos.

⚠️ **Pagination — the single nastiest bug in this whole layer.** Page with `media.limit(50).after(CURSOR)`. The paging object contains **`cursors` ONLY — there is no `next` key**. Code like `if (!after || !paging.next) break;` silently caps every competitor at exactly 50 posts. Break only on: no `after` cursor, or a short page (`batch.length < PER`).

Competitor totals: `media_count` is the account's real total — show "محمّل 300 من 376". ⚠️ It can *undercount* (one account reported 172 while returning 300 real unique posts), so trust the loaded count and treat the total as a hint.

**Deep history:** big accounts have thousands of posts (4,239 seen). Don't fetch it all in one request. Fetch ~300, **store the `after` cursor on the competitor**, and expose a "load 300 older" button that continues from it and appends (dedupe by id — verified zero overlap between batches).

Competitor ER: only `(likes + comments) / views` is computable — their reach is private.

---

## 6e. YouTube

- **My/competitor videos:** `channels?part=contentDetails&id=` → `relatedPlaylists.uploads` → page `playlistItems` (50/page, `nextPageToken`) → `videos?part=snippet,statistics,contentDetails&id=` in **chunks of 50 ids**. 256 videos ≈ 3s.
- **Comments:** `commentThreads?part=snippet&videoId=&order=relevance`. Wrap in try/catch — comments can be disabled.
- **Resolve a channel** from `@handle` / URL / `UC…` id: try `channels?forHandle=`, then `search?type=channel`.
- Classify Shorts by duration (`contentDetails.duration` ISO8601 ≤ 60s).
- Private analytics (watch time, retention, CTR, traffic sources) needs the **YouTube Analytics API + channel OAuth** — a separate consent flow. Public stats need only the API key.

---

## 6f. Transcription — ON CLICK, never automatic

Users don't want (or want to pay for) auto-transcribing everything. Transcribe only when asked, cache to `content-os/analytics/transcripts.json`, and badge already-transcribed items.

**YouTube — free path first.** ⚠️ Direct server-side `timedtext` fetches are **blocked by YouTube now** (returns 0 bytes even though `captionTracks` is right there in the watch-page HTML — a very convincing dead end). Use **`yt-dlp`**:
```
yt-dlp --write-auto-sub --write-sub --sub-langs "ar.*" --skip-download --sub-format vtt --no-warnings -o <dir>/c <url>
```
⚠️ **Ignore yt-dlp's exit code — check for produced files.** It exits non-zero when *one* requested language 429s even though the language you wanted downloaded fine. Wrap in try/catch, then `readdirSync` for `*.vtt`. Request one language first, retry broader if nothing lands.

⚠️ **VTT needs real cleaning.** Auto-captions repeat every line in a rolling window and carry inline `<00:00:01.234><c>` word tags. Strip tags, drop `WEBVTT`/`Kind:`/`Language:`/cue-timing/index lines, drop consecutive duplicates, then collapse lines where one is a prefix of the next. Verified: produces clean Arabic prose.

**OpenAI fallback + Instagram.** IG `media_url` is a direct mp4 → download and POST to `/v1/audio/transcriptions` with `model=gpt-4o-transcribe`, `response_format=text`. For YouTube without captions, extract audio with `yt-dlp -f bestaudio -x --audio-format mp3` and send that. ⚠️ **OpenAI caps uploads at 25MB** — check `buf.length` and fail with a clear message rather than a 413.

Run transcription as a **background job keyed by media id** (see reference 3) so it survives navigation and several can run.

---

## 6g. Inline playback

- **YouTube:** `<iframe src="https://www.youtube.com/embed/{id}?rel=0&modestbranding=1" allowfullscreen>` — works for your videos and competitors', no auth.
- **Instagram:** `<video controls playsInline poster={thumb} src={media_url}>` — verified `HTTP 206 video/mp4` for both your posts and competitors'.
- ⚠️ **IG CDN URLs are signed and expire**, so cached links eventually fail. Add `onError` → hit a `/api/media?id=…[&handle=…]` route that returns a **fresh** `media_url` (own posts: `GET /{media-id}?fields=media_url`; competitors: re-run `business_discovery` and match the id), then retry once. If it still fails, show an "open in Instagram" link — never a broken black box.
- Photos/carousels have no video: render the image instead.

---

## 6h. UI rules for this layer (each one is a bug we shipped and fixed)

- ⚠️ **Infinite scroll: key the "reset" effect on a VALUE, not the array identity.** Callers do `[...posts].sort(...)`, creating a new array every render — an effect with `[posts]` as its dep resets the page count forever and the grid can never grow past the first page. Use `` `${len}:${first.id}:${last.id}` ``. Attach the IntersectionObserver via a **callback ref** so it re-attaches when the sentinel remounts, and always ship a manual **"load more"** button as a fallback.
- **Render in chunks of ~24**, `loading="lazy"` on thumbnails. 275 posts at once tanks scrolling.
- ⚠️ **Tabs, not a wall.** A post window with performance + engagement + audience + comments + transcript stacked is unreadable. Pin the player/caption/headline numbers, then tab: **الأداء · التفاعل · التعليقات (n) · التفريغ**.
- **Compare every metric to the account average** (▲/▼ % + a bar). "4,013 views" means nothing alone; "▲ 32% vs your average" is the actual insight.
- **Show the full publish date incl. year** (+ relative "من ٣ شهور"). Competitor catalogs span years — "1 مارس" is useless.
- **Hide a metric that genuinely doesn't exist** (e.g. views on a photo) with a short explanation instead of rendering `—`, so a platform limit never reads as a bug.
- Sort options that earn their place: الأحدث / الأكثر مشاهدة / الأعلى تفاعل.

---

## 6i. Routes to generate

`/api/analytics?platform=&refresh=` (cached list) · `/api/analytics/detail?platform=&id=` (comments + saved transcript) · `/api/audience?refresh=` (account demographics) · `/api/inspiration` (competitor CRUD; `?id=&refresh=1` re-pull, `&more=1` append older) · `/api/media?id=&handle=` (fresh playable URL) · `/api/transcribe` (POST start / GET poll, background job).

All `runtime="nodejs"`, `dynamic="force-dynamic"`, no-store, try/catch → serve stale cache with an `error` field rather than an empty screen.
