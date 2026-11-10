# Does the v1 event catalogue fit Knock's free tier?

Research for "Does the v1 event catalogue fit Knock's free tier?" ([#10](https://github.com/ruslan-volkov/cohort-005-project-fork/issues/10)), part of the map "Wayfinder: in-app notifications" ([#3](https://github.com/ruslan-volkov/cohort-005-project-fork/issues/3)). Knock's docs and pricing were checked on **2026-11-10**. Prices change, so check again before signing up.

## Short answer

**Yes, by a wide margin, at any scale Cadence has today.** In-app only, v1 costs about **one Knock message per comment** (question or reply), plus about 2 per Refund Request and 1 per Seat claimed. The seed data would produce a few dozen messages a month, against 10,000 free.

v1 goes over the free tier at around **9,000–10,000 comments and replies a month (about 300 a day)**. If 10–20% of Students comment once or twice a month, that is roughly **25,000–100,000 Students**. Refund Requests and Seat claims don't move the total much.

Two things eat into the headroom faster than growth does:

1. **Adding an email step later doubles the count** for everyone who gets both (one message per channel).
2. **Test traffic counts.** The in-app channel has no sandbox mode, and usage accrues in every Knock environment.

## What Knock bills

| Question | Answer | Source |
|---|---|---|
| What is a billable message? | "A message is counted each time a notification is successfully delivered to a single user on a single channel." | [Knock plans: message counts](https://docs.knock.app/manage-your-account/knock-plans) |
| Per recipient? | Yes. One per user per channel. A workflow triggered for every Platform Admin produces one message per Platform Admin. | Same |
| Per channel step? | Yes. "A workflow that notifies a user by both email and in-app results in two messages." | Same |
| Are workflow triggers billed? | No. "We only charge for messages sent, not messaging workflows triggered within Knock." | [Pricing FAQ](https://knock.app/pricing) |
| Skipped steps (preferences, conditions)? | Not billed. "If a channel step is not executed, there is no associated message. A channel step may be skipped due to user preferences, missing data, or other workflow logic." | [Knock plans](https://docs.knock.app/manage-your-account/knock-plans) |
| Failed or bounced? | Not billed (pricing FAQ). | [Pricing FAQ](https://knock.app/pricing) |
| In-app feed messages? | Count the same as any other channel. The docs make no exception for in-app, and the in-app channel "doesn't support sandbox mode". | [Managing usage](https://docs.knock.app/manage-your-account/managing-usage) |
| Batched notifications? | **One message per closed batch, per recipient, per channel.** Triggers that join an open batch "are terminated" at the batch step. Only the run that opened the batch goes on to the channel steps. The docs' Slack example says three triggers were "batched into a single message". With "immediately flush leading item" turned on, a burst costs **two** messages (the first item, then the rest). The pricing page itself doesn't say this; it follows from the message definition plus how batches run. | [Batch function](https://docs.knock.app/designing-workflows/batch-function), [debugging batched runs](https://docs.knock.app/send-notifications/debugging-workflows), [Slack notifications with Knock](https://docs.knock.app/integrations/chat/slack/overview) |
| Test or development traffic? | Counts. "Regardless of plan, usage may be accrued in any Knock environment." Sandboxed messages don't count, but in-app can't be sandboxed per channel. Use the test runner's sandbox setting or channel conditions that limit delivery to test users. | [Knock plans: non-production usage](https://docs.knock.app/manage-your-account/knock-plans) |

## Free plan limits (pricing page, 2026-11-10)

| | Free | Starter |
|---|---|---|
| Messages sent | up to **10,000 / month** (confirmed) | $250/mo, 50,000 included, then $0.005 each |
| Environments | "Isolated environments: Unlimited". An account starts with production only, and a development environment can be turned on ([environments](https://docs.knock.app/concepts/environments)) | Unlimited |
| Users ("stored profiles") | Unlimited | Unlimited |
| Team members (dashboard seats) | Unlimited | Unlimited |
| Feeds per recipient, Feed API | Unlimited, yes | Same |
| Realtime feed (websocket) | No limit or plan restriction stated on the pricing page or in the docs. The SDKs manage the socket ([realtime](https://docs.knock.app/in-app-ui/feeds/socket-behavior)) | Same |
| Workflows, triggers, channels | Unlimited | Unlimited |
| Preferences, batching | Yes | Yes |
| Batch render limit | 10 activities in a template (raising it is Enterprise only) | Same |
| Remove Knock branding | **No** | Yes |
| Log retention | 30 days | 30 days |

**Going over: no hard cap, and no pay-as-you-go step.** The FAQ says: "We don't hard cap your messages… If you go over your limit, we'll get in touch with you about making sure you have a billing method in place next month." So delivery keeps working, but staying over means moving to Starter at **$250/mo**. The project's constraint is free tier only, so usage needs watching (Settings > Billing in the dashboard).

## Messages per v1 event (in-app only)

From the resolution of "Event catalogue: which events notify which role" ([#5](https://github.com/ruslan-volkov/cohort-005-project-fork/issues/5)):

| Event | Messages per occurrence |
|---|---|
| New question (top-level comment by a Student) | 1 (the course's Instructor). Instructor and Platform Admin posts: 0 |
| Reply to a top-level comment | 1 (the top-level author). Replying to yourself: 0 |
| Refund Request decided | 1 (the buyer) |
| New Refund Request | **A**, the number of Platform Admins |
| Seat claimed | 1 (the Team Admin) |

Monthly messages ≈ **Q + R + F × (A + 1) + S**. Here Q is new questions, R is replies that aren't self-replies, F is Refund Requests (each requested and later decided), A is Platform Admins, and S is Seats claimed.

## Cadence's scale: what the repo shows

There are no production numbers in the repo. The seed (`scripts/seed.ts`) has:

- 1 Platform Admin, 3 Instructors (2 own courses), 40 Students
- 5 courses (4 published, 1 draft)
- 15 comments in 9 threads (6 replies, 1 of them the Instructor's own post)
- 3 Team Licences with 17 seats (8 redeemed), and no Refund Requests

Comments have no rate limit beyond length (1–5000 chars, `app/db/schema.ts`). Replies are one level deep. (There is no `GLOSSARY.md` on `main` to draw counts from.)

At seed scale, a full month of activity comes to **tens of messages**, which is 0.5% or less of the free tier.

## Sensitivity

Assumptions:

- A = 1–3 Platform Admins.
- Refund Requests are about 1% of monthly purchases.
- Seat claims are a few hundred a month at most.
- About 10% of replies are self-replies.
- So refunds and seats add at most ~500 messages, and comments carry the rest.

| Comments + replies / month | Approx. messages | Fits 10k? |
|---|---|---|
| 1,000 (~33/day) | ~1,200–1,400 | Yes, about 13% |
| 5,000 (~170/day) | ~5,000–5,500 | Yes, about half |
| **~9,000–10,000 (~300/day)** | **~10,000** | **Break-even** |
| 20,000 | ~18,500–19,500 | No, Starter tier |

In Students (assuming most comments come from Students):

| Comments per Student per month | Students at break-even |
|---|---|
| 0.5 (busy cohort) | ~19,000 |
| 0.2 (typical, 10–20% comment once or twice) | ~47,000 |
| 0.05 (quiet catalogue) | ~190,000 |

**What moves the line most:**

- **Email later.** Users who get both in-app and email cost 2× → the break-even falls to ~4,500–5,000 comments a month.
- **More Platform Admins.** This only matters for Refund Requests. Even 5 Platform Admins and 200 Refund Requests a month cost 1,200 messages.
- **Test traffic.** E2E runs or seeds that trigger real Knock workflows count at the same price.

## How to stay within the free tier

**Batching is the main lever, and it costs latency.** One closed batch is one message, however many activities it holds. But a window delays the notification by its length, which works against "live delivery preferred". At v1's likely volume, batching is a UX choice more than a budget need. The budget only forces it above ~5k messages a month.

Suggested grouping rules for "What a notification is: lifecycle and rules" ([#6](https://github.com/ruslan-volkov/cohort-005-project-fork/issues/6)):

| Event | Batch key (per recipient) | Window | Why |
|---|---|---|---|
| Seat claimed | Team Licence (purchase id) | ~1 hour, or sliding with a cap | A Team Admin handing out 50 coupon codes otherwise gets 50 notifications. This is the clearest win. |
| Reply to a top-level comment | Top-level comment id | ~5–10 min sliding | A back-and-forth in one thread becomes one notification ("3 new replies to your question"). |
| New question → Instructor | Course (or lesson) | ~10–15 min | Bursts after a cohort's release group into one. Optionally flush the leading item so the first question is live. That costs 2 messages per burst instead of 1. |
| New Refund Request → Platform Admins | none | none | Rare, and it needs action. Leave it live. |
| Refund Request decided | none | none | One per decision. Leave it live. |

Template rules that come with batching:

- Templates only see **10 activities** off Enterprise. Write copy as "N new replies" using `total_activities`, not a list of every item.
- Cancelling a batched activity (for example, a deleted comment) needs a `cancellation_key` on the trigger. An empty batch sends nothing.

**Cutting events barely helps.** Comments are nearly all the volume. Dropping Refund Requests or Seat claims saves a few hundred messages at most. The only cuts that matter are notifying on replies or on new questions, and those are the reason v1 exists.

**Operational guard rails.** Put these in the spec:

- Never trigger Knock from unit tests, E2E runs or `npm run db:seed`. Stub the trigger call behind an interface.
- In the development environment, add an in-app channel condition limited to test users, or use the test runner's sandbox setting.
- Check usage in Settings > Billing monthly. Alert at ~70% (7,000).

## Other flags for the map

- **Knock branding stays on the free tier** ("Remove Knock branding: No"). The feed UI will show Knock branding unless Cadence pays or builds its own feed UI on the Feed API.
- **No middle step.** The tier above free is $250/mo. If growth nears ~7k messages a month, revisit build vs. buy rather than drifting onto Starter.
