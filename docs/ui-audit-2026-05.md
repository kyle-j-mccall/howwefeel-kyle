# HWF Mobile UI/UX Audit — 2026-05-02

Audit of the 14 shipped screens and 15 shared components in `mobile/` against the centralized theme at `mobile/src/theme/`. Goal: identify visible jank, accessibility gaps, and theme-bypass inconsistencies, and produce a concrete bead breakdown so each fix can be slung to a polecat.

---

## Summary

| Severity | Count | Definition |
|---|---|---|
| **P0** | 4 | Broken or accessibility-blocking — fix first |
| **P1** | 11 | Visible jank or strong inconsistency users will notice |
| **P2** | 9 | Polish gap or pattern divergence |
| **P3** | 4 | Nit |

The single most pervasive issue is **theme bypass**: roughly two-thirds of the screens and components hardcode pixel values, font weights, or colors instead of pulling from the theme module. The theme is well-designed and the hook (`useTheme()`) is in use everywhere — but findings inside `StyleSheet.create({...})` blocks routinely fall back to literals. A focused refactor sweep can land most of this with low risk.

The second cluster is **accessibility**: missing `accessibilityLabel`/`Role` on key interactive elements (EmotionWheel quadrants, CalendarHeatmap cells, JournalQuickAccess cards, LogFAB), and a few sub-44pt tap regions.

The third cluster is **state persistence**: Zustand stores have no AsyncStorage / expo-secure-store layer, so notification preferences, favorites, and (eventually) theme preference are lost on every cold launch.

---

## Theme reference (the "right way")

These are the tokens every screen and component should be reaching for.

**Spacing scale** (`mobile/src/theme/spacing.ts`):
`0:0, 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 7:28, 8:32, 10:40, 12:48, 16:64`

**Radii**: `sm:6, md:10, lg:16, xl:24, full:9999`

**Typography sizes**: `xs:11, sm:13, md:15, lg:17, xl:20, 2xl:24, 3xl:28, 4xl:34`
**Weights**: `regular:400, medium:500, semibold:600, bold:700`
**Line heights**: `tight:1.2, normal:1.5, relaxed:1.75`

**Color tokens** (`mobile/src/theme/colors.ts`):
`background, surface, surfaceElevated, border, borderSubtle, text, textSecondary, textTertiary, textInverse, primary, primaryMuted, success, error, warning, tabBar, tabBarBorder, emotionYellow/Red/Green/Blue, transparent, overlay`

**Shadows**: `sm, md, lg`

> ⚠️ **Theme gap**: `colors.textInverse` is defined as `#0F0F14` (dark, intended for use *on* a light surface). Several components reach for white text on a colored background (purple primary, emotion family colors) and end up hardcoding `'#fff'` because the theme has no token for that case. **Recommendation**: add `colors.textOnPrimary: '#FFFFFF'` (or rename existing tokens to make the contrast direction explicit).

---

## Cross-cutting findings

### Navigation (`mobile/src/navigation/RootNavigator.tsx`)

- **P1** Modal-presentation inconsistency. `LogScreen` and `ActivityScreen` are configured with `presentation: 'modal'` (RootNavigator.tsx:39, 57) but `LogContextScreen` (line 45), `ActivityLibraryScreen` (line 49), and `JournalEntryScreen` (line 62) inherit the default card slide. From the user's perspective these dives feel like part of the same flow but animate differently — pick one presentation per logical flow and apply consistently.

### Status bar & launch (`mobile/App.tsx`)

- **P1** `expo-status-bar` is installed (`package.json:23`) but never imported. `App.tsx` has no `<StatusBar />` element, so the app falls back to the OS default — on iOS that's auto-detected from background brightness, which works for a dark app, but on Android it's a coin flip. Add `<StatusBar style="light" />` at the root.
- **P0** No `SafeAreaProvider` at the App root. `react-navigation` v7 includes one internally, but components calling `useSafeAreaInsets()` outside the navigator (none currently, but this is fragile) would crash. Wrap with `<SafeAreaProvider>` from `react-native-safe-area-context` for safety.

### Theme threading (`mobile/src/theme/index.ts`, `mobile/src/screens/DisplayScreen.tsx`)

- **P0** Theme is a static const (`theme/index.ts:6`) — there's no provider, no system-preference detection, and no setter. `app.json` forces `userInterfaceStyle: "dark"`. Meanwhile `DisplayScreen.tsx:8-18` shows three theme options (system/light/dark) with `dark` hardcoded as `activeTheme` — selecting a different option does nothing. Either remove the DisplayScreen theme picker until it's wired, or wire it: add a `themeStore` with `themePref: 'system' | 'light' | 'dark'`, persist it, and have `useTheme()` resolve at runtime against system preference.

### Animation engine (`mobile/babel.config.js` (absent), `mobile/package.json:28`)

- **P2** No `babel.config.js` exists. Historically `babel-plugin-react-native-reanimated` was required at the bottom of the plugins list. With **Reanimated v4.1.1** (the installed version), worklet support is handled by the `react-native-worklets` package, so a missing babel.config might be intentional. EmotionWheel does use `useAnimatedStyle` and `useReducedMotion` and the app is running clean on the sim, suggesting the chain is wired. **Action**: verify on a fresh device install (cold cache) that worklet animations actually run; document expectation in `mobile/README.md`.

### State persistence (`mobile/src/store/`)

- **P1** Zustand stores have no persistence. `settingsStore.ts:18-37` (notification prefs), `activityStore.ts` (favorites + completed history), and `logStore` (in mock mode it's seeded; in real mode it would lose all logs) all live in memory only. `expo-secure-store` is installed (`package.json:22`) but unused. Apply Zustand's `persist` middleware with an `expo-secure-store` adapter, scoping which fields persist (notification prefs ✓, favorites ✓, completed history ✓, mock seed ✗).
- **P2** Mock-mode env var inconsistency. `logStore.ts:19` checks `EXPO_PUBLIC_MOCK_MODE`; `settingsStore` and `activityStore` hardcode mock seed in initialization. Standardize.

### Reduced motion

- **P2** `useReducedMotion()` from Reanimated is called only in `EmotionWheel.tsx:84`. Other animations (haptic feedback, segment toggles, modal transitions) are not gated. Use `AccessibilityInfo.isReduceMotionEnabled()` (or a reusable hook) to gate haptics-only paths and any future cross-screen transitions.

### Keyboard handling

- **P1** `LogContextScreen.tsx` wraps content in `ScrollView` with `keyboardShouldPersistTaps="handled"` (line 60) but no `KeyboardAvoidingView`. The journal-note `TextInput` (lines 113-132) is at the bottom of the screen and will be obscured by the keyboard on devices smaller than iPhone 14 Pro. `JournalEntryScreen.tsx:93-96` does this correctly — copy that pattern.

### Safe-area pattern divergence

- **P1** Three different patterns are in use across the app:
  - `HomeScreen.tsx:21` uses `useSafeAreaInsets()` and applies padding manually
  - `JournalScreen.tsx:82-84` and `JournalEntryScreen.tsx:91` use `<SafeAreaView edges={[...]}>`
  - `LogScreen.tsx`, `ActivityScreen.tsx`, settings sub-screens use neither and rely on header padding
  
  **Action**: pick one pattern (recommend `<SafeAreaView edges={[...]}>` since it's declarative) and apply across the board. Settings sub-screens currently risk content under the notch on iPad / smaller iPhones.

### Tab bar

- Nothing significant — `BottomTabNavigator.tsx:19-24` correctly uses `colors.tabBar`, `colors.tabBarBorder`, `colors.primary`, `colors.textTertiary`, and `typography.sizes.xs / weights.medium`.

---

## Findings by screen

### `HomeScreen.tsx`
- **P1** Hardcoded `marginRight: 12` (line 101) → `spacing[3]`.
- **P1** Hardcoded `fontWeight: '700'` in StyleSheet (line 99) → `typography.weights.bold`.
- **Highlights**: clean store side-effect cleanup (lines 23-28); FAB anchored correctly.

### `LogScreen.tsx`
- **P1** Hardcoded `gap: 12` (line 120) → `spacing[3]`.
- **P1** Hardcoded `paddingHorizontal: 16` (line 136) → `spacing[4]`.
- **P1** Hardcoded `fontWeight: '600'` (line 130) → `typography.weights.semibold`.
- **P2** No animated transition between wheel → label → intensity steps; users get an instant flip with no spatial cue.
- **P3** `hitSlop={12}` (line 66) is non-scale → use `spacing[3]`.

### `JournalScreen.tsx`
- **P2** Hardcoded `marginBottom: 8` (line 256) → `spacing[2]`.
- **P2** Hardcoded `paddingHorizontal: 32` (line 264) → `spacing[8]`.
- **Highlights**: `<SafeAreaView edges={['top']}>` (lines 82-84) is the pattern to standardize on; FilterChip is reusable.

### `LogContextScreen.tsx`
- **P1** Missing `KeyboardAvoidingView` (see Cross-cutting > Keyboard handling).
- **P1** Hardcoded `gap: 10` (line 165), `paddingHorizontal: 16` (line 169), `paddingHorizontal: 14` (line 180) — none match the spacing scale precisely; use `spacing[2 or 3]` and `spacing[4]`.
- **P2** No haptic feedback on save (line 50) — only on tag toggle (line 25).

### `InsightsScreen.tsx`
- **P2** Hardcoded `paddingTop: 16` (line 88) → `spacing[4]`.
- **Highlights**: consistent `marginTop: spacing[6]` between sections; correctly uses `<SafeAreaView edges={['top']}>` (line 36).

### `JournalEntryScreen.tsx`
- **P2** Hardcoded `marginRight: 12` (line 272), `marginTop: 2` (line 157) — the 2px is off-scale entirely (no token).
- **P2** Computed line-height `typography.sizes.md * typography.lineHeights.relaxed` (line 233) is over-engineered vs. the static-lineHeight pattern used elsewhere; standardize.
- **Highlights**: correct combo of `<SafeAreaView edges={['top','bottom']}>` + `<KeyboardAvoidingView>` + `<ScrollView>`.

### `InsightsScreen.tsx` / `ActivityScreen.tsx`
- **P1** `ActivityScreen.tsx:97` hardcodes `'#fff'` for primary-button text. `colors.textInverse` is `#0F0F14` (dark) which would be wrong here. This is a theme-token gap (see top): the right fix is to add `colors.textOnPrimary: '#FFFFFF'`, not to use `textInverse`.
- **P1** `ActivityScreen.tsx:133` hardcoded `paddingHorizontal: 10, paddingVertical: 4`; `lineHeight: 26` (line 142). Use spacing scale + `typography.lineHeights.normal * fontSize`.
- **P2** No animation on step transitions; progress bar updates instantly.
- **P3** `hitSlop={8}` (lines 52, 60) → `spacing[2]`.

### `SettingsScreen.tsx`
- **P2** Nested padding asymmetry — outer wrap uses `paddingHorizontal: spacing[6]`, individual rows add `paddingHorizontal: spacing[4]`. Result is uneven outer margin compared to other screens. Pick: drop inner row padding and rely on wrapper, or invert.
- **Highlights**: explicit `minHeight: 44` on rows (line 111) — this should be the pattern app-wide.

### `ActivityLibraryScreen.tsx`
- **P2** Hardcoded `marginBottom: 8` (line 76) → `spacing[2]`. Inconsistent with `marginVertical: spacing[4]` (line 52) elsewhere in same file.

### `AccountScreen.tsx`, `DataScreen.tsx`, `PrivacyScreen.tsx`, `DisplayScreen.tsx`
- **P2** Same nested-padding asymmetry as SettingsScreen (`spacing[6]` outer, `spacing[4]` inner row).
- **P2** None wrap content in SafeAreaView; rely on parent stack padding.
- **DisplayScreen.tsx P0** (covered in Cross-cutting > Theme threading) — the theme picker UI is orphaned from any state.

### `NotificationsScreen.tsx`
- **P1** Hardcoded `'#FFFFFF'` (lines 70, 166) — same theme-token gap as ActivityScreen; needs `colors.textOnPrimary`.
- **P1** Frequency segment outer padding `spacing[1]` (line 44) is 4px — visually compressed; consider `spacing[2]`.
- **Highlights**: thorough `accessibilityLabel` + `accessibilityRole` on every control (lines 53, 91, 103, etc.); explicit `minWidth: 44, minHeight: 44` on hour spinner buttons. **Use this screen as the a11y model for the rest of the app**.

---

## Findings by component

### `EmotionWheel.tsx` *(marquee interaction)*
- **P1** Hardcoded `'#fff'` on quadrant labels (line 128) → `colors.textOnPrimary` (after token added).
- **P1** Hardcoded `rgba(0,0,0,0.4)` for dim overlay (line 121) → use `colors.overlay`.
- **P1** No `accessibilityLabel` on the quadrant `Pressable`s; screen readers will announce nothing useful for the primary interaction of the app.
- **P2** Hardcoded `fontSize: 15` (line 129) → `typography.sizes.md`. Hardcoded `fontWeight: '600'` (line 130) → `typography.weights.semibold`.
- **Highlights**: `useReducedMotion` (line 84) properly disables the animation; haptics integrated; geometry is clean.

### `EmotionFamilyExpanded.tsx`
- **P1** Hardcoded `'#fff'` (line 47) → `colors.textOnPrimary`.
- **P2** Hardcoded paddings `16, 10` (lines 66-67) → spacing scale.
- **P2** Chips lack `accessibilityRole="button"` and explicit label; tap target depends on text length only.

### `IntensitySelector.tsx`
- **P2** Hardcoded `gap: 16, paddingVertical: 8` (lines 51-52) → spacing scale.
- **P1** No `accessibilityLabel` on dot `Pressable`s.
- **P2** Haptics fire without checking `AccessibilityInfo.isReduceMotionEnabled()`.

### `LogFAB.tsx`
- **P1** No press animation (no opacity/scale change), no haptic feedback on tap (lines 14-23). The marquee CTA of the entire app should pop.
- **P2** Hardcoded `bottom: 24, right: 24` (lines 35-36) → `spacing[6]`.
- **P1** No `accessibilityLabel="Log emotion"`.

### `CalendarHeatmap.tsx`
- **P1** Cells are 36×36pt (line 61) — at the minimum acceptable; `hitSlop` not used. No `accessibilityLabel` per cell. Popover appears with no transition.
- **P1** References `colors.textInverse` (line 123) on what's effectively a light family color background — same theme-gap pattern; switch to `colors.textOnPrimary` (or family-specific text token).
- **P2** Hardcoded `CELL_MARGIN: 3` (line 61), and `rgba(0,0,0,0.4)` overlay (line 121) → use `colors.overlay`.

### `EmotionFrequencyChart.tsx`
- **P3** Hardcoded `PAD_TOP: 4, PAD_BOTTOM: 4, COUNT_MARGIN: 8` (lines 12-16) → spacing tokens.
- **Highlights**: empty-data dashed line is a nice touch.

### `IntensityTrendChart.tsx`
- **P3** Hardcoded `PAD` object (line 12) literals.
- **Highlights**: handles empty data; multi-family rendering works.

### `WeeklySparkline.tsx`
- **P2** No day labels — users can't tell which bar is today vs Monday.
- **P3** Hardcoded `height: 40, gap: 4` (lines 58-59) — acceptable scale-internal but document as constants.

### `TopContextsList.tsx`
- **P3** Hardcoded `paddingVertical: 12` (line 95) → `spacing[3]`. `marginBottom: 2` (line 61) is off-scale.

### `JournalListItem.tsx`
- **P2** Hardcoded margins (lines 60, 65-66), `fontWeight: '600'` (line 36) → theme tokens.
- **Highlights**: pressed state via `surfaceElevated` is the right pattern.

### `JournalQuickAccess.tsx`
- **P1** Cards are `Pressable` but no pressed state and no `accessibilityLabel` (lines 35-48). Tapping feels dead.
- **P2** Hardcoded `fontWeight: '600'` (line 82), `lineHeight: 18` (line 86) → theme.

### `ActivityCard.tsx`
- **P1** Favorite button has `hitSlop: 8` → 32pt total touch region; below the 44pt guideline. Also missing `accessibilityLabel` and `accessibilityRole` (lines 42-50).
- **P2** Hardcoded `padding: 16` (line 58), `fontWeight: '600'` (line 68), `lineHeight: 18` (line 75) → theme.

### `StreakBadge.tsx`
- **P2** Hardcoded `fontWeight: '700'` (line 55), `marginTop: 1` (line 59) — the 1px is off-scale.

### `TimeRangeSelector.tsx`
- **P1** Pills lack `accessibilityLabel`. Selected pill correctly uses `colors.textInverse` (because the selected background is `colors.text` (white-ish), so the inverse is correct here — this is the intended use of `textInverse`).
- **Highlights**: spacing tokens used correctly throughout (lines 34-36).

### `TodayTimeline.tsx`
- **P1** Hardcoded `'rgba(255,255,255,0.12)'` for empty intensity dots (line 22); should be a theme token (e.g., add `colors.dotEmpty` or use `borderSubtle`).
- **P2** Several hardcoded margins (lines 33-34, 86, 95-96) and `fontWeight: '600'` (line 92).

---

## Bead breakdown — concrete fixes for polecats

These are sized 1–3 hours each. Order is by recommended attack sequence (theme tokens first so subsequent beads have a target).

| # | Title | Type | Priority | Scope | Notes |
|---|---|---|---|---|---|
| 1 | Add `colors.textOnPrimary` token and consume in EmotionWheel/Activity/Notifications | task | P1 | 1 file in theme + 4 component edits | Theme gap; unblocks several other beads |
| 2 | Add `colors.dotEmpty` (or extend `borderSubtle` semantics) and consume in TodayTimeline | task | P2 | 1 theme edit + 1 component edit | |
| 3 | Wire DisplayScreen theme picker to a `themeStore`; or remove the picker UI | task | P0 | New store, theme provider hook, DisplayScreen rewrite | If picker stays: also persist via expo-secure-store |
| 4 | Add `<StatusBar style="light" />` and `<SafeAreaProvider>` at App.tsx root | task | P1 | App.tsx | Trivially small but visible |
| 5 | Persist Zustand stores via `expo-secure-store` adapter | task | P1 | settingsStore, activityStore, optionally logStore | Use Zustand `persist` middleware |
| 6 | Standardize safe-area handling across all screens (use `<SafeAreaView edges>`) | task | P1 | ~10 screens | Pick one pattern; rip out the others |
| 7 | Wrap LogContextScreen in `KeyboardAvoidingView` (copy JournalEntryScreen pattern) | task | P1 | LogContextScreen.tsx | |
| 8 | Standardize modal vs card presentation in RootNavigator for related flows | task | P1 | RootNavigator.tsx | LogContext, ActivityLibrary, JournalEntry decisions |
| 9 | Replace hardcoded fontWeight strings with `typography.weights.*` (sweep) | task | P2 | ~12 files | Mechanical; use grep |
| 10 | Replace hardcoded spacing values with `spacing[*]` (sweep, screens) | task | P1 | LogScreen, LogContextScreen, JournalScreen, ActivityScreen, NotificationsScreen | Group by screen file |
| 11 | Replace hardcoded spacing values with `spacing[*]` (sweep, components) | task | P1 | ActivityCard, CalendarHeatmap, EmotionFamilyExpanded, IntensitySelector, JournalListItem, JournalQuickAccess, LogFAB, StreakBadge, TodayTimeline, TopContextsList | Group into 2 PRs of ~5 files for review |
| 12 | Add `accessibilityLabel`/`accessibilityRole` to all Pressable elements | task | P1 | EmotionWheel, EmotionFamilyExpanded, IntensitySelector, LogFAB, JournalQuickAccess, ActivityCard, CalendarHeatmap, TimeRangeSelector | Use NotificationsScreen as the model |
| 13 | Fix sub-44pt tap targets (ActivityCard favorite hitSlop, CalendarHeatmap cells) | task | P0 | 2 files | Accessibility-blocking on iOS HIG |
| 14 | Add LogFAB press animation + haptic feedback | feature | P1 | LogFAB.tsx | Scale + opacity on press; `expo-haptics` mediumImpact |
| 15 | Animate Log step transitions (wheel → label → intensity) | feature | P2 | LogScreen.tsx, components | Respect `useReducedMotion` |
| 16 | Animate ActivityScreen progress bar updates | feature | P2 | ActivityScreen.tsx | Reanimated `withTiming` |
| 17 | Fix Settings sub-screens nested padding asymmetry | task | P2 | Settings + 5 sub-screens | Pick wrapper-only or row-only |
| 18 | Standardize header padding via shared `<ScreenHeader>` component | task | P2 | New component + 6 screen edits | Eliminates per-screen drift |
| 19 | Extend reduced-motion gating beyond EmotionWheel (haptics + transitions) | task | P2 | shared hook + ~5 components | `useReducedMotion()` everywhere |
| 20 | Add day labels to WeeklySparkline | task | P3 | WeeklySparkline.tsx | M T W T F S S below bars |
| 21 | Verify Reanimated v4.1 worklets run on a fresh device install | task | P2 | mobile/README.md + manual test | Cold-cache install + EmotionWheel test |
| 22 | Standardize lineHeight pattern (computed vs static) and document in theme | task | P3 | theme/typography.ts + ~3 component edits | Pick computed or static |
| 23 | Standardize mock-mode env var across stores | task | P3 | settingsStore, activityStore | Use `EXPO_PUBLIC_MOCK_MODE` everywhere |

---

## Recommended attack order

1. **Foundation (do first, sequentially)**: #1 (theme token), #4 (status bar / safe-area provider), #3 (theme picker decision), #5 (persistence). These are short and unblock or enable later beads.
2. **A11y foundation (do in parallel after #1)**: #12 (labels), #13 (tap targets).
3. **Pattern sweeps (parallelizable, mechanical)**: #6 (safe-area), #9 (font weights), #10 + #11 (spacing).
4. **Polish (parallelizable)**: #7, #8, #14, #15, #16, #17, #18, #19, #20.
5. **Closing (verify + nits)**: #21, #22, #23.

Beads 10 and 11 are sized to be 2-3 hours each because the find-replace is mechanical but each touch needs a typecheck pass. Run them through CI individually so a regression on one doesn't block the rest.

---

## Methodology

- Three Explore subagents read all screens, components, and cross-cutting wiring in parallel under a single audit pass.
- Theme baseline established by reading `mobile/src/theme/{colors,spacing,typography,shadows,index}.ts`.
- Severities calibrated against iOS Human Interface Guidelines for tap targets (44pt) and standard a11y expectations (`accessibilityLabel` on every interactive element).
- All findings cite `file:line` so the implementing polecat can navigate without re-discovery.
- Live runtime was not exercised for jank perception (sim was running but screenshot capture not available from this audit pass); animation and gesture findings are based on code review of Reanimated/gesture-handler usage. **Action for implementing polecats**: re-test in sim after each fix to confirm perceived smoothness.
