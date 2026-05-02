---
stepsCompleted: ['v1-direction-reset-2026-04-30']
inputDocuments:
  - '_bmad-output/shared/prd.md'
  - '_bmad-output/shared/session-recovery-2026-04-28-v1-ux-direction.md'
workflowType: 'ux-design'
date: '2026-04-30'
author: 'dewey'
project_name: 'Tribes'
revision_history:
  - { date: '2026-01-14', note: 'Initial UX spec — labeling-first kinetic-flick interaction' }
  - { date: '2026-04-30', note: 'V1 direction reset — voice-first onboarding, ambient-plan + survey event types, brand-soul receiver page; labeling/radial UI deferred to V1.5+' }
---

# UX Design Specification — Tribes

**Author:** dewey
**Date:** 2026-04-30 (V1 direction reset)

> **Important:** This document has been substantially rewritten from the 2026-01-14 version. The labeling-first kinetic-flick experience (radial UI, sticker aesthetic, three-zone layout, contact carousel, flick-to-bin physics) is **deferred to V1.5+, not removed**. The new V1 UX is a voice-first inner-circle capture leading directly to a first send, with two coordination event types (survey + ambient plan) and a brand-soul web receiver page. See PRD `_bmad-output/shared/prd.md` for product strategy and `session-recovery-2026-04-28-v1-ux-direction.md` for the discussion log.

---

## Executive Summary

### Project Vision

Tribes is **anti-isolation infrastructure** — a coordination tool designed to mitigate the loneliness/despair "emotional pandemic" emerging from automation-driven displacement. The product is not a personal CRM, not a contact-organizing tool, and not a labeling experience. It is a **form of asking that doesn't feel like asking**.

### Target Users — One User, Two Defense Mechanisms

V1 treats Transplants and Coordinators as **one user with two defense mechanisms** for the same need:

- **The Transplant** says "I have no one to ask." Doesn't initiate.
- **The Coordinator** says "I'm always the one asking." Initiates everything.

Both describe the same hole — the deprivation of *unsolicited inclusion* — from opposite walls. The UX serves both with the same product flow, but with a copy register that flexes between Priya-warm and Dana-executive.

### Defining Experience

**"Send something that catches before it lands."** The V1 differentiator is the *ambient plan* — a coordination format that is declarative, not interrogative. *"I'm probably going to the farmer's market Saturday."* No question mark. No invitation. No reply required. The only affordance is *"I might come too."* This format dodges the loneliness paradox: initiating produces an evidentiary record of the gap, and removing the question mark removes the record.

The companion format is the **survey** — *"What sounds good Saturday?"* — which distributes agenda-setting to the group and serves both as a low-stakes opener and as the V1 default for first-time senders.

### Key Design Challenges

1. **First send must happen inside onboarding.** If the user doesn't send within 5 minutes of install, retention collapses. The whole flow is engineered to land a SEND tap before any other feature surfaces.
2. **Voice-first inner-circle capture without auto-surfacing.** Mobile OS APIs don't expose communication frequency, so the system can't algorithmically suggest "your inner circle." V1 puts the human in the loop: the user *speaks* 4-6 names, the system matches them against contacts, the user confirms.
3. **Copy register must flex without explicit mode selection.** The same screens serve a lonely Priya and a tired Dana. The product can't ask "are you a Transplant or a Coordinator?" — it must read behavior and bend.
4. **Receiver-side brand-soul vs. conversion funnel.** Most consumer-social products treat link-recipients as conversion targets. Tribes treats them as the *primary beneficiary* — the felt-belonging moment is delivered at link-tap, regardless of whether they ever install the app.
5. **Anti-isolation design discipline.** Every screen must remove a thing from the user's shoulders, not add one. Sentimental warmth for the lonely; executive math for the tired; never both at once.

### Design Opportunities

1. **Voice as warmth.** Saying names out loud is more emotionally connective than tapping them from a list — it gives the user permission to *think* about who matters.
2. **Sub-2-minute time-to-first-send.** The whole onboarding is engineered for this. Validates the coordination promise immediately.
3. **Ephemeral plans as protection.** Ambient plans expire from view the day after. The user cannot accumulate a self-authored loneliness log.
4. **Invisible Tribes branding on the receiver page.** The relationship is the product; we are the room it happens in.

---

## Core User Experience

### The V1 Loop

| Stage | Action | Felt Sensation |
|-------|--------|----------------|
| Onboarding screen 1 | Welcome + promise statement | "This is gentle." |
| Onboarding screen 2 | Voice-capture inner circle (4-6 names) | "I'm naming people I love." |
| Onboarding screen 3 | Address-book match-confirm | "The system did the work." |
| Onboarding screen 4 | Pre-composed survey or ambient plan + SEND | "I just sent something." |
| Wait | Soft companion screen | "I'm not alone with this." |
| Response arrives | Push notification + warm confirmation | "Someone said yes." |
| 1 week post-meet | Reciprocity prompt | "What could I invite them to?" |

### Platform Strategy

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary platform | iOS mobile app | Target demographic (25-45 professionals) skews iPhone |
| Receiver flow | Mobile web (no app required) | Brand-soul; non-blocking conversion |
| Input paradigm (V1 primary) | **Voice** for inner-circle capture; **tap** for everything else | Speed + emotional warmth for the cold-start step |
| Input paradigm fallback | Typed input for users who can't or won't use voice | Accessibility + preference |
| Offline mode | Deferred to V2 | Coordination requires real-time |
| Real-time infrastructure | Deferred to V1.1 | WebSocket/presence not needed for core validation |

### Effortless Interactions

| Interaction | Effortless Target | How We Achieve It |
|-------------|-------------------|-------------------|
| Inner-circle capture | < 30 seconds for 4-6 names | Voice input with on-device transcription |
| Address-book match | < 5 seconds per name | Fuzzy matching surfaces candidates; user taps to confirm |
| Composing first send | < 60 seconds | Pre-composed message from user's free-text answer |
| Sending coordination | One tap | "Open the door" button on Send screen |
| Responding to invite (web) | < 5 seconds | Tappable chips for survey; single button for ambient |

### Critical Success Moments

| Moment | Experience | Success Signal |
|--------|------------|----------------|
| **First voice capture** | User holds mic, speaks names, sees them transcribed in real-time | User says all 4-6 names without restart |
| **First match-confirm** | System surfaces matched contacts; user taps to confirm | < 30 seconds for the screen |
| **First send (in onboarding)** | Pre-composed message visible; SEND button glows softly | User taps SEND |
| **First response received** | Push notification + opening the app shows the response | User feels validated |
| **First reciprocity prompt** | 1 week later, anchored to a specific event | User acts on it (sends back) |

### Experience Principles

1. **Voice is the cold-start.** The first input mechanism is speaking, not typing or tapping a list. It's faster, warmer, and gives the user permission to think about who matters.
2. **First send before anything else.** The user's first product action that matters is sending a coordination. Labels, settings, and meta-features are all post-send.
3. **The lighter-load test.** Every screen must remove a thing from the user's shoulders, not add one. If it added one — even a delightful one — we've failed.
4. **Copy register flexes.** Same UI, different language. *"Three people just heard from someone they like"* (Priya-warm) and *"You handled this in 38 seconds. Usually takes you 18 messages"* (Dana-executive) are the same screen at different emotional altitudes. The flex is driven by user behavior, not by user-mode selection.
5. **Invisible branding on the receiver side.** The relationship is the product. The recipient sees their friend, not Tribes.
6. **Ephemeral by design.** Ambient plans evaporate from the user's view the day after. No archive, no streak, no "your plans" tab.

---

## Desired Emotional Response

### Primary Emotional Goals

| Goal | Description | Why It Matters |
|------|-------------|----------------|
| **Belonging** | "I was thought of without having to ask." | The north-star molecule of the product |
| **Lighter load** | "This took less out of me than the old way did." | The Coordinator's variant of belonging |
| **Reverence** | "The page that opened when I tapped a friend's text felt like being invited home." | Receiver-side emotional contract |

### Anti-Sensations (Prevent)

| Sensation | Why to Prevent |
|-----------|----------------|
| Rejection anxiety | The whole product fails if users feel unsafe initiating |
| Performance pressure | Public counters and aggregate tallies prime expectation and manufacture disappointment |
| Surveillance | The receiver should never feel watched; the sender should never feel monitored |
| Patronizing tenderness | Sentimental copy aimed at a Coordinator feels insulting |
| Cold transactionalism | Mechanical copy aimed at a Transplant feels like the world said no again |
| The evidentiary record of the gap | Asking creates a permanent record of the absence; ambient plans dodge this; we never re-introduce it |

### Emotional Journey Mapping

#### Priya (Transplant) — Warm Register

| Stage | Target Emotion | Experience Design |
|-------|----------------|-------------------|
| First open | Adventurous + curious | "Who's in your inner circle?" — gentle, no instructions |
| Voice capture | Tender — naming people you love | The mic listens patiently; transcription appears in soft script |
| Match-confirm | Witnessed — the system understood | Suggested contacts appear; correction is one tap |
| Pre-composed send | Vulnerable but supported | "Open the door" — reframes the act from "asking" to "giving good news" |
| Wait | Held, not abandoned | Paper-boat animation; "Three people just heard from someone they like"; gentle journaling prompt |
| Response received | Elevation + Belonging | Soft push, photo of responder, warm confirmation |
| Reciprocity prompt (1 wk later) | Empowered | Anchored to specific event: "What's something you'd want to invite [Sarah] to?" |

#### Dana (Coordinator) — Executive Register

| Stage | Target Emotion | Experience Design |
|-------|----------------|-------------------|
| First open | Efficient — get out of my way | Voice prompt is the same; she rattles off 8 names in 9 seconds |
| Match-confirm | Crisp — system did the lookup, she confirms fast | Same screen, faster pacing |
| Pre-composed send | Routine but accumulated | Same SEND button; same affordance |
| Post-send (executive reframe) | Witnessed-for-effort-spared | "You handled this in 38 seconds. Usually takes you 18 messages." NOT the paper-boat. |
| Subsequent sends | Lighter | Recipient memory ("last-used list") makes repeat sends one-tap |
| Receiving an unsolicited inclusion (eventually) | Astonished gratitude | Same molecule as Priya's belonging — being thought of first |

### Design Implications

| Emotion | UX Design Approach |
|---------|-------------------|
| Belonging | The receiver page header reads: *"Sarah's thinking about Saturday and was thinking about you."* |
| Lighter load | Visible reduction in steps. Recency strip. Recipient memory. No celebratory animations for power users. |
| Reverence | The receiver page does *nothing* for half a beat after loading. Sender's name first; Tribes invisible. |
| Adventure | Exploratory language ("see," "find") not transactional ("submit," "confirm") |
| Anticipation, not anxiety | Show engagement without surfacing rejection ("3 people viewed" not "2 people said no") |

### Emotional Design Principles

1. **Anti-isolation, full stop.** Every emotional choice serves the goal of making the user feel less alone, never more.
2. **Adventure over obligation.** "See who wants to come" not "Send invitations."
3. **Lighter load over recognition.** Acknowledgment of effort spared is more intimate than applause.
4. **Anticipation, not anxiety.** Show forward motion ("3 people viewed") without surfacing rejection ("2 people said no").
5. **Reverence on the receiver page.** Brand-soul, not conversion funnel. The receiver is the primary beneficiary, not the viral surface.
6. **Protect from negative spirals.** Ephemeral plans. No public counts. No "0 responses" badge of failure.

---

## V1 Onboarding Flow

### Screen 1 — Welcome

| Element | Specification |
|---------|---------------|
| Background | Warm-dark canvas |
| Headline | One promise sentence (final wording: handed off to next designer; placeholder: *"Tribes turns thinking-of-someone into doing-something."*) |
| CTA | One soft button: *"Get started"* |
| Duration | < 5 seconds; no progress bar; no instructions |

### Screen 2 — Voice Inner-Circle Capture

| Element | Specification |
|---------|---------------|
| Headline | *"Who's in your inner circle?"* |
| Subhead | *"Say four to six names of people you really feel connected to. No rush."* |
| Mic UI | Hold-to-talk OR tap-to-toggle; visual response (waveform or pulse) |
| Transcription | Real-time text chips appearing as user speaks (< 300ms latency) |
| Correction | User can tap a chip to remove or re-speak |
| Fallback | "Type instead" link in the bottom corner — typed-input path |
| Minimum | 4 names required to proceed |
| Maximum | No hard cap, but UI guidance softly suggests 4-6 |

**Permission request (microphone):** This screen is the first request, with copy: *"We'll listen for the names you say — they stay on your phone."* Voice transcription must be on-device; no cloud transcription in V1.

**Design owner:** Voice-capture UX details (mic affordance design, waveform vs. pulse, error states for low-confidence transcriptions, multi-name disambiguation when user says "Sarah" with 3 Sarahs in contacts) — handed off to incoming designer per 2026-04-30 user direction.

### Screen 3 — Address-Book Match-Confirm

| Element | Specification |
|---------|---------------|
| Headline | *"Did we get the right people?"* |
| Layout | Vertical list of contact cards, one per spoken name |
| Card content | Suggested contact (name, photo, last-known relationship signal) + a "Yes / No / Different one" affordance |
| Disambiguation | When multiple matches exist, show top 2-3 candidates as alternatives |
| Manual override | "Add someone we missed" affordance at bottom |
| Permission request (contacts) | At top of screen: *"We need your contacts to find the people you just named."* |
| Confirm action | Single button: *"Looks right"* |

**Design owner:** Match-confirm screen detailed design (correction interactions, no-match state, multi-match disambiguation copy) — handed off to incoming designer.

### Screen 4 — Pre-Composed Send

| Element | Specification |
|---------|---------------|
| Headline | *"What's something you'd love to do but haven't?"* |
| Input | Single free-text field (one line) |
| Auto-compose | As user types, system generates a survey-default message: *"Hey, random — would you be up for [thing] sometime in the next two weeks?"* |
| Format toggle | Two pill buttons: **Survey** (default) / **Ambient plan**. Switching changes the message format and the recipient affordance. |
| Audience | User's confirmed inner circle, all pre-checked. *"+ Add more"* affordance for power users (can extend up to 15 total). **Layout: grouped, not listed.** Audience renders as a soft loose grouping of small candle-faces clustered together above the message — not a vertical pill list. The visual grammar is *"these people belong in the same sentence."* Same pixels read as "lighter load" for Dana (ten people, one screen) and "belonging" for Priya (my people, together). This is the constellation idea demoted from gesture to layout. |
| Send button | **"Open the door"** (Sally's framing) |

**Send confirmation behavior:** On tap, the message text drifts upward like a paper boat (warm register) OR the screen transitions calmly to a dashboard (executive register — see "Copy Register Flex" section). Onboarding completes only when this send happens.

---

## Sender-Side UX

### Send Composer (Post-Onboarding)

The composer is the same UI Priya saw in screen 4, with progressive enhancements:

- **Recipient memory ("last-used list"):** the most recently used audience subset is offered as a one-tap reuse pill at the top.
- **Recency strip:** below the audience pills, a horizontal strip of the user's recently-coordinated-with contacts (in recency order). Allows fast power-user selection.
- **Format toggle:** Survey / Ambient plan persists; user's last-used format is the default for next send.
- **Body field:** free-text. UX-enforced grammar guidance for ambient plans — no question marks (gentle inline nudge if user types one).

### Post-Send Wait Screens

#### Warm Register (Priya)
| Element | Specification |
|---------|---------------|
| Animation | Sent message text drifts upward like a paper boat |
| Confirmation copy | *"Three people just heard from someone they like."* |
| Companion prompt | *"While they think — what are you hoping for this Saturday?"* (small journaling field, optional) |

#### Executive Register (Dana)
| Element | Specification |
|---------|---------------|
| Animation | Message simply transitions; no celebration |
| Confirmation copy | *"You handled this in 38 seconds. Usually takes you 18 messages."* (when system has enough send history to compute the math) |
| Layout | Calm dashboard view of the planned event with recipient avatars |

#### Copy Register Flex — How It Works

The system does not ask the user "are you Priya-shaped or Dana-shaped?" The flex is driven by **observed behavior** over the user's first few sends:

- New user, slow inner-circle capture, hesitant first send → warm register
- Fast inner-circle capture, multiple sends in week 1, recency strip well-utilized → executive register

Specific mechanism (signal-based, not mode-toggle):

| Signal | Implication |
|--------|-------------|
| User has < 3 lifetime sends | Warm register |
| User has 3+ lifetime sends with > 70% response rate | Executive register |
| User has named > 8 inner-circle contacts | Executive lean |
| User dismisses warm-register prompts ("not now" on journaling prompts) repeatedly | Executive lean |

The flex is **soft** — never an explicit switch the user notices. Copy variations are A/B-able for refinement.

**Design owner:** Detailed copy variations for both registers + signal thresholds — handed off to incoming designer.

### Day-Of Mechanics (Ambient Plan)

A user posted "Farmer's market Saturday around 10" three days ago. 2 people tapped "I might come too."

Saturday 9:45am behavior:
- A single passive notification fires to the 2 "I might come too" responders: *"[Sender] is heading to the farmer's market now."*
- No demand to confirm. No "are you actually coming?" check-in. No attendance tracking by default.
- For users who have **opted in** to attendance feedback (settings toggle), a soft prompt appears the day after: *"Did people show?"* with simple count input. Used to feed the silent-churn quality gate (V1 metric for ambient plan health).

### Ephemerality (Hard V1 Rule)

Ambient plans expire from the user's view the day after the planned time. **No archive. No "your plans" tab. No streak adjacency. No history.** Plans are *moments*, not *records*. Without this, the format becomes the instrument of the user's self-evidence of loneliness over time.

### Soft Routing on Consecutive Failures

If a user posts 2 ambient plans in a row with zero "I might come too" taps, the next composer session defaults to **survey** format with copy:

> *"Want to ask first?"*

This is redirection, not consolation. The system gently suggests a less exposing format without lecturing.

---

## Weekly Engagement Nudge

V1's replacement for share-sheet/external-trigger entry (deferred to V1.5).

### When

Single contextual push notification each Friday afternoon (local time per user time zone).

### Copy

> *"Anyone you'd want to see this weekend?"*

Notification body is intentionally brief — the question itself is the entire ask.

### What It Opens Into

Tapping the nudge bypasses the home screen and opens directly into the **send composer** with three things pre-filled:

1. **Last-used recipient list** pre-checked (recipient memory + grouped layout from Screen 4 design)
2. **Survey format** pre-selected (the V1 default for low-stakes initiation)
3. **Soft suggested prompt text** in the body field (e.g., *"What sounds good Saturday?"*) — fully editable

The user's path from notification tap to SEND is one to two taps. This is the lighter-load test applied to the most fragile moment — catching a plan-shaped thought before it evaporates.

### Why Not Share-Sheet (V1)

Round 7 walked back the round-3 conviction that share-sheet integration was V1-critical. The reasoning: V1 has three engineered initiation moments (onboarding first-send, weekly Friday nudge, reciprocity prompt). Together they cover the north-star metric without share-sheet's surface-area complexity (cramped composer, separate audience picker, content-type-specific previews). If post-launch telemetry shows Marcus-types ignoring the Friday nudge but Dana-types reaching for an external-trigger path, share-sheet earns its V1.5 slot on evidence — not intuition.

### Frequency Discipline

The nudge fires **once per week**. No multi-day variants. No "you've ignored the last 3 — try this!" escalation copy. If the user doesn't engage, the system goes quiet until next Friday. This honors the lighter-load test: a weekly question removes a thing from the user's shoulders by being a single, expected, predictable touch — not a barrage.

**Design owner:** Detailed notification copy variations, snooze/disable controls, and time-of-day windowing — handed off to incoming designer.

---

## Receiver-Side UX (Web Flow)

### Mission

The receiver's web page is the single most important screen in the V1 product. It is the **first impression of Tribes for everyone except the user themselves.** It must:

- Not feel like a landing page
- Not feel like a system notification
- Feel like a friend's invitation that happens to live on the web

The receiver is the *primary beneficiary* in any given send. The sender did the work; the receiver receives the molecule of belonging. The page's job is to *not undo* what just happened.

### SMS Preview Text

**Ambient plan preview** (locked):
```
Sarah → I'm probably at the farmers market Saturday morning. Tap if you want the details. No reply needed.
```

**Survey preview** (locked):
```
Sarah → quick thing. What sounds good Saturday: hike, brunch, or movie?
```

The arrow is a tell that this is Sarah talking, not a marketing system. *"No reply needed"* defuses obligation. *"Quick thing"* tells the recipient the cost up front.

### Page Open

| Element | Specification |
|---------|---------------|
| Initial state | Half-beat of stillness. No spinner, no logo, no "Welcome to Tribes." |
| Background | Warm-dark canvas |
| First visible | Sender's name and photo, large, near the top |
| Tribes branding | **Invisible.** Not in the header, not in the footer (until app-prompt threshold reached). The relationship is the product. |
| Brand-soul line (the body) | *"Sarah's thinking about Saturday and was thinking about you."* |

This line is the entire V1 brand promise compressed into nine words. *"Was thinking about you"* is the load-bearing fragment — it does the emotional work.

The page is designed to serve the **loneliest plausible recipient** — a close friend reads it as affection; a drifting friend reads it as reconnection; a lonely Jamie reads it as rescue. The line works at all three altitudes.

### Survey Page (After Brand-Soul Line)

| Element | Specification |
|---------|---------------|
| The question | Sender's question in their own words ("would you be up for hiking sometime in the next two weeks?") |
| Options | 2-5 tappable chips, multi-select |
| Submit | None — taps register live |
| Optional reply field | Single line, placeholder: *"say something nice"* |
| After-tap copy | *"Sarah will see this. That's it — go enjoy your day."* |

### Ambient Plan Page (After Brand-Soul Line)

| Element | Specification |
|---------|---------------|
| The plan | Sender's plan in plain words ("I'm probably going to the farmer's market Saturday around 10") |
| Affordance | One button: **"I might come too"** |
| Quiet exit | Secondary button: *"Good to know"* (never "Decline") |
| After-tap copy | *"Sarah will see this. That's it — go enjoy your day."* |

### What's NOT on the Page

- No "Yes / No / Maybe" trio (Maybe leaks ambivalence)
- No "Get the app" prompt on first visit (kills brand-soul)
- No event-detail block (for ambient — there are no details by design)
- No who-else-responded counter (visible only behind opt-in inquiry link)
- No tribe-name or system-context ("This is from Sarah's 'Hiking Buddies' tribe")

### App Prompt — When and How

The "Get the app" prompt does **not appear** on first visit.

The prompt surfaces when **either** of two thresholds is met (whichever fires first):

**Primary signal — confirmed presence (preferred):** the recipient has confirmed presence at a coordination at least once, signaled via opted-in sender attendance feedback. Mary's reciprocity-readiness reframe: presence is the conversion signal, not volume. Receipt without follow-through means the recipient is still in receive-mode; receipt-plus-presence means they've crossed into participation.

**Volume fallback:** for invites coming from senders who haven't opted into attendance feedback, the system can't observe presence — fall back to "responded to 2+ invitations from 2+ different senders" as the secondary signal.

When either threshold is met, a soft line appears at the bottom of the receiver page:

> *"Tribes is the app Sarah used to send this. It's small. You don't need it to reply. Want to send your own?"*

The third sentence is the entire pitch. The download is incidental to the function — we lead with *"Want to send your own?"* (agency), not *"Download Tribes"* (acquisition).

### Optional Self-Attestation (Tertiary Presence Signal)

If the recipient revisits the page after the planned date has passed (rare in practice — recipients are not expected to return), the page MAY show a soft prompt: *"Did you make it?"* with a single tappable confirmation. Used as a fallback presence signal when the sender hasn't opted into attendance feedback. Allowed but not relied upon; the bulk of the presence signal will come from sender attendance feedback or volume fallback.

### Inquiry Link — Who Else Has Responded

Hidden by default. A small affordance — *"see who's coming"* — reveals a list of consenting respondents on demand. This kills surveillance (not pushed at the recipient) without removing social proof for those who want it.

### V1 Metric — Response Rate

The right metric for the receiver page is **response rate**: percentage of link-taps that produce a tapped answer within 24 hours. Target: > 70%.

**Conversion-to-install is a derived metric, never optimized.** If response rate is healthy, downloads will follow when the recipient has something they want to initiate. If we optimize for download, we degrade response rate trying — and the loop dies at the source.

---

## Reciprocity Prompt UX

### Trigger

7 days after a hangout occurred (signaled either by sender confirmation or by user-confirmed attendance via the opt-in toggle), the system surfaces a prompt to the original recipient (the person who attended the event).

### Copy (Locked Direction)

> *"You [attended/did/went to] [the farmer's market] with [Sarah]. What's something you'd want to invite her to?"*

Anchored to a **specific completed event** and a **specific person** — never a generic nudge. Generic nudges were the failure mode of the original Alex-the-lapsed-user journey.

### Affordance

| Action | Behavior |
|--------|----------|
| Act on it | One tap opens a pre-composed send (defaults to inviting the named person + maybe 2 others from the original event) |
| Dismiss | One tap dismisses for 7 days; resurfaces with a different anchor event if available |
| Mute for this person | Hidden in the dismiss menu — for cases where the user genuinely doesn't want to reciprocate |

### Why It's V1 (Not V1.5)

Without the reciprocity prompt, the receiver→initiator transition relies entirely on the user spontaneously deciding to send something. That's the loneliness paradox in action. The prompt is the **engineered moment** that flips a Transplant from passive to active and gives a Coordinator the eventually-arriving "someone thought of me first" molecule.

The north-star metric (unsolicited inclusion within 7 days of install) is unreachable without this mechanic.

---

## Anti-Patterns

V1 anti-patterns, extending the original PRD list:

| Anti-Pattern | Why to Avoid |
|--------------|--------------|
| Maybe state (anywhere) | Leaks ambivalence, creates evidentiary record |
| Archive of user's own ambient plans | Slow-leak failure mode — user authors their own loneliness log |
| Aggregate response counter shown to sender | Primes expectation, manufactures disappointment |
| Public feed of any kind | Performance pressure; conflicts with relaxed-confidence emotional goal |
| Conversion pressure on receiver's first visit | Degrades the felt-belonging moment we just delivered |
| Default attendance measurement | Reintroduces survey semantics through the back door — kills the format |
| Sentimental copy for executive register | Patronizes Coordinators (Sally: "Recognition is too close to applause; Dana would find it suspicious") |
| Mechanical copy for warm register | Feels cold to a Transplant who needs tenderness |
| Auto-add contacts | The user names; the system suggests; the user confirms. Always. |
| Broadcast (no audience selection) | No public surface; plans go to user-selected audience only |
| Re-introducing labeling/Life-Domains/flick UI in V1 | The labeling-as-gate wound — we explicitly rebuilt V1 around this constraint |
| Storing voice audio | Transcription only; discard audio after match |
| Varying the brand-soul receiver line across sends | Sameness is liturgy; variation reveals the system. *"X is thinking about Saturday and was thinking about you"* stays constant. Vary content (photo, day, plan), never the frame. |
| Showing the recipient any growth/cumulative stat ("5 people thought of you this month") | Slow-leak principle is symmetric. The instant we render the number the user starts watching it; the month it drops we've manufactured a loss they wouldn't otherwise have noticed. Growth is felt, not displayed. |

---

## Design System Foundation

The visual design system survives the V1 direction reset largely intact, with the following adjustments. Tokens still apply; the kinetic-flick-specific components (radial ring, label stickers, contact tokens, three-zone layout) are deferred along with the labeling experience.

### Color Palette: "Warm Adventure"

#### Primary Colors
| Role | Color | Hex | V1 Usage |
|------|-------|-----|----------|
| Primary | Sunset Coral | `#E86A58` | "Open the door" send button, active states |
| Primary Dark | Terracotta | `#C4463A` | Pressed states |
| Primary Light | Peach | `#FFB4A8` | Soft highlights, warm-register backgrounds |

#### Secondary Colors
| Role | Color | Hex | V1 Usage |
|------|-------|-----|----------|
| Secondary | Ocean Teal | `#2A9D8F` | Confirmations, "I might come too" success states |
| Secondary Dark | Deep Teal | `#1E7268` | Pressed states |
| Secondary Light | Mint | `#A8E6CF` | Success backgrounds |

#### Neutral Colors (Dark Mode Primary)

| Role | Color | Hex | V1 Usage |
|------|-------|-----|----------|
| Background | Deep Night | `#121212` | App background |
| Surface | Dark Charcoal | `#1E1E1E` | Cards, elevated surfaces |
| Surface Elevated | Soft Charcoal | `#2A2A2A` | Modals, sheets |
| Text Primary | Warm White | `#FAF8F5` | Body text |
| Text Secondary | Soft Gray | `#B0B0B0` | Secondary text |
| Text Tertiary | Muted Gray | `#6B6B6B` | Placeholder, disabled |
| Divider | Dark Line | `#333333` | Subtle separators |

Domain colors and Life-Domain colors from the original spec are **deferred to V1.5** along with the domain concept.

### Typography System

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display | SF Pro Display | Bold | 32-40pt |
| Headline | SF Pro Display | Semibold | 24-28pt |
| Title | SF Pro Text | Semibold | 18-20pt |
| Body | SF Pro Text | Regular | 16pt |
| Caption | SF Pro Text | Regular | 14pt |
| Label | SF Pro Text | Medium | 12-14pt |
| Brand-soul body line (receiver page) | SF Pro Display | Light | 22pt | (handwritten-feel weight) |

**Rationale:** System fonts (SF Pro) provide native iOS feel, zero loading delay, automatic Dynamic Type support.

### Spacing System

Base unit: 8pt.

| Token | Value | Usage |
|-------|-------|-------|
| `space-xs` | 4pt | Tight spacing |
| `space-sm` | 8pt | Small gaps |
| `space-md` | 16pt | Standard padding |
| `space-lg` | 24pt | Generous spacing |
| `space-xl` | 32pt | Section breaks |
| `space-2xl` | 48pt | Page-level padding |

### Elevation

| Level | Shadow | Usage |
|-------|--------|-------|
| Elevation 0 | None | Background |
| Elevation 1 | `0 1px 3px rgba(0,0,0,0.30)` | Cards at rest (dark mode) |
| Elevation 2 | `0 4px 12px rgba(0,0,0,0.35)` | Active cards |
| Elevation 3 | `0 8px 24px rgba(0,0,0,0.40)` | Modals, bottom sheets |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 4pt | Small chips, buttons |
| `radius-md` | 8pt | Cards, inputs |
| `radius-lg` | 16pt | Modals, larger containers |
| `radius-full` | 50% | Avatars, round buttons |

---

## Component Strategy

### V1 Custom Components

| Component | Purpose |
|-----------|---------|
| **Voice Capture Field** | Hold-to-talk or tap-to-toggle mic input with live transcription chips |
| **Match-Confirm Card** | Vertical list item with suggested contact + "yes/no/different" affordance |
| **Send Composer** | Free-text field + format toggle (Survey/Ambient) + audience pills + "Open the door" button |
| **Recipient Recency Strip** | Horizontal scroll of recently-coordinated-with avatars |
| **Receiver Web Page (Survey)** | Mobile web template: sender header + brand-soul line + chip options |
| **Receiver Web Page (Ambient)** | Mobile web template: sender header + brand-soul line + plan body + "I might come too" |
| **Reciprocity Prompt Card** | Anchored prompt with one-tap accept and dismiss |

### V1 Material Components Used As-Is (or themed)

- BottomNavigationBar (limited — see Navigation section)
- ListView, ListTile, Card
- TextField, Switch
- AlertDialog, BottomSheet, SnackBar
- ElevatedButton, TextButton, IconButton
- CircularProgressIndicator, LinearProgressIndicator

### V1 Components NOT Built (Deferred to V1.5+)

- Domain Tab Bar — no domains in V1
- Label Ring — no radial UI in V1
- Contact Token (draggable) — no flick gesture in V1
- Label Sticker — no labels in V1
- Detail Zone Carousel — no labeling interface in V1
- Tribe Card, Tribe Builder — no tribes in V1
- Voice-bulk-labeling sheet — distinct from V1 voice-name-capture

---

## Navigation

### Primary Navigation (V1)

The original spec proposed a 4-tab bottom navigation (Label, Tribes, Activity, Profile). V1 consolidates dramatically:

| Tab | Icon | Label | Destination |
|-----|------|-------|-------------|
| Compose | ✉️ (or similar) | Send | Send composer (default screen post-onboarding) |
| Activity | 📬 | Activity | Coordinations sent + received, response status |
| Profile | 👤 | Profile | Settings + account + inner-circle management |

No "Tribes" tab in V1 — the saved-tribe concept is deferred. No "Label" tab — labeling is V1.5+.

### Secondary Navigation

| Pattern | Trigger | Behavior |
|---------|---------|----------|
| Send composer (anywhere) | "+" FAB on Activity tab | Opens composer with last-used audience pre-selected |
| Reciprocity prompt | Push notification or in-app card | Deep-links to pre-composed send |
| Receiver page | SMS link tap | Opens mobile web (no app required) |

---

## State Patterns

### Empty States

| Screen | Empty State | CTA |
|--------|-------------|-----|
| Activity (no sends yet) | *"Your activity will live here. Compose your first send to start."* | "Compose" button |
| Activity (no responses yet) | *"Waiting on responses. We'll let you know."* | (no CTA — soft) |
| Profile / inner circle (post-onboarding edit) | Editable list of named contacts | "Add or change someone" |

### Loading States

| Context | Loading Pattern |
|---------|-----------------|
| Voice transcription | Live waveform + chips appearing as text resolves |
| Address-book match | Skeleton cards (shimmer) |
| Send in flight | Button shows brief inline spinner; transitions to wait screen on success |

### Error States

| Error Type | Display | Recovery |
|------------|---------|----------|
| Network offline | Banner: "No connection. We'll send when you're back." | Auto-retry when online |
| Send failed | Toast: "Couldn't send. Tap to retry." | Tap toast |
| Voice transcription unrecognized name | Inline soft message: *"Couldn't find that one — type it instead?"* | Typed-input fallback |
| No contact match | Card shows "Add someone we missed" affordance | Manual add |

### Success States

| Success Type | Feedback | Duration |
|--------------|----------|----------|
| Inner circle confirmed | Subtle confirmation, transition to next screen | 200ms |
| First send sent | Paper-boat (warm) or dashboard transition (executive) | 1 second |
| Response received | Push notification + in-app card | Persistent until viewed |
| Reciprocity prompt accepted | Composer opens pre-filled | Instant |

---

## Confirmation Patterns

| Action | Confirmation Required | Pattern |
|--------|----------------------|---------|
| Delete inner-circle member | Yes | Dialog: "Remove [Sarah] from your inner circle?" |
| Delete account | Yes | Multi-step with password |
| Send coordination | No | Optimistic; the act itself is the confirmation |
| "Good to know" exit (receiver page) | No | Instant dismiss |
| Reciprocity prompt dismiss | No | Instant; resurfaces with different anchor next week |

---

## Responsive Design & Accessibility

### Platform Focus

| Platform | V1 Support | Strategy |
|----------|------------|----------|
| iPhone | ✅ Primary | Full optimization for all iPhone sizes (iOS 15+) |
| iPad | ⏳ V1.5 | Scaled phone layout initially |
| Android | ⏳ V1.5+ | After iOS validation |
| Web | ✅ Receiver only | Mobile web for non-app response flow |
| Desktop | ❌ None | No desktop support planned |

### iPhone Device Adaptation

| Device Class | Screen Width | Voice UI Sizing | Compose Sizing |
|--------------|--------------|-----------------|----------------|
| iPhone SE (small) | 375pt | Compact mic + chip area | Compact composer |
| iPhone 14/15 (standard) | 390pt | Standard | Standard |
| iPhone 14/15 Plus / Pro Max | 428pt+ | Expanded spacing | Expanded composer |

### Accessibility — V1 Required

| Requirement | Target | Implementation Notes |
|-------------|--------|----------------------|
| Color contrast | 4.5:1 minimum (WCAG AA) | Design system verified |
| Touch targets | 44x44pt minimum | All interactive elements |
| Dynamic Type | Full support | SF Pro scales automatically |
| VoiceOver | Full coverage | All interactives have semantic labels; voice-capture announces transcribed names |
| Voice-capture alternative | Required | Typed-input path equivalent in functionality and outcome |
| Reduced motion | Honor system preference | Paper-boat animation disabled; instant transitions |

### Voice Capture Accessibility

The voice-first input is a primary accessibility consideration. The typed-input fallback must be:

- **Discoverable** — visible "Type instead" link on screen 2, not buried
- **Equivalent** — same names entered via typing must produce the same match-confirm flow
- **Persistent** — once a user chooses typed input, the system remembers (no re-prompting on subsequent sessions)

### VoiceOver Announcements

| Element | Announcement |
|---------|--------------|
| Voice mic button | *"Tap and hold to speak names of your inner circle"* |
| Transcribed chip | *"[Name] — double tap to remove"* |
| Match-confirm card | *"[Suggested name] — does this match? Double tap to confirm, or swipe for alternatives"* |
| Send button | *"Open the door — send this coordination to [N] people"* |
| Receiver page button | *"I might come too — let [Sender] know you'll try to be there"* |

### Reduced Motion

When system Reduce Motion is ON:
- Paper-boat animation disabled; instant fade
- Recency strip horizontal scroll uses snap, not inertia
- Match-confirm transitions are instant
- No confetti / no celebrations

---

## Implementation Guidelines

### Per-Feature Checklist (V1)

- [ ] All interactive elements have semantic labels
- [ ] Touch targets ≥ 44pt
- [ ] Color contrast ≥ 4.5:1
- [ ] VoiceOver announces state changes
- [ ] Voice-input has typed alternative
- [ ] Reduced motion honored
- [ ] Dynamic Type tested at 200%
- [ ] Lighter-load test passed: did this just remove a thing or add one?

### Copy Register Flex Implementation Notes

The dual-register copy pattern is novel and requires tooling:

- All flex-eligible strings should be authored in **two variants** (warm + executive) and tagged for register
- The signal-detection logic determines which variant a given user sees, with rollover from warm-register defaults to executive-register defaults based on observed behavior
- A/B testing slots should exist for both registers independently — they may evolve at different rates

---

## Open Items (Handed Off to Incoming Designer)

The 2026-04-30 user direction explicitly hands off the detailed UX design for these items to a different developer/designer:

1. **Voice-capture mic UI design** — affordance, waveform vs. pulse, error states, multi-name disambiguation, low-confidence transcription handling
2. **Match-and-confirm screen design** — card pattern, alternative-match disambiguation, no-match state, manual-add affordance
3. **Copy register flex** — exact strings for both variants across all flex-eligible touchpoints; signal thresholds for register selection
4. **Coordinator-side first-send post-send dashboard** — the "you handled this in 38 seconds" reframe screen layout
5. **Reciprocity prompt UX details** — copy variations, dismiss UX, repeat-handling
6. **Attendance-feedback toggle UX** — settings-level placement, opt-in copy, post-event prompt design
7. **Friday weekly nudge UX details** — exact notification copy variations, snooze/disable controls, time-of-day window per user time zone, in-composer pre-fill behavior

**Resolved in Round 7 (2026-05-02):**

- ~~Share-sheet / external-trigger send~~ — DEFERRED to V1.5. Replaced for V1 by Friday weekly nudge.
- ~~Sally's "constellation" idea~~ — animated cluster cut; constellation lives in V1 as the **grouped-not-listed audience layout** on Screen 4 (see Onboarding section above).
- ~~Jamie return-visit warmth~~ — RESOLVED. Brand-soul line stays invariant across sends (sameness is liturgy); no growth stats; install-prompt threshold changed to confirmed-presence with volume fallback (see receiver-flow section above).

---

## Project Status

| Field | Status |
|-------|--------|
| UX spec authoritative state | Updated 2026-04-30 — supersedes prior versions |
| Companion PRD | `_bmad-output/shared/prd.md` (rewritten 2026-04-30) |
| Session log | `_bmad-output/shared/session-recovery-2026-04-28-v1-ux-direction.md` |
| Detailed visual mockups | Original `ux-design-refined-mockup.html` and `ux-design-directions.html` are now stale — they depict the V1.5+ labeling experience, not V1 |

---

_End of UX Specification._
