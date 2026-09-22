# Daily Tasks in Journal v1 — 2026-09-22 acceptance record

## Scope and accepted state

New daily tasks without a date default to today. Legacy undated tasks remain unresolved and are never silently assigned a date. The user authorized real backup, retirement of the empty legacy file, deployment, GUI smoke, and then commit/push on this feature branch.

- Branch: `feature/daily-tasks-in-journal-v1`.
- Starting baseline: `7cc4a7aca878b108dc222984642bb56131c2763e`.
- Mobile branch remains `29b30f30a15d7c4f72335164d3dd347e0b6c1ded`; no merge or mobile changes.
- Backup, zero-task migration verification, deployment, real Obsidian GUI smoke, cleanup and final check completed.
- Final `npm run check`: 1249 passed, 0 failed/skipped; build/typecheck passed. Code smoke: 107 passed.
- Commit message: `refactor: store daily tasks in journal notes`. Final commit/push identifiers are recorded in the external recovery report after publication.

## Architecture audit and implementation

1. `src/data/embeddedTasks.ts` contains `EmbeddedTaskIndex`, source classification, parser, row mutations and cross-source grouping. `src/data/embeddedTaskVault.ts` is the Obsidian adapter/store.
2. Original canonical daily source was `05-计划/06-日常任务.md`, section `日常待办`; source categories remain learning, creation, project and daily, with project displayed under creation.
3. All original central-file production assumptions were in `embeddedTasks.ts`, `embeddedTaskVault.ts`, and `views/EmbeddedTaskModal.ts`. The old file constant now exists only as `LEGACY_DAILY_TASK_FILE` for explicit migration. Normal indexing and creation no longer use it.
4. Daily tasks now live in `04-日记与复盘/01-日记/YYYY-MM-DD.md`, section `今日任务`. The parser requires exactly one valid hidden ID on a row. Other sections and ordinary ID-less checkboxes are excluded. `📅 YYYY-MM-DD` is retained.
5. New-task modal preserves daily/process assignment. Daily uses `addDaily`, defaults to today's local calendar date, ensures the canonical Journal using the unchanged unified template, and appends a UUID-bearing row. Process date remains optional.
6. Source-aware completion still uses `renderEmbeddedTaskCheckbox` and `store.complete`. Home, All Tasks, Quick Preview, calendar and Journal all retain that shared path. Ordinary Markdown checkboxes remain ordinary Markdown.
7. There was no Embedded Task date-move API previously. `changeDate` now inserts into the target Journal before removing the old row, preserves UUID/text/check state, detects stale source rows, and rolls back the inserted target row if source removal fails. A failed rollback is reported instead of hiding the problem. The existing date label in shared task lists opens a standard date-edit modal.
8. Overdue tasks remain in their original source. Home retains today + overdue incomplete aggregation. Month/week retain `tasksOnDate` and `incompleteTaskCountOnDate`, including learning/creation/daily.
9. Initial index refresh discovers all allowed source files. Vault create/modify/delete/rename then refresh only affected files; folder renames also discover affected descendants. Explicit list refresh remains available. No polling added.
10. Journal originally used a dynamic summary anchored after `今日任务`. That summary now aggregates only learning/creation. Daily Markdown rows are rendered individually through the common checkbox. Reading View maps list-local `data-line` to source rows; Live Preview uses CodeMirror replacement widgets. Editing a daily row reveals its real Markdown. Source Mode gets no widgets. Daily rows are not dynamically aggregated a second time.
11. `hasMeaningfulJournalContent` in `journal.ts` accepts a nonempty authored frontmatter title, or real content in `随时记` / `今日日记` / `今日回看`. It excludes the task section, checkbox rows, empty headings, internal comments and empty template placeholders. A standalone legacy H1 does not qualify by itself; if real journal content exists, its legacy H1 can still be the display title.
12. Calendar entries, Mini Calendar dates, Review discovery, home journal eligibility and the older history modal share that decision. Unchanged journal reads are cached by file identity and mtime/size, so repeated rendering does not reread every journal body.
13. Task-only journals can show `☐ N` but no journal-content marker/row. Recent, random, past-today and day-record search exclude them. Search continues to use title and the three narrative sections, excluding today's task text.
14. Day Focus can target a task-only file and displays “这一天还没有日记内容”. “开始写这天日记” reuses the file and enters the normal record state; “编辑原文” remains the editing route. It does not create another file.
15. QuickJournalService already uses `ensureJournal`; its reuse behavior is retained and tested. Adding a quick note makes the same task container meaningful. New Diary now opens an existing canonical daily Journal before custom creation logic can create a duplicate.
16. If only a legacy same-day filename (`YYYY-MM-DD 日记.md`) exists, canonical task creation/migration reports a conflict rather than creating a second daily container. Legacy file normalization is not performed automatically.

## Migration module and safety

`src/data/dailyTaskMigration.ts` exports a pure dry-run planner and an adapter-based apply function. The application does not auto-run it. The authorized real-Vault run used an adapter with compare-before-delete semantics after a verified full backup.

The planner inventories task rows, checked state, date counts, missing IDs/dates, repeated IDs, existing target IDs and non-task body. An existing same UUID is skipped only if source date/text/check state match and the UUID is in the correct target section. Missing dates/IDs are unresolved. Different same-ID content, duplicates and legacy destination ambiguity are conflicts. Only the known empty legacy template structure is exempt from non-task body checks.

Apply refuses any unresolved/conflicting/body-risk plan, checks the source and destination snapshots, requires compare-and-write semantics from its adapter, preserves each source row, verifies task UUID/date/text/check state, and removes the old source only after successful verification. Failed writes keep the central source; a fresh dry run deduplicates successfully written rows. Real execution backed up under `/Users/cenyuhing/Developer-Recovery/YYYYMMDD-HHMMSS-daily-tasks-to-journal/` as requested.

## Test evidence

New tests in `dailyTasksInJournal.test.ts` cover today/future creation, UUID/date preservation, shared completion, source moves, stale-source rejection, failed-move rollback, CRLF boundaries, overdue behavior, index create/modify/delete/rename and read counts, unchanged learning/creation semantics, month/week counts, list grouping, all meaningful-content branches, Review eligibility/search, QuickJournal reuse, new-Journal reuse and migration safety/integrity/idempotence.

`journalDailyRendering.test.ts` uses actual CodeMirror EditorState/Decoration objects for Live Preview, Source Mode and selection transitions, plus a Reading View DOM double for source-row mapping and shared-checkbox rendering. These are fixture/runtime checks, not a substitute for Obsidian GUI smoke.

Existing tests were updated where their old assumptions explicitly counted empty Journal files as records or addressed the old central source. There are no placeholder tests added to reach a historical count.

## Real backup, migration and deployment

Backup: `/Users/cenyuhing/Developer-Recovery/20260922-114958-daily-tasks-to-journal`.

It includes the original central note, complete original Journal directory, complete deployed plugin directory, separate `data.json`, and `migration-before.json` with task/UUID/date inventory, plugin hashes and all 61 original Markdown hashes. Backup copies were read back and hash-verified. `migration-dry-run.json` and `migration-after.json` record the actual planner/apply verification, including the zero-task case.

- Before: 0 tasks, 0 complete, 0 incomplete. After: 0. Migrated: 0. Conflicts: 0. Unresolved: 0.
- UUID/date/checkbox sets verified equal. The exact allowed empty template was checked immediately before removal.
- `05-计划/06-日常任务.md` is deleted and was never recreated.
- Plan directories 01–05 and 07 remain unchanged; no renumbering.
- New daily source: `04-日记与复盘/01-日记/YYYY-MM-DD.md`, `## 今日任务`.
- Deployed only `main.js`, `styles.css`, `manifest.json`; their hashes match the final repository build.
- Manifest remains baseline `0.4.0-dev.1`, `isDesktopOnly: true`; no version bump. This authorized deployment replaces the previous Mobile dev.4 bundle and does not contain Mobile Layout v1.

## Actual Obsidian smoke

Executed against the real Vault through the enabled local Obsidian CLI, DOM button/input events and normal workspace mode switching. Assertions inspect real rendered UI and actual Journal Markdown. Fixture tests are reported separately.

| Smoke | Result |
|---|---|
| A: new daily with empty date | Defaults to 2026-09-22; real checkbox/text/date/UUID under 今日任务 |
| B: future daily | 2026-09-25 canonical Journal created; task-only day excluded from diary markers |
| C: existing Journal | New daily appended to same file, no same-date duplicate |
| D: checkbox | Home → complete; All Tasks → incomplete; Live Preview and Reading View also write correct source |
| E: move date | UI moves today → future → today, preserving UUID/text/check state and removing old row |
| F: home | Today daily displayed; overdue/learning/creation behavior covered by real automated fixtures |
| G: calendar | Month and Week each show exact future `☐ 1`; future task visible |
| H: Journal | Source holds one real row; Live Preview and Reading each show one daily row; shared checkbox writes back |
| I: meaningful | Task-only excluded; adding a quicknote makes the same day meaningful and adds marker/Recent entry |
| Recent / Random / PastToday | Task-only future excluded from all three |
| J: Quick Journal | Writes 随时记 into existing task-only Journal; no duplicate |
| K: New Diary | Opens existing canonical task-only Journal; no duplicate |

Real learning/creation index was empty; their unchanged aggregation, dynamic Journal rendering and overdue behavior passed fixtures, without modifying user learning/creation sources. Week UI exposes chips/counts without a direct checkbox; optional Week/Quick Preview checkbox clicking was not claimed. Actual checkbox coverage used four other entry points.

All three uniquely marked smoke tasks and one quicknote were removed through normal Vault editing. The two newly created smoke Journals were deleted only after their remaining content matched the empty template; no original Journal was deleted. Original and final embedded-task index counts both equal 0. Final Vault inventory: 61 → 60 Markdown files, only the old central empty file deleted; added 0, changed 0. No unrelated Markdown changed. `gui-smoke.json` records the individual successful assertions; `final-vault-verification.json` records final inventory and hashes.

## SHA-256 and settings

| data.json state | SHA-256 |
|---|---|
| Before smoke | `b24dba3e8a6358177b7ef367019a9c1bfaf6d91ed50b40d002251da2d1027769` |
| After smoke | `ecc3471bb9371dc3f8ef9bf04886c697114f7e1b7d941f09d39355482aadcfd0` |
| Final | `b24dba3e8a6358177b7ef367019a9c1bfaf6d91ed50b40d002251da2d1027769` |

Only `lastSeenVersion` changed from dev.4 to dev.1 when loading the candidate. That runtime field alone was restored to dev.4 through the current plugin settings object. Final byte hash equals the original; no settings were replaced from a historical whole-file copy. A subsequent plugin reload may normally update this runtime field again.

Original deployed bundle (fully retained in backup):

```text
main.js       c66e466f9bd473341e7136fcfc61cd2d34f8969d18b3853de08971af5fd63521
styles.css    bc3283923ba9b709bdcfc860cb6334d14032429734c214adf80e8f58e2639e55
manifest.json 73e07cc500bd090a721978ba871f028bac78fa17eaa5208dd149cdb033571dab
```

Final deployed feature:

```text
main.js       2bcb5b53bcf1e155422baadcd7028311bd28b41b99519cb13b78ff6d6db00247
styles.css    3948068f4715e1928d0b6e07c4b06de93eab06ad4e98443c65108c8f24e974ee
manifest.json 127428e0aa15f6ac9339c1b868745718460cba83ee05f7829a6298f6fe3c202b
```

No new diary/review UI redesign, daily-plan feature, TimeTrace entry restructuring or mobile layout work is included.
