# Build or buy in-app notifications

Research for [#4](https://github.com/ruslan-volkov/cohort-005-project-fork/issues/4), part of the map [#3](https://github.com/ruslan-volkov/cohort-005-project-fork/issues/3). All vendor pricing and docs were checked on **2026-11-10**. Prices change, so check again before signing up for anything.

## Recommendation

**Build in-house.** Store notifications as rows in the existing SQLite file through Drizzle. Show them through loaders. Push live updates over Server-Sent Events (SSE) from a React Router resource route, fed by an in-process event emitter.

Why:

1. **The stack is a good fit for SSE.** Cadence runs as one Node process on one SQLite file (ADR 0006). An in-process `EventEmitter` can therefore fan out "new notification for user N" to open SSE streams, with no Redis or pub/sub. React Router 8 resource routes can return a raw `Response`, and that body can be a `ReadableStream`.
2. **The free tiers are workable but thin, and the first paid step is big.** Knock gives 10k messages/mo free, then $250/mo. MagicBell gives 1k deliveries/mo free, then $249/mo. Novu gives 10k workflow runs/mo free, but only 3 seats, 5 workflows and 24h activity retention. A comment notification goes out per recipient, so volume grows with course size.
3. **Email is half-built already.** `app/lib/mailer.server.ts` has a `MailTransport` interface with a Postmark transport and a `.outbox/` fallback for dev. If notifications are a channel-agnostic event record, a later email channel only needs a dispatcher that calls `MailTransport`. A vendor would give no real advantage there.
4. **Data stays inside the app.** Any vendor gets user IDs, names or emails, and notification text (often comment excerpts written by Students) on every trigger.
5. **Exit cost is zero.** Vendor feeds, templates and workflow definitions live in the vendor's system and its SDK. Leaving one means rebuilding the UI and migrating history.

What you give up by building: a polished prebuilt inbox UI, built-in preferences and digests, and a dashboard for delivery logs. For v1, with one channel and a small event catalogue, none of those is worth the trade.

When to look again: Cadence moves to several server processes or machines, needs batching or digests across email, SMS and push, or a team without backend capacity takes notifications over. Novu's MIT core is the best fallback because it can be self-hosted. Its self-hosted footprint, though, is heavy (see below).

## Option comparison

| | Free tier (2026-11-10) | First paid step | Live delivery | Auth handshake | Email later |
|---|---|---|---|---|---|
| **Knock** | 10,000 messages/mo, unlimited seats, channels and feeds; 30-day log retention | Starter $250/mo + usage | Managed websocket real-time service | Backend signs an RS256 JWT (`sub`, `exp`, optional `grants`) in "enhanced security mode". **Off by default** | Same workflow, add an email step |
| **Novu (cloud)** | 10,000 workflow runs/mo, max 5 workflows, 3 seats, 2 environments, 24h activity retention, unlimited subscribers | Pro from $30/mo (30k+ runs) | WebSocket (`socketUrl` e.g. `wss://eu.socket.novu.co`) | Server computes `HMAC-SHA256(secretKey, subscriberId)` and passes it to `<Inbox subscriberHash>` | Same workflow, add an email step |
| **Novu (self-hosted)** | MIT core, free to run | n/a | Own WS service | Same | Same |
| **MagicBell** | "Builder": 1,000 deliveries/mo, unlimited users and seats, 1 project | Startup $249/mo (50k deliveries) | "Persistent connection" (transport not named) | User JWT | Yes |
| **Courier** | Developer: up to 10k sends/mo | Business: $0.005/send pay-as-you-go | Inbox "messages arrive in real time" (transport not named) | Backend mints a JWT with the API key, client `signIn({ userId, jwt })` | Yes |
| **SuprSend** | 10k notifications/mo, unlimited seats, in-app feed **with SuprSend branding** | Essentials $100/mo (50k) | Not stated on pricing page | Not checked | Yes |
| **Build (SSE)** | $0 | n/a | SSE from a resource route + in-process emitter | Existing cookie session (`app/lib/session.ts`). No extra token | Dispatcher over existing `MailTransport` |

### Notes per vendor

- **Knock.** It has the strongest free tier for this use. Enhanced security is off by default. Without it, "a request with your public key can act as any user", so production must turn it on and sign tokens on the server. Its real-time feed runs over a websocket. The React SDK takes `userToken` as a prop.
- **Novu.** Its free tier is the most restricted in practice: 5 workflows and 3 seats. Removing branding is "disabled on the free plan". Without HMAC, anyone who guesses a subscriber ID with the public app identifier can read that subscriber's notifications. The core is MIT, the `enterprise/` folder has a commercial licence, and self-hosting leaves out some cloud-only features. A self-host needs API, Worker, WebSocket and Dashboard services, plus MongoDB, two Redis clusters and S3-compatible storage. The single-VM minimum is about 4 vCPU / 8 GB for the Novu services alone. That is far more infrastructure than the whole of Cadence (ADR 0006 turned down even Postgres as "a second service to run").
- **MagicBell.** At 1,000 deliveries/mo, the free tier would run out quickly once comments notify every enrolled Student in a thread.
- **Courier.** 10k sends/mo free and pay-as-you-go after that, which makes it the cheapest vendor to grow on. Its pricing page does not say whether Inbox is in the free plan.
- **SuprSend.** Its free in-app feed carries vendor branding.

## The in-house build in Cadence's stack

Stack facts from `package.json`: `react-router` / `@react-router/node` / `@react-router/serve` **8.3.0** (not v7), `react` 19, `drizzle-orm` 0.45, `better-sqlite3` 12, `ssr: true`, served by `react-router-serve`.

Sketch (for the spec to refine, not a design):

- **Table** `notifications`: recipient user ID, kind (e.g. `comment.created`), subject references (course, lesson, comment IDs), `createdAt`, `readAt`. Store references and render text at read time, so the record stays channel-agnostic and email can render from it later.
- **Write path**: the same action that inserts a comment also inserts the notification rows, inside one synchronous transaction. Then it calls `emitter.emit(userId)`.
- **Live path**: a resource route such as `notifications.stream.ts`. Its loader checks the cookie session and returns `new Response(readableStream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } })`. It subscribes to the emitter for that user and unsubscribes on `request.signal` abort. On the client, `EventSource` triggers `useRevalidator()`, or the stream carries the new unread count.
- **Reconnection** comes free from the browser. `EventSource` reconnects by itself. The `retry:` field sets the delay. If the server sets `id:`, the browser sends `Last-Event-ID` on reconnect.

Costs and risks:

- **Browser connection limit.** Over HTTP/1, SSE shares a cap of **6 connections per browser + domain** (MDN; "Won't fix" in Chrome and Firefox). Many open tabs can starve normal requests. The fixes are HTTP/2 at the proxy (about 100 streams by default) or one stream per browser via `BroadcastChannel` or a SharedWorker. This matters if production serves over plain HTTP/1.
- **Single process only.** The in-process emitter works because ADR 0006 already ties Cadence to one process. If that changes, the emitter has to be replaced with a shared pub/sub. That move would be needed anyway, since every query is synchronous SQLite.
- **Proxies.** Buffering proxies must not buffer `text/event-stream`. Send a heartbeat comment line (`:\n\n`) every ~15–30 s so idle connections stay open.
- **Effort**: one table and migration, one resource route, one emitter module, a bell/unread component, and tests. That is small next to wiring a vendor SDK, token signing and syncing user profiles.

## Personal data sent to a vendor (flag)

If a vendor is chosen, each trigger would send it:

- **User identity**: Cadence user ID as recipient/subscriber ID. Name and email are usually synced as well (needed for the email channel later).
- **Actor identity**: the commenter's name, so the feed can say "Ana commented…".
- **Content**: course and lesson titles. Comment excerpts if they appear in the message text. These are free text written by Students and may contain anything.
- **Behaviour**: read/seen/archived timestamps per user, kept by the vendor.

You could minimise this by sending only IDs and a deep link. That would give a vendor feed with no useful text, which defeats much of the point of a prebuilt inbox. Building in-house sends nothing out. Postmark already receives email addresses for transactional mail, so the later email channel adds no new processor.

## Lock-in / exit cost

- **Vendors**: workflows, templates, preferences and message history live in the vendor. The UI depends on the vendor's SDK and components. Leaving means rebuilding the inbox UI and either migrating history through their APIs or dropping it. Novu softens this through self-hosting, at heavy infrastructure cost.
- **In-house**: none. The data is rows in `data.db`.

## Sources (all accessed 2026-11-10)

- Knock pricing: https://knock.app/pricing
- Knock in-app security and authentication: https://docs.knock.app/in-app-ui/security-and-authentication
- Knock feeds overview (websocket real-time service): https://docs.knock.app/in-app-ui/feeds/overview
- Novu pricing: https://novu.co/pricing
- Novu Inbox, prepare for production (HMAC, socketUrl): https://docs.novu.co/platform/inbox/prepare-for-production
- Novu self-hosting overview (components, sizing, restrictions): https://docs.novu.co/community/self-hosting-novu/overview
- Novu repository and licences (MIT core + enterprise licence): https://github.com/novuhq/novu
- MagicBell pricing: https://www.magicbell.com/pricing
- MagicBell in-app channel: https://www.magicbell.com/docs/channels/in_app
- Courier pricing: https://www.courier.com/pricing
- Courier Inbox overview: https://www.courier.com/docs/platform/inbox/inbox-overview
- SuprSend pricing: https://www.suprsend.com/pricing
- React Router resource routes (docs labelled 8.5.1): https://reactrouter.com/how-to/resource-routes
- MDN, Using server-sent events: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- In repo: `package.json`, `react-router.config.ts`, `docs/adr/0006-one-sqlite-file-through-drizzle.md`, `app/lib/mailer.server.ts`, `app/lib/session.ts`

### Not verified

- Which transport MagicBell and Courier use (their docs only say "real time" / "persistent connection").
- Whether Courier's free plan includes Inbox, and whether Novu's `<Inbox />` has free-plan limits beyond branding.
- What counts as one billable "message" in Knock: per recipient per channel is the usual model, but the billing doc URL returned 404.
- Streaming a `ReadableStream` body from a React Router 8 loader under `react-router-serve`. This is standard `Response` behaviour, but the resource-routes doc does not show it. Prove it with a quick spike before the spec commits to it.
