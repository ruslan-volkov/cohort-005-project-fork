# Can Knock's headless client drive our own feed UI on the free plan?

Research for "Can Knock's headless client drive our own feed UI on the free plan?" ([#13](https://github.com/ruslan-volkov/cohort-005-project-fork/issues/13)), part of the map "Wayfinder: in-app notifications" ([#3](https://github.com/ruslan-volkov/cohort-005-project-fork/issues/3)). Docs, pricing and terms were checked on **2026-11-11**. The source was read at the versions the `spike/knock-feed` branch installs, which were also the latest on npm that day:

| Package | Version | Source (tag) |
|---|---|---|
| `@knocklabs/client` | 0.23.1 | [`@knocklabs/client@0.23.1`](https://github.com/knocklabs/javascript/tree/%40knocklabs/client%400.23.1/packages/client) |
| `@knocklabs/react-core` | 0.17.1 | [`@knocklabs/react-core@0.17.1`](https://github.com/knocklabs/javascript/tree/%40knocklabs/react-core%400.17.1/packages/react-core) |
| `@knocklabs/react` | 0.15.1 | [`@knocklabs/react@0.15.1`](https://github.com/knocklabs/javascript/tree/%40knocklabs/react%400.15.1/packages/react) |
| `@knocklabs/node` | 1.41.0 | used only to sign user tokens |

Below, `client/…`, `react-core/…` and `react/…` mean `packages/<name>/src/…` at those tags.

## Short answer

**Yes, all five, on the free plan, with no "Powered by Knock" footer.** The footer is drawn only by the prebuilt `NotificationFeed` component. A headless UI built on `useNotifications` + `useNotificationStore` (or `KnockFeedProvider` + `useKnockFeed`) never renders it. Nothing in Knock's terms requires attribution.

| # | Capability | Answer | API |
|---|---|---|---|
| 1 | Items, unread count, realtime, detect a new arrival | **Yes** | `useNotificationStore(feed)` → `items`, `metadata.unread_count`. `feed.listenForUpdates()` (done for you by `useNotifications`). `feed.on("items.received.realtime", ({ items }) => …)` for bounce + toast |
| 2 | Mark one read, mark all read | **Yes** | `feed.markAsRead(item)`, `feed.markAllAsRead()`. Headless mode never auto-marks anything |
| 3 | Page through the full list | **Yes** | Cursor paging: `feed.fetchNextPage()` / `fetch({ after })`. `page_size` 1–50 (default 50). `store.pageInfo.after` is `null` at the end |
| 4 | Unread filter, server-side | **Yes** | Feed option `status: "unread"` (also `read`, `unseen`, `seen`, `all`) |
| 5 | Data to render our own text | **Yes, only in `mode: "rich"`** | `actors`, `total_actors`, `total_activities`, `activities[].data`, `data`, `blocks` (`body`, `action_url`), `inserted_at`. The SDK defaults to `compact`, which drops most of these |

Four things the spec must account for: set **`mode: "rich"`**, **mark seen yourself** if you use `unseen_count`, **one feed client per filter has its own store** (they don't sync), and **the Knock user must exist** or the feed is empty.

## 1. Items, unread state and realtime

| Claim | Source |
|---|---|
| `useNotifications(knock, feedChannelId, options)` creates a `Feed` with `knock.feeds.initialize(...)` and calls `feedClient.listenForUpdates()` straight away. Realtime is on by default for headless use. | `react-core/modules/feed/hooks/useNotifications.ts` ([L11–24](https://github.com/knocklabs/javascript/blob/%40knocklabs/react-core%400.17.1/packages/react-core/src/modules/feed/hooks/useNotifications.ts#L11-L24)) |
| `KnockFeedProvider({ feedId, defaultFeedOptions })` wraps the same hook. `useKnockFeed()` returns `{ knock, feedClient, useFeedStore, colorMode }`. | `react-core/modules/feed/context/KnockFeedProvider.tsx` |
| `useNotificationStore(feedClient, selector?)` subscribes to the feed's TanStack store. State is `{ items, pageInfo, metadata, loading, networkStatus }`. | `react-core/modules/feed/hooks/useNotificationStore.ts`, `client/clients/feed/types.ts` |
| `metadata` is `{ total_count, unread_count, unseen_count }`. `unread_count` drives our dot badge. | `client/clients/feed/interfaces.ts` ([L150](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/interfaces.ts#L150)). The API returns "aggregate values for unread counts, read counts, and seen counts, for use in feed badge UIs" ([feeds overview](https://docs.knock.app/in-app-ui/feeds/overview)) |
| You must call `feedClient.fetch()` yourself (e.g. in a `useEffect`). The hook does not fetch. | [Custom notifications UI](https://docs.knock.app/in-app-ui/react/custom-notifications-ui) |
| Realtime runs over a Phoenix websocket. The server sends only a `new-message` event, which carries badge counts and not the message. The client sets the new counts, then fetches the items newer than its current head (`fetch({ before: head.__cursor, __fetchSource: "socket" })`). | `client/clients/feed/feed.ts` `onNewMessageReceived` ([L665–680](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/feed.ts#L665-L680)). The API overview says the event "does not include full message contents, but includes metadata about updated badge counts" and "might be throttled" ([API overview](https://docs.knock.app/in-app-ui/api-overview)) |
| **Detecting a new arrival.** A fetch triggered by the socket emits `items.received.realtime` with `{ items, metadata }`. A normal fetch emits `items.received.page`. So `feed.on("items.received.realtime", ({ items }) => { bounceBell(); toast(items[0]); })` fires only for live arrivals, never on initial load or paging. | `feed.ts` ([L618–630](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/feed.ts#L618-L630)), `types.ts` comments. The docs say: "Invoked whenever items are received in realtime from the socket" ([JS feed client](https://docs.knock.app/in-app-ui/javascript/sdk/feed-client)) |
| The socket disconnects after a tab has been hidden for **30 s** and reconnects when the tab is visible again (`disconnectOnPageHidden`, default `true`). Reconnecting rejoins the channel, but the source does **not** refetch on reconnect. Arrivals while the tab was hidden may only appear on the next fetch. *Inference from source.* Refetch on `visibilitychange` to be safe. | `client/pageVisibility.ts` (`DEFAULT_DISCONNECT_DELAY_MS = 30_000`), `client/interfaces.ts` `KnockOptions.disconnectOnPageHidden` |

## 2. Mark read, mark all read, and seen vs read

**Knock tracks seen and read separately.**

- **Seen** means "the message has been retrieved for display in the recipient's in-app feed at least once".
- **Read** means "the message has been opened and read by the recipient at least once".
- **Interacted** means "your recipient has explicitly clicked on the notification cell in their feed".
- **Archived** is separate again, and hides an item by default.

Source: [Message statuses](https://docs.knock.app/send-notifications/message-statuses). `FeedItem` has `seen_at`, `read_at`, `interacted_at`, `clicked_at`, `link_clicked_at` and `archived_at` (`interfaces.ts` [L121–149](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/interfaces.ts#L121-L149)).

| Claim | Source |
|---|---|
| `feed.markAsRead(itemOrItems)` optimistically sets `read_at` and lowers `unread_count`, then calls `POST /v1/messages/batch/read`. `markAsUnread` reverses it. | `feed.ts` ([L254–323](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/feed.ts#L254-L323)), `client/clients/messages/index.ts` |
| `feed.markAllAsRead()` optimistically sets `unread_count` to 0, then calls `POST /v1/channels/{feedId}/messages/bulk/read`. It is **scoped to the feed's current options** (`engagement_status` from `status`, `archived`, `tenant`, `trigger_data`), and it runs as an async bulk operation (the response is a `BulkOperation` with `status: "processing"`). | `feed.ts` `makeBulkStatusUpdate` ([L757–783](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/feed.ts#L757-L783)), [bulk update API](https://docs.knock.app/api-reference/channels/bulk/update_message_status) |
| **Headless mode marks nothing automatically.** The docs say that with headless hooks you are "responsible for marking items as seen", and that if you skip it, `unseen_count` never goes down. | [Custom notifications UI](https://docs.knock.app/in-app-ui/react/custom-notifications-ui), [headless feed](https://docs.knock.app/in-app-ui/react/headless/feed) |
| The automatic marking lives only in the prebuilt components. `NotificationFeedPopover` calls `markAllAsSeen()` when it opens (seen, not read). `NotificationCell` calls `markAsInteracted()` on click. | `react/…/NotificationFeedPopover.tsx` (`onOpen` default: `unseen_count > 0 && feedClient.markAllAsSeen()`), `react/…/NotificationCell.tsx` |
| `markAsInteracted()` optimistically sets **both** `interacted_at` and `read_at` in the store. The API reference doesn't say whether the server also sets `read`. Don't rely on it: call `markAsRead` explicitly. | `feed.ts` ([L325–343](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/feed.ts#L325-L343)), [mark as interacted](https://docs.knock.app/api-reference/messages/mark_as_interacted) |
| "Mark all as read" does not mark items as clicked. The docs also don't say that seen or a link click implies read for in-app. | [Message statuses](https://docs.knock.app/send-notifications/message-statuses) |
| **Link tracking caveat.** If link tracking is enabled on the in-app channel, links in the message body are rewritten to Knock's tracking redirect and set `link_clicked`. Clicks on the action URL are tracked as `interacted`. | [Message statuses](https://docs.knock.app/send-notifications/message-statuses) |

**Fit with Cadence's rule** (Read only when the recipient opens or clicks): it fits. Call `markAsRead(item)` in our click handler, and call nothing on fetch or panel open. If we also want a "new since last look" behaviour, `markAllAsSeen()` on panel open only touches `seen`, never `read`. The dot badge should then read `unread_count`, not `unseen_count`.

## 3. Pagination

| Claim | Source |
|---|---|
| Paging uses opaque cursors. Feed options take `after`/`before` and `page_size`. Every item has a `__cursor`. | `interfaces.ts` ([L18–22](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/interfaces.ts#L18-L22)) |
| `page_size`: "A number between 1 and 50", default 50. `page_info` = `{ after, before, page_size }`. `after` is null when there is nothing more. A list `total_count` is capped at "up-to 10,000". | [Pagination](https://docs.knock.app/api-reference/overview/pagination), [list feed items](https://docs.knock.app/api-reference/users/feeds/list_items) |
| `feed.fetchNextPage()` reads `store.pageInfo.after`, does nothing if it is null, and otherwise fetches with `after` and appends to `items` (`networkStatus` becomes `fetchMore`). | `feed.ts` ([L635–652](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/feed.ts#L635-L652)) |
| The list comes back in reverse chronological order. | [Feeds overview](https://docs.knock.app/in-app-ui/feeds/overview) |
| **Limiting to 90 days.** Feed option `inserted_at_date_range: { start, end, inclusive }` becomes `inserted_at.gte/gt/lte/lt` on the API. | `interfaces.ts` ([L38–47](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/interfaces.ts#L38-L47)), [list feed items](https://docs.knock.app/api-reference/users/feeds/list_items) |
| **Retention is not a limit.** "In-app feed notifications are available indefinitely," even after message *log* data expires (30 days off Enterprise). The pricing table lists "Feed retention: Unlimited" on Free. | [Data retention](https://docs.knock.app/manage-your-account/data-retention), [pricing](https://knock.app/pricing) |

So the 90-day window is ours to enforce, either with `inserted_at_date_range.start` set to now − 90 days, or by stopping the "load more" at that date.

## 4. Unread filter

| Claim | Source |
|---|---|
| Feed option `status?: "unread" \| "read" \| "unseen" \| "seen" \| "all"` is sent as a query param on `GET /v1/users/{user_id}/feeds/{channel_id}`, so the filter runs **server-side**. | `interfaces.ts` ([L22](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/interfaces.ts#L22)), `feed.ts` `fetch` ([L547–600](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/feed.ts#L547-L600)). The docs: "Can be filtered by status (unread, read, seen, archived) or custom properties" ([feeds overview](https://docs.knock.app/in-app-ui/feeds/overview)) |
| You can set it per fetch (`feed.fetch({ status: "unread" })`) or per instance (`useNotifications(knock, id, { status: "unread" })` / `KnockFeedProvider defaultFeedOptions`). Changing the options object creates a new feed client. | `feed.ts` `fetch` merges `defaultOptions` with per-call options. `useNotifications.ts` reinitializes when the options change |
| With `status: "unread"`, `markAllAsRead()` optimistically empties the store, and `markAsRead` lowers the counts. | `feed.ts` ([L268–310](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/feed.ts#L268-L310)) |
| Other server-side filters are available: `archived` (`exclude` by default, or `include`/`only`), `source` (workflow key), `workflow_categories`, `tenant`/`has_tenant`, and `trigger_data` (flat key/values only). "Custom feed filtering" is listed as Yes on Free. | `interfaces.ts`, [pricing](https://knock.app/pricing) |

## 5. Data for our own rendering

| Field | What it holds | Notes |
|---|---|---|
| `actors: Recipient[]`, `total_actors` | Who caused the item (User objects with `id`, `name`, `avatar`, …) | **Compact mode returns at most one actor.** |
| `total_activities`, `activities[]` | Count and list of batched activities. Each `Activity` has `actor`, `data`, `inserted_at` | **Left out in compact mode.** Templates still only see 10 activities off Enterprise (see [free-tier note](https://github.com/ruslan-volkov/cohort-005-project-fork/blob/research/knock-free-tier/docs/research/knock-free-tier.md)), but `total_activities` is the real count |
| `data` | The trigger payload (e.g. `lessonId`, `lessonTitle`, `courseSlug`, `url`) | **Compact mode drops nested arrays and objects.** Keep it flat, or use rich mode |
| `blocks[]` | The rendered in-app template. `{ name, type: "markdown" \| "text" \| "button_set", content, rendered }`. The default template has a `body` block and an `action_url` block | The prebuilt cell reads `blocks.action_url.rendered` as the click target and `blocks.body.rendered` as HTML. A headless UI can ignore `blocks` and render from `data` |
| `source` | `{ key (workflow key), categories, version_id }` | Choose the copy per workflow |
| `inserted_at`, `updated_at`, `read_at`, `seen_at`, … | Timestamps | `updated_at` changes when a batch gets new activity |

Sources: `interfaces.ts` ([L88–148](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/interfaces.ts#L88-L148)), `react/…/NotificationCell.tsx`, [list feed items](https://docs.knock.app/api-reference/users/feeds/list_items).

**`mode` defaults differ between the SDK and the API.** The client sets `mode: "compact"` by default (`feed.ts` [L39–42](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/feed.ts#L39-L42)). The CHANGELOG says: "If you need to access `activities`, `total_activities`, the complete `data`, or the complete array of `actors`, you must initialize your feed in `"rich"` mode." The raw API defaults to `rich` ([list feed items](https://docs.knock.app/api-reference/users/feeds/list_items)). Since we need batch counts and actor lists, **pass `{ mode: "rich" }`**.

## Attribution and branding

| Claim | Source |
|---|---|
| The pricing table's In-app feeds section lists "Pre-built components: Yes", "**Bring your own components: Yes**", "Feed API: Yes" and "Remove Knock branding: **No**" on Free. | [Pricing](https://knock.app/pricing) |
| In the SDK, branding is a feature flag from `GET /v1/users/{id}/feeds/{feedId}/settings` (`features.branding_required`), read by `useFeedSettings`. It is drawn **only** by the prebuilt `NotificationFeed` component (the `rnf-notification-feed__knock-branding` footer, "Powered by Knock"). `NotificationFeedPopover` gets it because it renders `NotificationFeed`. | `react-core/modules/feed/hooks/useFeedSettings.ts`, `react/modules/feed/components/NotificationFeed/NotificationFeed.tsx` |
| Headless hooks (`useNotifications`, `useNotificationStore`, `useKnockFeed`) don't call the settings endpoint and render nothing. | Same files: only `NotificationFeed` uses `useFeedSettings` |
| The [Terms of Service](https://knock.app/legal/terms-of-service) contain **no** requirement to show Knock branding, attribution or "Powered by Knock". The only related clause runs the other way: Knock's name and logos are trademarks, and there is no "license or right to use any of Knock Trademarks … without our prior written permission". No other document on [knock.app/legal](https://knock.app/legal) (privacy, AI terms, DPA, AUP, affiliate) mentions branding. | ToS, legal index |

**Conclusion:** On Free, "Remove Knock branding: No" refers to the footer in the prebuilt feed. A UI we build ourselves on the Feed API shows no Knock branding, and nothing requires us to add any. One caveat: the pricing page doesn't define the row's scope in words. The reading above comes from where the row sits ("In-app feeds", next to "Bring your own components") and from the SDK source.

## Constraints for the spec

1. **Enhanced security mode (on in development).** Requests from the client with the public key and no signed user token are rejected. Sign an RS256 JWT with `sub` = user id (`@knocklabs/node` `signUserToken`, 3600 s by default) on the server, e.g. in a React Router loader, as the spike does. Pass it as `KnockProvider userToken`, and refresh it with `onUserTokenExpiring` (re-authenticating restarts the socket). Never ship `KNOCK_SIGNING_KEY` to the client. Sources: [security & authentication](https://docs.knock.app/in-app-ui/security-and-authentication), `client/knock.ts` `authenticate`.
2. **Users must exist in Knock.** An unidentified user gets "an empty feed" ([list feed items](https://docs.knock.app/api-reference/users/feeds/list_items)). `KnockProvider user={{ id }}` identifies inline from the browser by default (`identificationStrategy: "inline"`, a `PUT` user from the client, `knock.ts` [L163–179](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/knock.ts#L163-L179)). Prefer identifying server-side (or inline identification in the workflow trigger) and pass `identificationStrategy: "skip"`.
3. **Browser-only rendering.** `@knocklabs/react` and `react-core` ship with `"use client"` and open a websocket. The feed state exists only in the browser. Render the bell and panel client-side: the spike gates on a `mounted` flag. `KnockProvider`'s `enabled` prop (default `true`) keeps the client idle until the user id and token are ready (`react-core/modules/core/context/KnockProvider.tsx`). No Knock doc page covers SSR. This is from the source.
4. **One store per feed client.** Each `useNotifications` / `KnockFeedProvider` builds a separate `Feed` with its own store. The socket only pushes `new-message`, not status changes. Marking an item read on the Feed page (an `unread`-filtered client, say) won't update the bell's client until it refetches. Options:
   - Mount one `KnockFeedProvider` (status `all`, rich) in the app layout for the bell and panel, and split Unread/Earlier client-side by `read_at`.
   - Give the Feed page its own client, and refetch the bell's client on `items.*` events.
   - Use `__experimentalCrossBrowserUpdates: true`, which re-broadcasts status changes over a `BroadcastChannel`. It is experimental.

   Source: `feed.ts` `setupBroadcastChannel`, `socket-manager.ts`.
5. **Rate limits.** Listing feed items, marking as interacted, and the channel bulk update are **tier 2 = 5 requests/second**. With a signed user token, limits are "scoped by both the environment and the signing user". Feed listing is "always scoped per-user and per-environment". This is fine for one person's UI. Don't loop `fetchNextPage` eagerly to load 90 days in one go; page on scroll. Sources: [rate limits](https://docs.knock.app/api-reference/overview/rate-limits), [list feed items](https://docs.knock.app/api-reference/users/feeds/list_items).
6. **Free plan.** The pricing page puts no restriction on the Feed API, custom feed filtering, feeds per recipient, feed retention or "bring your own components". The pricing page and docs don't mention any plan limit on realtime. The only free-plan in-app difference is branding. Billing is per delivered message, not per API read ([free-tier note](https://github.com/ruslan-volkov/cohort-005-project-fork/blob/research/knock-free-tier/docs/research/knock-free-tier.md)). Source: [pricing](https://knock.app/pricing).
7. **The feed id is a UUID.** `feedId` must be the in-app channel's UUID. The constructor logs an error otherwise (`feed.ts` [L59–70](https://github.com/knocklabs/javascript/blob/%40knocklabs/client%400.23.1/packages/client/src/clients/feed/feed.ts#L59-L70)).
8. **Message content can't be changed.** To change a sent notification, archive it and re-trigger ([feeds overview](https://docs.knock.app/in-app-ui/feeds/overview)). Text rendered from `data` in our own components avoids depending on Knock's template copy.
9. **Not verified live.** Everything above comes from docs and source. It was not exercised against the spike's environment.
