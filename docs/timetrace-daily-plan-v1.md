# TimeTrace Daily Plan v1 — dev.7

## Base and scope

- Branch: `feature/timetrace-daily-plan-v1`.
- Baseline/start: `2f7d21b69e9ad13d1d710f22fb745bc2bb5034e0`.
- Baseline remains unchanged. Feature is not merged.
- No task model, canonical template, inline editor or home visual redesign.

## Source audit before changes

1. Modes were `board`, `longTermPlan`, `calendar`, `review`, in that order: 周期计划、长期计划、综合日历、日记&复盘.
2. `PlanWorkspaceRenderer.renderSidebar` is shared by Desktop navigation and Mobile tabs. CSS changes the same DOM into four columns on phones.
3. `mode` stores active section; its original default was `board`. `activate`/`deactivate` retain state in the same renderer; `getState`/`setState` support restored views. No data.json persistence was added.
4. Shared `TimeTraceState` carries visible month and year/quarter/month/week/day focus. Mini Calendar selection flows through `setTimeState` and the inline-editor flush queue.
5. Marker sources: cycle plan existence, no long-term markers, calendar daily meaningful Journal, review daily meaningful Journal plus week/month/quarter/year Review existence.
6. `renderCalendarMonth` used the mature 42-cell grid. `renderCalendarWeek` used seven task columns and a selected-day detail below.
7. `readCalendarJournals` enumerated Journal files and called `readJournalContent`/`journalCalendarEntry`, resolving title, quick-note count and summaries. `renderCalendarJournal` and `renderJournalDetail` displayed them.
8. Learning/creation/daily rows come from `plugin.embeddedTasks.all()` and `tasksOnDate`; logical dates remain unchanged for overdue tasks.
9. Month/Week both used `renderCalendarIncomplete` → `incompleteTaskCountOnDate`. Completed tasks remain visible but do not contribute to the count.
10. Selected-day checkboxes use `renderEmbeddedTaskCheckbox` → `store.complete` → index refresh/subscription → content rerender. Week chips previously selected the day; now also have the shared checkbox.
11. One shared section header already existed, with no duplicate calendar toolbar.
12. `renderJournalOverview` has its own 42-cell layout and summary priority. Daily Plan reuses its existing calendar primitives; no duplicated calendar renderer was introduced.

## Implementation

- Both navigation surfaces now show 日记&复盘 / 每日计划 / 长期计划 / 周期计划.
- Fresh renderer defaults to `review`; existing session/restored section is retained. Mac's existing restored `board` state was distinguished from a freshly constructed renderer default.
- Legacy `calendar` key remains compatible and documented in workspace/marker types. Production renderer methods use `renderDailyPlan*`; no old Comprehensive renderer remains.
- Daily Plan Month retains today, selected day, task presence and bottom-right `☐ N`, without Journal rows or summaries.
- Week retains all task categories, completed tasks and original logical dates; shared checkboxes support immediate completion refresh.
- Selecting a Month date updates shared day focus and shows a task-only selected-day pane grouped 学习 / 创作 / 日常. It includes the same incomplete counter. Source-file opening remains optional on task rows.
- The shared header offers 新建任务 using `NewEmbeddedTaskModal`; explicit day focus prefills its date, other focuses keep existing defaults.
- No new Markdown type/database/JSON source. Daily tasks still use the dated Journal `## 今日任务`; date movement and index parsing are unchanged.
- Daily Plan performs no Journal body/title/snippet reads. The pre-existing task index still obtains task rows from Markdown; no new diary parser or index model was introduced. `meaningfulJournalDates` now runs only in review mode.
- Mini Calendar Daily Plan day dots mean any task exists, including completed tasks; no week/month/quarter/year dots are inferred for tasks. The same day rule applies in Month and Week views. `☐ N` independently counts incomplete tasks.
- Review markers remain meaningful Journal for day and existing Review for other periods; task-only Journal is excluded. Long-term remains marker-free; cycle markers remain plan existence.
- Journal Overview, inline editing, search eligibility, long-term and cycle templates remain unchanged.
- Phone tabs remain four equal columns; Month remains seven columns/full width. Phone Week uses vertical date cards for readable text and checkbox targets. Desktop Week remains seven columns. Mini Calendar remains collapsed by default on phones.

## Validation and privacy

- `npm run check`: 1347/1347 pass, zero skipped/failed; ten new behavior cases beyond 1337, plus updated obsolete combined-calendar assertions.
- New cases execute production renderer and checkbox handlers against fictional notes: both nav layouts, default/retain, zero daily-render body reads, mixed counts/completed-only dots, week rows, day pane, checkbox write, marker separation, date prefill and overdue logical dates.
- Existing Review/inline/mobile/task/source/cycle/long-term tests pass. Independent build and `git diff --check` pass.
- Mac actual loaded version: 0.4.0-dev.7. GUI smoke passed order, fresh default, retained state, Month/Week/day pane, date preset, three task checkbox types, immediate counts, final-completion dot, overview separation and all four marker modes.
- Runtime smoke temporarily restricted renderer file/metadata enumeration and body reads to a known ownership ledger. Read attempts outside fixtures were rejected. This adapter was removed after smoke.
- A 390px desktop DOM/CSS check passed single-row tabs, full-width Month, collapsed/expanded Mini Calendar and Week without horizontal overflow. This is supplementary, not an iPhone substitute.
- User replied “正常” to the requested dev.7 iPhone checks: four tabs, Review, Month, Week checkbox/readability, Mini Calendar, plan switching and Quick Journal keyboard/footer.
- Twelve new temporary files (two task sources, two future Journals, four Reviews, four cycle plans) were created only after all canonical/legacy candidates were absent. Exact content matched the creation ledger before deletion; all twelve were removed.
- No existing private Markdown body was read by tools, copied into tests/backups or modified. Only fixture contents were inspected. The plugin's ordinary background index continues its normal operation.
- Legacy `05-计划/06-日常任务.md` remains absent, checked by existence only.

## Backup and deployment

`/Users/cenyuhing/Developer-Recovery/20260922-131808-timetrace-daily-plan-v1`

- Backed up current plugin directory and separate data.json, with hashes; no private Markdown.
- Deployed only main.js/styles.css/manifest.json. Plugin id unchanged; `isDesktopOnly: false`.
- data.json was never overwritten. The only changed key is `lastSeenVersion`, dev.6 → dev.7.
- Before: `701ee2e6cf264f71fa784213ea421e161b5b537735df5d988ed0a63e91313ad7`.
- Smoke/final: `ef345c5e72f82636e5469323e8fab1fa07a63e428f3fccfcc980fdb225b6293c`.

## Build SHA-256

- main.js: `0f68aa5c1f8eadb10d59832d6dba8d9fa61f20971e6585b88e12341d164c5ac4`
- styles.css: `191a9b4581ee174c33a398e1b9046de27292103b88b30fccfdc50f05762be905`
- manifest.json: `3e0e016933e85db0b49658bea630d49e8f5abe187c53c7c9e079a1eee49c0eb5`
