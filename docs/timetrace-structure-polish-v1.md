# TimeTrace planning and review — dev.8 final handoff

## Release state

- Branch: `feature/timetrace-structure-polish-v1`.
- Unchanged baseline: `887f72f4ed78b7c2c0af3ce1266a567bbacbf3f3` (`custom/baseline`). No baseline merge or feature deletion.
- Manifest: `0.4.0-dev.8`, `isDesktopOnly: false`; plugin id unchanged.
- User confirmed final iPhone acceptance: TimeTrace / Journal Overview scrolls up and down normally, the mobile main scroll is restored, and the blocker is resolved. Do not infer separate hardware results for every keyboard/navigation combination from this confirmation.

## Final behavior

- Three top-level sections: 日记·计划·复盘 / 每日执行 / 长期计划. Workbench 时迹 explicitly opens 日记一览 after successful editor flush.
- Secondary tools: 日记一览 / 计划一览 / 最近记录 / 搜索 / 随机回顾 / 过去的今天.
- Time appears in the shared Header; duplicate record headings and empty title wrappers are removed.
- Week/month/quarter/year use editable Plan and Review panes, side by side on desktop and stacked on phones. Existing canonical templates, atomic saves, conflict handling and unrelated sections are preserved. Annual legacy heading is a read fallback, renamed in place only when edited.
- Day title has a lightweight label. Textareas grow naturally without internal scrolling or resize handles. Width/viewport changes trigger remeasurement. Source opening remains available through context menus.
- Year/month labels open records; their chevrons open pickers. Q/week/day open corresponding records. Explicit picker navigation moves the Overview window; natural scrolling only synchronizes its visible month and Mini Calendar.
- Journal Overview uses unique, consecutive Monday-first week rows covering target month minus two through plus three, rounded to complete weeks. Example September 2026: June 29, 2026 through January 3, 2027. No edge append/prepend or automatic window rebuild.
- Chevron beside Header month collapses weekday/grid. Header/tools remain; expanding restores position. Collapsed navigation updates month and positions the rebuilt window on expansion. State is session memory only.
- Daily Execution retains Month/Week/selected-day behavior and task semantics; it shares date-cell rendering without adopting the Overview window or collapse behavior. Long-term data and Journal/task schemas remain unchanged.

## Mobile scroll audit and final structure

- Process and TimeTrace mount beneath the same `.dashboard-plugin` Workbench page. Its base `height:100%` / `overflow-y:auto` supplies the native outer scrollport within Obsidian's clipped leaf.
- Process content uses an auto-height `.po-container`. Previous Overview overrides instead hid outer overflow and constrained flex children, assigning scrolling to the calendar body.
- Removed the conflicting phone Overview pane rules. TimeTrace workspace/root/main/body, Plan/Review panes and continuous weeks now grow naturally with visible overflow; no inner date scrollport remains.
- Phone Header and weekday strip use ordinary document flow. Safe area uses outer bottom padding only. Calendar collapse changes content height, not scroll ownership.
- Desktop retains the finite calendar body scrollport with Header/weekday outside it; desktop narrow windows do not activate phone overrides.
- Isolated computed-style/bounding-rect checks found no viewport-sized touch interception overlay. Programmatic geometry checks do not substitute for hardware touch testing.

## Validation

- Final `npm run check`: 1461/1461 passed, zero failed/skipped.
- Independent `npm run build` and `git diff --check`: passed.
- Obsidian isolated-renderer smoke: desktop fixed Header/weekday, real finite endpoints, collapse/restore, collapsed month navigation, Plan/Review and Mini Calendar passed.
- Real ProjectBoard code with synthetic content and isolated TimeTrace renderer use the same phone `.dashboard-plugin` owner. Overview and Day/Week/Month/Quarter/Year reach their final content; collapse, viewport resize and no horizontal overflow checks passed at phone dimensions.
- Navigation, shared calendar cells/today treatment, section saves, lazy creation, conflict cases, fixture reader isolation and teardown are covered by the test suite.

## Privacy and cleanup

- Automation did not read or modify existing private Markdown bodies. Only explicitly owned test notes were read for verification and removed. Normal plugin indexing is unchanged.
- Fixture ledger: `/private/tmp/mx-polish-fixtures.json`. Canonical paths and legacy alternatives were recorded absent before creation. Cleanup compared each remaining note against its template, allowing only MXPOL-marked test lines.
- The owned `04-日记与复盘/01-日记/2038-06-18.md` was already absent and was not recreated.
- Removed exactly these eight remaining owned files:
- `05-计划/05-周计划/2038-W24 周计划.md`
- `04-日记与复盘/02-周复盘/2038-W24 周复盘.md`
- `05-计划/04-月计划/2038-06 月计划.md`
- `04-日记与复盘/03-月复盘/2038-06 月复盘.md`
- `05-计划/03-季计划/2038-Q2 季计划.md`
- `04-日记与复盘/04-季复盘/2038-Q2 季复盘.md`
- `05-计划/02-年计划/2038 年计划.md`
- `04-日记与复盘/05-年复盘/2038 年复盘.md`
- No fixture-ledger Journal/Plan/Review paths remain; filename-only candidate inspection found only these eight before cleanup. Existing in-memory task index reports zero MXPOL/owned-source tasks after cleanup.
- `05-计划/06-日常任务.md` is absent.
- Backup remains at `/Users/cenyuhing/Developer-Recovery/20260922-142730-timetrace-structure-polish-v1`; no private Markdown was backed up by this work.
- Prior smoke-reader issue was an external test proxy attached to the live renderer, corrected by plugin reload. Current smoke constructs and destroys a separate renderer; `src/data/testing/fixtureReader.ts` is test-only and absent from the production bundle.

## Settings and artifacts

- data.json was not overwritten/restored. Compared with original dev.7 backup, only `lastSeenVersion` changed from `0.4.0-dev.7` to `0.4.0-dev.8`. Compared with the known deployed dev.8 state, no keys changed.
- Final data.json SHA-256: `9ed3840a7952b9c00290b233256e4d72598e50bccc43934dffe4fa07de267dfe`.
- Rebuilt artifacts match the three deployed Vault files byte for byte:
- main.js: `037ad1f1bd9116e5b8c6e542748e76e3ecb602ab8196662b3098163e279eb317`
- styles.css: `e1021ac68e06e525f9457ef75e7a3959dd8598a5065225964c901e0b5926dda4`
- manifest.json: `3fd5980a2ef82f274d5ce4d27a9aedc8f835ffff975c8aa26ccfc58a37f8320d`
