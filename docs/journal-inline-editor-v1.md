# Journal & Review inline editor v1

Starting branch: feature/journal-review-inline-editor-v1, from custom/baseline 10861a8f0eb4c183ce6ee146c94f3e251c613f34.

## Source audit before implementation

1. PlanWorkspaceRenderer in src/views/PlanView.ts owns Journal Review; legacy PlanView and DashboardView share it.
2. timeState carries visible month and day/week/month/quarter/year focus; setTimeState and timeStateForReviewRecord route selections.
3. dayReviewSections selects 随时记/今日日记/今日回看; markdownReviewSections skips YAML/fences and parses H2 content.
4. Period reviews use the same H2 parser; journalTemplate defines canonical period sections and order.
5. 编辑原文 opens an Obsidian file tab through openSource; it is currently the primary editing path.
6. ensureReviewForFocus delegates to ensureJournal with an explicit logical date; it reuses canonical or legacy existing files.
7. reviewMode controls 复盘 / 计划 ↔ 复盘; plan rendering remains read-only.
8. discoverReviewRecords feeds recent/search/random/pastToday; selecting a record sets the corresponding focus.
9. Shared Mini Calendar and combined calendar route through setTimeState/setDayFocus; mobile collapse belongs to the same renderer.
10. Journal has a title updater but no general byte-preserving section patch with target conflict detection.
11. Review H2 parser is read-only. LongTermNarrative has a purpose-specific patch helper, not a general review writer.
12. Vault create/delete/rename/modify, metadata changed and task subscriptions currently trigger whole-render refresh. This must avoid tearing down active editors.
13. Search has 200ms debounce; QuickJournalService has a save queue. Neither manages an inline editing draft's autosave/conflict lifecycle.
14. A new offset-based section helper is needed to preserve all non-target bytes, including tasks/IDs, unknown sections and frontmatter.
15. frontmatterWriter and updateJournalTitleContent exist; the editor needs a field-scoped snapshot and precise title patch, including safe handling of duplicate/multiline fields.

Quick Journal stores ordered `- HH:mm entry` rows with indented continuations. V1 displays existing entries and appends through the established entry format, rather than flattening/replacing them.

## Privacy and scope

Use only fictional fixtures and newly created smoke Journal/Review files. Never read existing private Markdown bodies for development or verification. No plan, process, direction, learning or inbox editor; no navigation reorder or home mobile redesign. Markdown remains the only persistent content store.

## Implementation and acceptance

- Entry renamed to 日记&复盘 in its original fourth position. Other top-level entries are unchanged.
- Tools: 日记一览 → 最近记录 → 搜索 → 随机回顾 → 过去的今天.
- Day uses transparent auto-growing plain-Markdown textareas for title, 今日日记 and 今日回看. 随时记 displays existing ordered entries and provides an inline append composer. Autosave updates just the current newly appended entry across typing pauses; blur/submit ends that entry. Existing entries are not flattened or rewritten.
- Period review editors derive every section from the unchanged canonical week/month/quarter/year templates. The plan side of 计划 ↔ 复盘 remains read-only.
- Opening an empty date/period does not create a file. First save ensures the explicit focused Journal/Review through the existing canonical/legacy-aware ensure helper. Task-only files are reused.
- `journalInline.ts` locates source byte offsets outside YAML, fences and comments; patches only the target H2 body or frontmatter title. Untouched sections, tasks/UUIDs, attributes and unknown content remain byte-preserved. Duplicate target sections/fields fail closed. Numeric/boolean-looking titles remain YAML strings.
- 500ms debounce; blur, Cmd/Ctrl+Enter, date/mode changes, top-level navigation and destruction flush pending writes. IME composition postpones writes. A per-document queue and atomic Vault.process use current file content.
- Target snapshots detect external edits. Unknown non-target edits are retained. Conflicts visibly pause overwriting, retain the local draft and prevent navigation; explicit 重新加载 loads current source, 保留当前输入 retains the draft. Failed saves can be retried. No body is stored in settings/localStorage/JSON.
- Active editor nodes survive Vault/metadata refreshes; mini-calendar eligibility refreshes separately. Deferred reads cannot overwrite newer local input. Saved status fades; failure/conflict status remains visible.
- Markdown remains raw text, not WYSIWYG. H1/H2 inside a section and unfinished fenced/comment blocks are held locally with a visible error to prevent swallowing neighboring sections; ordinary text, lists, quotes, links, emphasis and closed code blocks are preserved.
- 原文 is retained as a subdued 打开原文 action after flushing; it is not the main editing route.
- 日记一览 is an independent Monday-first, 42-cell month grid. Its summary priority is frontmatter 标题, 随时记 N条, first diary line, first reflection line. It reuses hasMeaningfulJournalContent, excludes task-only records and never renders task counts or task snippets. Date clicks select day focus without creating a file.
- Phone CSS uses body.is-mobile.is-phone, full-width seven-column overview, two-line clamped summaries and naturally scrolling 16px textarea content. Mini Calendar collapse and existing 3×2 home actions remain unchanged.

## Tests and real smoke

Final suite: **1337 passed, 0 failed/skipped**, plus successful independent build and git diff whitespace check. The prior 1274-test suite is retained with obsolete read-only/CTA assertions updated to the new accepted UI contract. 63 additional fictional-fixture tests cover source patching, each period section, title types, lazy creation/reuse, meaningful transitions, autosave/IME/flush/destroy, concurrent edits, failed writes, CRLF quick entries, overview fallbacks, real component events, navigation blocking and mobile CSS.

Actual Mac UI smoke used only newly created 2036-04-18/19/20 Journals and 2036-W16/04/Q2/year Reviews. All candidate canonical/legacy review paths were absent before creation; no corresponding private plan existed. Verified all three day sections/title, autosave and date round-trip, overview title/quicknote/task-only states, same-file task reuse, all four period editors, read-only plan comparison and raw-source escape hatch. Actual target conflict preserved both external source and local draft; navigation stayed blocked until explicit reload. Non-target external edits were preserved.

The user responded “正常” to the requested iPhone dev.6 version, Chinese input/persistence, keyboard visibility, overview width/date click and Mini Calendar checks. This user-performed hardware verification is distinct from automated tests. Subsequent final data-edge hardening changed only title serialization and CRLF/current-entry save handling; Mac also verified the final bundle's numeric title, continuous quick autosave, clear, and cleanup using one additional new 2036-04-21 Journal. Phone presentation sources were unchanged.

All **8** owned temporary Journal/Review files were removed after test ownership/content verification. Only test sources were edited/deleted. No existing private Markdown body was read by tools or modified. No private text was copied into tests or backup artifacts. Integration/baseline branches were not merged or altered.

## Backup, deployment and settings

Backup: `/Users/cenyuhing/Developer-Recovery/20260922-124831-journal-inline-editor-v1`.

Contains the previous complete dev.5 plugin directory, separate data.json, before/deployment hashes and final verification/smoke logs. No private Markdown backup was made.

Only main.js/styles.css/manifest.json deployed. Final manifest: `0.4.0-dev.6`, `isDesktopOnly: false`.

```text
main.js       eac452095ce6101e02fa5fb11c1bbeb67197bb3b6cadf348f083ace6b119591d
styles.css    396c14c0b39029376d1b9130511be58211a4d193a7c432438be1b7b91c07e048
manifest.json 3185308fb50953980865ee00dc3bc6594651b24421f0885fe6fce47381d4639d
```

```text
data.json before deployment:
b043b16cb4b50d36a4b22ce568a67e2eeba2c387aa18356ced2cf0f3e762c486
data.json after smoke / final:
701ee2e6cf264f71fa784213ea421e161b5b537735df5d988ed0a63e91313ad7
```

Only lastSeenVersion changed from 0.4.0-dev.5 to 0.4.0-dev.6. This expected runtime change is retained; settings were not overwritten or restored.

Final commit message: `feat: add inline journal and review editing`. Publication record in the recovery directory and final response record the resulting commit/push status. No next-round feature work is included.
