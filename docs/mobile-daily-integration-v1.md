# Mobile + Journal daily tasks integration v1

## Scope and source history

- Branch: `integration/mobile-daily-journal-v1`, created from baseline.
- Baseline: `7cc4a7aca878b108dc222984642bb56131c2763e`.
- Mobile feature: `29b30f30a15d7c4f72335164d3dd347e0b6c1ded`.
- Daily feature: `dd9c8e8f803bb33e33cde015bf61a7cf0c0f5fed`.
- First merge, mobile: `24cb5784326b64f366bbb21b246482c351bb9d45`; 1218/1218 tests passed immediately afterward.
- Second merge, daily: `58929fce730314de402bf93de37baf34a2c5bf9f`.
- No feature history was squashed and no baseline/mobile branch was changed.

Only `src/views/PlanView.ts` and generated `main.js` conflicted. PlanView had adjacent state fields: mobile's `mobileCalendarExpanded` and daily's `meaningfulDays`/`preparedReviewPath`. All three were preserved. The resulting sidebar passes both the phone collapse state and meaningful-date resolver to the shared calendar. `main.js` was regenerated from the combined source, not manually spliced.

Manifest keeps its identity and `isDesktopOnly: false`; only version changes from `0.4.0-dev.4` to `0.4.0-dev.5`. Repository package metadata retains its pre-existing dev.1 value; Obsidian's deployed version comes from manifest.json.

## Cross-feature audit

Mobile production files `src/main.ts`, `WorkbenchShell.ts`, `TimeTraceMiniCalendar.ts`, `QuickJournalModal.ts` and `styles.css` match mobile feature content. Daily task index/adapter, Journal meaningful-content logic, review discovery and Journal task renderers match the daily feature. PlanView combines their behavior.

Preserved mobile behavior: phone-specific selectors; existing three-column/two-row actions; four TimeTrace tabs; phone calendar initially collapsed, desktop always expanded; full-width phone calendar with week-number + seven day columns; visualViewport height/offset listeners; scrollable quicknote body/textarea and sticky footer; listener cleanup. No new mobile visual redesign was made.

Preserved daily behavior: canonical dated Journal `## 今日任务`; empty new-task date defaults today; future ensure; UUID-preserving source moves; Journal index; task-only meaningful=false; Recent/Random/PastToday exclusion; Quick Journal and New Diary reuse; shared checkbox writes.

`06-日常任务.md` is referenced only by the explicitly invoked migration module and legacy constant. Creation uses `ensureCanonicalDailyJournal`; no startup, fallback or normal indexing recreates the central source.

## Automated checks

`mobileDailyIntegration.test.ts` adds four cross-module runtime tests with an in-memory Vault and Obsidian DOM adapter:

1. Actual PlanWorkspaceRenderer + Mini Calendar: phone collapse/expand with task-only marker exclusion; narrative addition enables marker; desktop remains expanded.
2. Actual month renderer + EmbeddedTaskIndex: future task-only Journal shows `☐ 1`, no Journal row; completion removes the incomplete cue.
3. Actual QuickJournalModal + QuickJournalService: keyboard viewport resize during save reuses the task-only Journal and preserves its UUID; close removes listeners.
4. Actual WorkbenchShell navigation + Dashboard today callback: six existing actions retained; today's Journal daily reaches execution, future daily does not.

Combined suite: 1274 passed, 0 failed/skipped. Independent build and diff whitespace check passed. Existing mobile layout/compatibility, plan UI, date move, meaningful discovery, Quick Journal reuse and central-source retirement tests remain included. DOM/viewport adapters are automated evidence, not an iPhone hardware pass.

## Backup, deployment and privacy

Verified backup: `/Users/cenyuhing/Developer-Recovery/20260922-121505-mobile-daily-integration`.

The complete previously deployed plugin directory was copied and hashes verified before deployment. Only main.js, styles.css and manifest.json were deployed. data.json was not overwritten.

```text
main.js       e5b836c2f7755fb5d5310337a680494d583d0778a6eb8c944af8e9fe67352d4a
styles.css    bc3283923ba9b709bdcfc860cb6334d14032429734c214adf80e8f58e2639e55
manifest.json 312132b9b2fe1d9acbeca38d36b9bae92f48cc4bab66b2c377cdd99eea82b3e5
```

Privacy rule: no tool scanned, read, hashed or summarized existing private Markdown bodies. Direct body reads are limited to the two Journals verified absent before this smoke and then created with `MXINT-20260922` test content. Existing private Markdown is not edited. Normal plugin UI behavior runs inside Obsidian; private UI contents are not exported into smoke output.

## Mac smoke

Real Obsidian loaded manifest version `0.4.0-dev.5`, mobile-capable. Verified desktop home, six actions, TimeTrace sidebar, permanently expanded desktop Mini Calendar, and desktop Quick Journal without phone viewport overrides. UI daily creation with empty date wrote today's Journal; future task wrote the future Journal; homepage checkbox wrote the real temporary source, and All Tasks restored unchecked state. Future calendar count is `☐ 1`, with no diary row or mini-calendar marker. Quick Journal reused today's task-only file. The legacy central file remained absent.

Temporary dates: 2026-09-22 and 2026-09-25, both verified absent before creation. Raw private content was not used as a fixture.

## iPhone acceptance and completion

The user confirmed the iPhone actually loaded `0.4.0-dev.5` and passed all four layout/keyboard groups: existing 3×2 actions, four TimeTrace tabs, default-collapsed/full-width calendar with week-number + seven days and no right blank strip, and Quick Journal footer visibility/long-text scrolling with the iOS keyboard open. The user separately confirmed phone daily creation with empty date, checkbox completion/uncompletion, and the future task-only calendar count with no Journal marker. These are user-performed real iPhone checks, distinct from the automated DOM adapter tests.

Both owned temporary Journals were cleaned. The user explicitly confirmed all content in today's temporary Journal was test content before its removal. No existing private note was read by tools, edited or removed. No test data remains in the two owned paths; the retired central file stays absent.

Final `npm run check`: 1274 passed, 0 failed/skipped; build and `git diff --check` passed. The integration validation commit uses `merge: integrate mobile compatibility and journal daily tasks`. Exact final commit/push identifiers are recorded in the backup publication record and final response. No baseline merge or additional feature work is included.

Settings before deployment SHA-256: `ecc3471bb9371dc3f8ef9bf04886c697114f7e1b7d941f09d39355482aadcfd0`.
Settings after Mac smoke SHA-256: `b043b16cb4b50d36a4b22ce568a67e2eeba2c387aa18356ced2cf0f3e762c486`.
Only changed top-level key: `lastSeenVersion`, `0.4.0-dev.1` → `0.4.0-dev.5`. This expected runtime change is retained.
