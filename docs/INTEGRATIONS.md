# Channel Integrations

Content Hub pulls performance metrics and (eventually) publishes content through three providers. Each provider has a different developer programme, approval path, and refresh-token lifecycle. This document is the canonical setup guide.

Once integration is complete you should:

1. Have OAuth credentials in `.env`.
2. Persist per-brand access tokens in your DB, keyed by `brandId + platform`.
3. Have a server function per platform that returns a normalised `PlatformMetrics` shape:

```ts
interface PlatformMetrics {
  platform: "Instagram" | "Threads" | "Facebook" | "LinkedIn" | "X";
  followers: number;
  reach: number;
  impressions: number;
  engagement: number;
  engagementRate: number;
  clicks: number;
  growthPct: number;
  topPost?: { id: string; title: string; permalink: string };
}
```

The UI in `src/routes/performance.tsx` consumes that shape, so the moment a server function returns it the dashboard fills in.

---

## 1. Meta — Instagram + Threads + Facebook

All three Meta surfaces share the same Graph API and the same access-token model. You only need to register **one** Meta App.

### App registration

1. Go to <https://developers.facebook.com/apps/> → **Create app** → **Business** type.
2. Add the following products:
   - **Facebook Login for Business** (the only currently-supported login flow)
   - **Instagram** → **Instagram API with Instagram Login** (or **Instagram API with Facebook Login** if the brand's IG account is linked to an FB Page)
   - **Threads API**
   - **Pages API**
3. In **App Review → Permissions and Features**, request:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts` *(only if publishing — not needed for read-only metrics)*
   - `read_insights`
   - `instagram_basic`
   - `instagram_manage_insights`
   - `instagram_content_publish` *(publishing only)*
   - `threads_basic`
   - `threads_read_replies`
   - `threads_manage_insights`
   - `business_management`
4. Submit App Review with screen recordings of your OAuth flow + use cases.
   - Expect **2–4 weeks** for advanced access. Without it you're limited to App-roled testers.

### `.env` additions

```bash
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=https://your-domain/auth/meta/callback
```

### OAuth flow (server-side)

1. Build the dialog URL:
   ```
   https://www.facebook.com/v21.0/dialog/oauth
     ?client_id=$META_APP_ID
     &redirect_uri=$META_REDIRECT_URI
     &scope=pages_show_list,pages_read_engagement,read_insights,instagram_basic,instagram_manage_insights,threads_basic,threads_manage_insights,business_management
     &state=<brandId>
     &response_type=code
   ```
2. On callback, exchange `code` for a short-lived user token:
   `GET /v21.0/oauth/access_token?client_id=…&redirect_uri=…&client_secret=…&code=…`
3. Exchange short-lived → long-lived (60-day) user token:
   `GET /v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=…&client_secret=…&fb_exchange_token=…`
4. List Pages the user manages, take a **Page access token** (these are non-expiring for most apps):
   `GET /v21.0/me/accounts`
5. For each Page, fetch the linked **Instagram Business Account ID**:
   `GET /v21.0/{page-id}?fields=instagram_business_account`
6. For Threads, the user has to authorise the **Threads API** specifically — Threads tokens are issued per Threads user via the separate Threads OAuth dialog at `https://threads.net/oauth/authorize`. Store the Threads user ID + token alongside the Page token.

Store per brand:
```
brandId, metaPageId, metaPageAccessToken, igUserId, threadsUserId, threadsAccessToken, expiresAt
```

### Metric endpoints

**Facebook Page**
```
GET /v21.0/{page-id}/insights
  ?metric=page_impressions,page_post_engagements,page_fans,page_post_engagements_unique
  &period=week
  &access_token={page-token}
```
Use `page_fans` for followers, `page_impressions` for impressions, etc.

**Instagram Business**
```
GET /v21.0/{ig-user-id}?fields=followers_count,follows_count,media_count
GET /v21.0/{ig-user-id}/insights
  ?metric=impressions,reach,profile_views,website_clicks,accounts_engaged
  &period=week
  &metric_type=total_value
  &access_token={page-token}
GET /v21.0/{ig-user-id}/media?fields=id,caption,permalink,insights.metric(impressions,reach,engagement,saved)
```

**Threads**
```
GET https://graph.threads.net/v1.0/{threads-user-id}/threads
  ?fields=id,permalink,timestamp,text
  &access_token={threads-token}
GET https://graph.threads.net/v1.0/{thread-id}/insights
  ?metric=views,likes,replies,reposts,quotes
GET https://graph.threads.net/v1.0/{threads-user-id}/threads_insights
  ?metric=views,likes,replies,reposts,quotes,followers_count
```

### Rate limits

- **200 calls/hour/user** on the Graph API. Cache aggressively — write a nightly cron that snapshots metrics into your DB and serve the UI from those snapshots.
- Threads has its own bucket — same order of magnitude.

---

## 2. LinkedIn

### App registration

1. <https://www.linkedin.com/developers/apps> → **Create app** (must be associated with a LinkedIn **Company Page** the developer admins).
2. Under **Products**, request access to:
   - **Sign In with LinkedIn using OpenID Connect** (for the basic OAuth flow)
   - **Share on LinkedIn** (publishing)
   - **Community Management API** *(or)* **Marketing Developer Platform** — required for `r_organization_social`, `rw_organization_admin`, page insights and follower data
3. The **Marketing Developer Platform** requires partner approval. Submit a written application; expect **2–6 weeks** plus a partner manager interview.

### Scopes you'll request

- `openid`, `profile`, `email` (basic identity)
- `w_member_social` (publish on behalf of a member)
- `r_organization_social` (read company posts + analytics)
- `rw_organization_admin` (manage Company Page, follower stats)
- `r_organization_followers` (follower demographics)

### `.env` additions

```bash
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=https://your-domain/auth/linkedin/callback
```

### OAuth flow

1. Dialog URL:
   ```
   https://www.linkedin.com/oauth/v2/authorization
     ?response_type=code
     &client_id=$LINKEDIN_CLIENT_ID
     &redirect_uri=$LINKEDIN_REDIRECT_URI
     &scope=openid%20profile%20email%20w_member_social%20r_organization_social%20rw_organization_admin
     &state=<brandId>
   ```
2. Exchange code → access token (`POST https://www.linkedin.com/oauth/v2/accessToken`). Tokens last **60 days**, refresh tokens last **365 days** — store both.
3. Get the user's accessible Company Page URN:
   `GET https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))`
4. Persist: `brandId, linkedinOrgUrn (e.g. urn:li:organization:12345), accessToken, refreshToken, expiresAt`.

### Metric endpoints

**Follower stats**
```
GET https://api.linkedin.com/rest/organizationalEntityFollowerStatistics
  ?q=organizationalEntity
  &organizationalEntity=urn:li:organization:{org-id}
Headers: Authorization: Bearer {token}
         LinkedIn-Version: 202508
         X-Restli-Protocol-Version: 2.0.0
```

**Page-level share statistics (reach, impressions, engagement)**
```
GET https://api.linkedin.com/rest/organizationalEntityShareStatistics
  ?q=organizationalEntity
  &organizationalEntity=urn:li:organization:{org-id}
  &timeIntervals.timeGranularityType=DAY
  &timeIntervals.timeRange.start={unix-ms}
  &timeIntervals.timeRange.end={unix-ms}
```

**Per-post stats**
```
GET https://api.linkedin.com/rest/socialActions/{share-urn}
GET https://api.linkedin.com/rest/organizationalEntityShareStatistics
  ?q=organizationalEntity
  &organizationalEntity=urn:li:organization:{org-id}
  &shares[0]={share-urn}
```

### Rate limits

- **500 calls / member / day** on the Marketing API.
- **100,000 daily app-level calls** for most products.
- LinkedIn enforces hard daily caps — cache results.

---

## 3. X (Twitter)

### App registration

1. <https://developer.x.com/portal> → **Create Project + App**.
2. Pick a tier:
   - **Free**: only `POST /tweets` (publish) and very limited reads. Not useful for analytics.
   - **Basic ($200/mo)**: 10k reads/month, OK for low-volume metrics.
   - **Pro ($5,000/mo)**: 1M reads/month, full Insights + Engagement endpoints.
   - You almost certainly need Basic minimum. For per-tweet engagement history go to Pro.
3. Enable **OAuth 2.0** (PKCE) under User Authentication Settings.
4. Set callback URL + Website URL.

### Scopes

- `tweet.read`
- `users.read`
- `tweet.write` *(publishing only)*
- `offline.access` (for refresh tokens)

### `.env` additions

```bash
X_CLIENT_ID=
X_CLIENT_SECRET=
X_REDIRECT_URI=https://your-domain/auth/x/callback
```

### OAuth flow (PKCE)

1. Generate a `code_verifier` + `code_challenge` (S256).
2. Dialog:
   ```
   https://twitter.com/i/oauth2/authorize
     ?response_type=code
     &client_id=$X_CLIENT_ID
     &redirect_uri=$X_REDIRECT_URI
     &scope=tweet.read%20users.read%20offline.access
     &state=<brandId>
     &code_challenge=<challenge>
     &code_challenge_method=S256
   ```
3. Exchange code: `POST https://api.x.com/2/oauth2/token` with basic-auth header (client_id:client_secret) and `code_verifier`. Tokens last **2 hours**; refresh tokens issued when `offline.access` requested.
4. Persist: `brandId, xUserId, accessToken, refreshToken, expiresAt`.

### Metric endpoints

**Account-level**
```
GET https://api.x.com/2/users/me?user.fields=public_metrics,verified
  → followers_count, following_count, tweet_count, listed_count
```

**Per-tweet metrics**
```
GET https://api.x.com/2/users/{id}/tweets
  ?tweet.fields=public_metrics,non_public_metrics,organic_metrics,created_at
  &max_results=100
```
- `public_metrics` is in all tiers.
- `non_public_metrics` (impressions, profile clicks) and `organic_metrics` (engagement, video views) require **Basic** with user-auth token (not app-only).

### Rate limits

- 15-minute sliding window per endpoint. Read limits scale by tier.
- Always backoff on `429` with the `x-rate-limit-reset` header.

---

## Recommended implementation order

1. **Meta first** — covers 3 of your 5 channels. Highest ROI per integration hour.
2. **LinkedIn** — most relevant for B2B brands (Reportingwise, Flora HR).
3. **X last** — pricing makes this the most expensive per metric.

## Suggested server architecture

Under `src/lib/integrations/`:
```
meta.server.ts        // listAccounts(), getMetrics(brandId, range)
linkedin.server.ts    // same shape
x.server.ts           // same shape
oauth/
  meta-callback.tsx
  linkedin-callback.tsx
  x-callback.tsx
```

Each `getMetrics` returns the normalised `PlatformMetrics` shape above. Wire `src/routes/performance.tsx` to call them via `createServerFn`. Cache results in a `metrics_snapshots` table keyed by `(brandId, platform, snapshotDate)` and run a daily cron — never hit the upstream APIs from the request path.

## Token refresh strategy

- **Meta Page tokens**: don't expire for most apps. Refresh nightly using `GET /me?fields=id&access_token=…` and catch `190` errors → trigger reauth.
- **LinkedIn**: refresh 24h before the 60-day expiry using the refresh token. Re-prompt user when refresh token also expires (365 days).
- **X**: refresh on every API call if `expiresAt - now < 5 min`. Tokens are short-lived (2h).

Store everything in a `social_credentials` table with columns:
```
brand_id, platform, provider_user_id, access_token, refresh_token,
expires_at, scopes, created_at, updated_at
```

Always encrypt `access_token` + `refresh_token` at rest (e.g. AES-GCM with a key from your secrets manager).
