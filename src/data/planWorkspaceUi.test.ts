import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync(new URL('../views/PlanView.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/workbench/WorkbenchShell.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const journalSummary = readFileSync(new URL('../components/journal/JournalTaskSummary.ts', import.meta.url), 'utf8');
const journalLivePreview = readFileSync(new URL('../components/journal/JournalTitleLivePreview.ts', import.meta.url), 'utf8');
const journalTaskLivePreview = readFileSync(new URL('../components/journal/JournalTaskLivePreview.ts', import.meta.url), 'utf8');
const journalTaskRenderer = readFileSync(new URL('../components/journal/JournalTaskRenderer.ts', import.meta.url), 'utf8');
const embeddedTaskCheckbox = readFileSync(new URL('../components/tasks/EmbeddedTaskCheckbox.ts', import.meta.url), 'utf8');
const embeddedTaskModal = readFileSync(new URL('../views/EmbeddedTaskModal.ts', import.meta.url), 'utf8');
const embeddedTasks = readFileSync(new URL('./embeddedTasks.ts', import.meta.url), 'utf8');

test('global navigation names time trace directly after home', () => assert.match(shell, /label: '首页'[\s\S]*label: '时迹'[\s\S]*label: '进程'/));
test('plan has a dedicated top-level view', () => assert.match(view, /PLAN_VIEW = 'xove-dashboard-custom-plan-workspace'/));
test('plan top-level view reuses WorkbenchShell with active plan state', () => assert.match(view, /new WorkbenchShell\([\s\S]*'plan'\)/));
test('plan view is registered by the plugin', () => assert.match(main, /registerView\(PLAN_VIEW/));
test('global plan navigation opens the dedicated view', () => assert.match(main, /action === 'plan'[\s\S]*openPlanWorkspace/));
test('plan board reuses original ProjectBoard primitives', () => { for (const cls of ['po-container', 'po-sidebar', 'po-kanban', 'po-kanban__col', 'po-kanban__card']) assert.ok(view.includes(cls)); });
test('plan calendar reuses original calendar primitives', () => { for (const cls of ['po-cal__bar', 'po-cal__days', 'po-cal__week', 'po-cal__det']) assert.ok(view.includes(cls)); });
test('plan workspace never creates plan markdown', () => { assert.equal(view.includes('ensurePlan'), false); assert.equal(view.includes('.vault.create('), false); });
test('calendar checkboxes write through the shared Embedded Task checkbox', () => {
	assert.match(view, /renderEmbeddedTaskCheckbox\(row, task, this\.plugin\.embeddedTasks\)/);
	assert.match(embeddedTaskCheckbox, /store\.complete\(task, check\.checked\)/);
});
test('month calendar cells render only journals and never task chips or task overflow', () => {
	const month = view.match(/private renderCalendarMonth[\s\S]*?(?=\n\tprivate renderCalendarWeek)/)?.[0] ?? '';
	assert.ok(month);
	assert.match(month, /renderCalendarJournal\(body, journal, 'month'\)/);
	assert.doesNotMatch(month, /tasksOnDate|renderCalendarChip|mx-calendar-task|po-cal__day-more|text: `\+\$\{hidden\}`/);
	assert.equal(month.includes('TASK_DISPLAY_LABELS['), false);
});
test('week calendar keeps journals, every task chip and existing markers', () => {
	const week = view.match(/private renderCalendarWeek[\s\S]*?(?=\n\tprivate renderDayDetail)/)?.[0] ?? '';
	assert.ok(week);
	assert.match(week, /tasksOnDate\(this\.plugin\.embeddedTasks\.all\(\), key\)/);
	assert.match(week, /if \(journal\) this\.renderCalendarJournal\(col, journal\);[\s\S]*for \(const task of tasks\) this\.renderCalendarChip\(col, task\)/);
	assert.match(view, /taskDisplayMarker\(task\.sourceType\)/);
	assert.match(view, /mx-calendar-task-text/);
});
test('selected day detail groups only populated learning creation and daily sections', () => {
	assert.match(view, /const groups = groupEmbeddedForDisplay\(tasks\)/);
	assert.match(view, /if \(!groups\[category\]\.length\) continue/);
	assert.match(view, /mx-day-task-section__title/);
});
test('calendar dates come only from Embedded Tasks, never process start or due dates', () => { assert.equal(view.includes('process.startDate'), false); assert.equal(view.includes('process.dueDate'), false); assert.match(view, /tasksOnDate\(this\.plugin\.embeddedTasks\.all\(\)/); });
test('selected year month and all three modes are one shared view state', () => { for (const key of ['selectedYear', 'selectedMonth', 'mode', "'review'"]) assert.ok(view.includes(key)); });
test('plan view does not reference data json', () => assert.equal(view.includes('data.json'), false));
test('month selector remains three columns at every viewport width', () => {
	const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
	assert.match(css, /\.mx-plan-months\s*\{[^}]*repeat\(3,/); assert.equal(css.includes('.mx-plan-months { grid-template-columns: repeat(6'), false); assert.match(css, /@container \(max-width: 1100px\)[\s\S]*\.mx-plan-container/);
});
test('week board has no redundant section heading or quarter caption', () => { assert.equal(view.includes('本月周计划'), false); assert.equal(view.includes('当前选择 · Q'), false); });
test('sidebar keeps time trace workspace name while right-side views use local titles', () => {
	assert.match(view, /mx-time-trace-title', text: '时迹'/);
	assert.match(view, /private renderBoard[\s\S]*mx-plan-title', text: '计划表'/);
	assert.match(view, /private async renderCalendar[\s\S]*mx-plan-title', text: '日历'/);
	assert.match(view, /private renderReview[\s\S]*mx-plan-title', text: '日记回顾'/);
});
test('month journals use an adaptive multiline cell while quick-note fallback stays compact', () => {
	const month = view.match(/private renderCalendarMonth[\s\S]*?(?=\n\tprivate renderCalendarWeek)/)?.[0] ?? '';
	assert.match(month, /mx-plan-calendar-day-body/);
	assert.match(view, /mode === 'month' && journal\.titleSource !== 'quick-note'[^\n]*fitMonthJournalTitle/);
	assert.match(view, /Math\.floor\(row\.clientHeight \/ lineHeight\)/);
	const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
	assert.match(css, /\.mx-plan-calendar-day-body\s*\{[^}]*display:\s*flex;[^}]*flex:\s*1;[^}]*min-height:\s*0/);
	assert.match(css, /\.mx-plan-calendar-day-body \.mx-calendar-journal-row\.is-month\s*\{[^}]*flex:\s*1;[^}]*height:\s*auto;[^}]*white-space:\s*normal;[^}]*-webkit-line-clamp:\s*var\(--mx-calendar-journal-lines, 99\)/);
	assert.match(css, /\.mx-plan-calendar-day-body \.mx-calendar-journal-row\.is-month\.is-quick-note\s*\{[^}]*white-space:\s*nowrap/);
});
test('month journal layout cannot grow the original calendar row height', () => {
	const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
	assert.match(css, /\.mx-plan-calendar-days\s*\{[^}]*grid-auto-rows:\s*minmax\(72px, 1fr\)/);
	assert.doesNotMatch(css, /\.mx-plan-calendar-day-body[^}]*min-height:\s*[1-9]\d*px/);
});
test('calendar task markers use one neutral class and no category color classes', () => {
	assert.match(view, /mx-calendar-task-marker/);
	assert.doesNotMatch(view, /mx-plan-task-\$\{taskCalendarCategory/);
	const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
	assert.match(css, /\.mx-calendar-task-marker\s*\{[^}]*background:\s*var\(--ad-s2\)/);
	for (const category of ['learning', 'creation', 'daily']) assert.equal(css.includes(`.mx-plan-task-${category}`), false);
});
test('selected day keeps task groups first and journal as a separate trailing record section', () => {
	const detail = view.match(/private renderDayDetail[\s\S]*?(?=\n\tprivate renderCalendarJournal)/)?.[0] ?? '';
	assert.match(detail, /if \(tasks\.length\)[\s\S]*groupEmbeddedForDisplay[\s\S]*if \(journal\) this\.renderJournalDetail/);
	assert.equal(detail.includes("TASK_DISPLAY_LABELS['journal']"), false);
	assert.match(detail, /!tasks\.length && !journal/);
});
test('selected day creates left task and right journal panes only when their content exists', () => {
	const detail = view.match(/private renderDayDetail[\s\S]*?(?=\n\tprivate renderCalendarJournal)/)?.[0] ?? '';
	assert.match(detail, /mx-day-detail-layout\$\{tasks\.length && journal \? ' is-split' : ''\}/);
	assert.match(detail, /if \(tasks\.length\)[\s\S]*mx-day-detail-task-pane[\s\S]*if \(journal\)[\s\S]*mx-day-detail-journal-pane/);
	assert.equal(detail.includes("text: '暂无日记'"), false);
	assert.equal(detail.includes("text: '暂无任务'"), false);
});
test('day detail uses a responsive two-fifths three-fifths split without fixed heights', () => {
	const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
	assert.match(css, /\.mx-day-detail-layout\.is-split\s*\{[^}]*minmax\(0, 2fr\) minmax\(0, 3fr\)/);
	assert.match(css, /@container \(max-width: 720px\)[\s\S]*\.mx-day-detail-layout\.is-split\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
	assert.match(css, /\.mx-day-detail-layout\s*\{[^}]*align-items:\s*start/);
	assert.doesNotMatch(css, /\.mx-day-detail-layout[^}]*height:/);
});
test('journal detail opens its exact source file without a scroll hack', () => {
	assert.match(view, /getAbstractFileByPath\(journal\.path\)/);
	assert.match(view, /mx-day-journal-open', text: '打开日记 →'/);
	assert.equal(view.includes('scrollIntoView'), false);
});
test('selected day changes refresh only the mounted plan content', () => {
	assert.match(view, /private setSelection[\s\S]*?void this\.renderPlanContent\(\);\n\t}/);
	assert.doesNotMatch(view, /private setSelection[\s\S]*?void this\.mountView\(\);\n\t}/);
});
test('calendar navigation keeps the WorkbenchShell mounted', () => {
	const contentRender = view.match(/private async renderPlanContent\(\)[\s\S]*?\n\t}\n\n\tprivate renderSidebar/)?.[0] ?? '';
	assert.ok(contentRender);
	assert.equal(contentRender.includes('new WorkbenchShell'), false);
	assert.equal(contentRender.includes('contentEl'), false);
	assert.equal(contentRender.includes('renderLifeCompass'), false);
});
test('plan view mode switches patch content instead of rebuilding the shell', () => {
	assert.match(view, /this\.mode = mode; void this\.renderPlanContent\(\)/);
	assert.match(view, /this\.calendarMode = mode; void this\.renderPlanContent\(\)/);
});
test('calendar task refresh subscription does not rebuild the outer view', () => {
	assert.match(view, /embeddedTasks\.subscribe\(\(\) => \{ if \(this\.mode === 'calendar'\) void this\.renderPlanContent\(\); \}\)/);
	assert.equal(view.includes("embeddedTasks.subscribe(() => { if (this.mode === 'calendar') void this.mountView()"), false);
});
test('time trace sidebar has three equal view rows, no explanatory labels and a lightweight today action', () => {
	assert.match(view, /\[\['board', '计划表'\], \['calendar', '日历'\], \['review', '日记回顾'\]\]/);
	assert.match(view, /po-sidebar__item\$\{this\.mode === mode \? ' is-active' : ''\}/);
	assert.match(view, /po-sidebar__item mx-time-trace-today', text: '今天'/);
	for (const old of ["text: '视图'", "text: '时间'", "text: '当前计划'"]) assert.equal(view.includes(old), false);
});
test('plan sidebar dots are restrained and month controls keep author primitives', () => {
	const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
	assert.match(css, /\.mx-plan-month-dot\s*\{[^}]*width:\s*3px;[^}]*box-shadow:\s*none/);
	assert.match(view, /cls: `po-chip\$\{month === this\.selectedMonth \? ' is-active' : ''\}`/);
	assert.match(view, /cls: 'po-cal__btn'/);
});
test('journal review is a safe local content render with the shared year and month controls still mounted', () => {
	assert.match(view, /else this\.renderReview\(main\)/);
	assert.match(view, /private renderReview[\s\S]*text: '日记回顾'[\s\S]*text: '暂无回顾内容'/);
	assert.equal(view.includes('最近日记'), false); assert.equal(view.includes('过去的今天'), false);
});
test('today uses local calendar values and preserves the active view mode', () => {
	assert.match(view, /const now = localPlanSelection\(\)/);
	assert.match(view, /setSelection\(now\.year, now\.month, new Date\(\)\.getDate\(\)\)/);
	assert.doesNotMatch(view, /selectCurrent[\s\S]*this\.mode\s*=/);
});
test('time trace rename leaves technical PlanView and identifiers intact', () => {
	assert.ok(view.includes('class PlanView'));
	assert.ok(view.includes("PLAN_VIEW = 'xove-dashboard-custom-plan-workspace'"));
	assert.ok(main.includes('registerView(PLAN_VIEW'));
});
test('journal task summary is a Reading View post processor anchored only at 今日任务', () => {
	assert.match(main, /registerMarkdownPostProcessor/);
	assert.match(journalSummary, /title === '今日任务'/);
	assert.match(journalSummary, /ctx\.addChild\(new JournalTaskSummary/);
});
test('journal task summary reuses EmbeddedTaskStore writes and never writes journal Markdown', () => {
	assert.match(journalSummary, /renderJournalTaskSummary\(this\.containerEl, this\.app, this\.store, this\.path\)/);
	assert.match(journalSummary, /store\.subscribe/);
	assert.match(journalTaskRenderer, /renderEmbeddedTaskCheckbox\(row, task, store\)/);
	assert.match(embeddedTaskCheckbox, /store\.complete\(task, check\.checked\)/);
	assert.equal(journalTaskRenderer.includes('vault.process'), false);
	assert.equal(journalTaskRenderer.includes('vault.modify'), false);
	assert.equal(journalTaskRenderer.includes('今日任务\n- [ ]'), false);
});
test('journal task summary renders real unchecked and checked Embedded Task controls', () => {
	assert.match(journalTaskRenderer, /renderEmbeddedTaskCheckbox\(row, task, store\)/);
	assert.match(embeddedTaskCheckbox, /createEl\('input',[\s\S]*type: 'checkbox'/);
	assert.match(embeddedTaskCheckbox, /check\.checked = task\.completed/);
	assert.match(embeddedTaskCheckbox, /store\.complete\(task, check\.checked\)/);
});
test('journal task summary keeps per-category progress, hides empty groups and maps projects to creation', () => {
	assert.match(journalTaskRenderer, /if \(!categoryTasks\.length\) continue/);
	assert.match(journalTaskRenderer, /categoryTasks\.filter\(task => task\.completed\)\.length} \/ \$\{categoryTasks\.length}/);
	assert.match(journalTaskRenderer, /journalTasks\(tasks, path\)/);
});
test('all task detail headings share the centralized short user labels', () => {
	for (const [key, label] of [['learning', '学习'], ['creation', '创作'], ['daily', '日常']]) assert.match(embeddedTasks, new RegExp(`${key}: '${label}'`));
	for (const legacy of ['学习任务', '创作任务', '日常任务']) assert.doesNotMatch(journalTaskRenderer, new RegExp(`text: '${legacy}'`));
	assert.match(view, /text: TASK_DISPLAY_LABELS\[category\]/);
});
test('journal Live Preview uses one block CM6 widget backed by the real EmbeddedTaskStore', () => {
	assert.match(main, /registerEditorExtension\(journalTaskLivePreviewExtension\(this\.app, this\.embeddedTasks\)\)/);
	assert.match(journalTaskLivePreview, /StateField\.define<JournalTaskEditorState>/);
	assert.match(journalTaskLivePreview, /Decoration\.widget\(\{ widget: new JournalTaskWidget\(app, store, context\.path\), side: 1, block: true \}\)/);
	assert.match(journalTaskLivePreview, /journalTaskWidgetOffset\(state\.doc\.toString\(\)\)/);
	assert.match(journalTaskLivePreview, /renderJournalTaskSummary\(this\.host, this\.app, this\.store, this\.path\)/);
});
test('journal Live Preview task widget is canonical-file and Live-Preview scoped without fragile DOM injection', () => {
	assert.match(journalTaskLivePreview, /editorLivePreviewField/);
	assert.match(journalTaskLivePreview, /isCanonicalDailyJournalPath\(file\.path\)/);
	assert.match(journalTaskLivePreview, /value\.decorations\.map\(transaction\.changes\)/);
	assert.doesNotMatch(journalTaskLivePreview, /MutationObserver|setInterval|querySelector|scrollIntoView/);
});
test('journal Reading and Live Preview share grouping, progress, empty state and checkbox behavior', () => {
	assert.match(journalSummary, /renderJournalTaskSummary/);
	assert.match(journalTaskLivePreview, /renderJournalTaskSummary/);
	assert.match(journalTaskRenderer, /text: '今日暂无任务'/);
	assert.match(journalTaskRenderer, /TASK_DISPLAY_CATEGORIES/);
	assert.match(journalTaskRenderer, /TASK_DISPLAY_LABELS\[category\]/);
});
test('task refresh rerenders only the stable Live Preview widget and releases its listener on destroy', () => {
	assert.match(journalTaskLivePreview, /this\.store\.subscribe\(render\)/);
	assert.match(journalTaskLivePreview, /this\.unsubscribe\?\.\(\)/);
	assert.match(journalTaskLivePreview, /ignoreEvent\(\): boolean \{ return true; \}/);
	assert.doesNotMatch(journalTaskLivePreview, /mountView|renderPlanContent|WorkbenchShell/);
});
test('daily subtitles are absent in journal Reading, journal Live Preview and shared month/week day detail', () => {
	assert.match(journalTaskRenderer, /taskSourceSubtitle\(task,/);
	assert.match(journalTaskRenderer, /if \(subtitle\) body\.createSpan/);
	assert.match(journalSummary, /renderJournalTaskSummary/);
	assert.match(journalTaskLivePreview, /renderJournalTaskSummary/);
	assert.match(view, /private renderTaskRow[\s\S]*taskSourceSubtitle\(task,[\s\S]*if \(subtitle\) body\.createSpan/);
	assert.match(view, /if \(this\.calendarMode === 'month'\) this\.renderCalendarMonth\(root, journals\); else this\.renderCalendarWeek\(root, journals\);[\s\S]*this\.renderDayDetail\(root,/);
});
test('home and all-task lists share the same daily-no-subtitle helper without hiding useful sources', () => {
	assert.match(embeddedTaskModal, /taskSourceSubtitle\(task, detail\)/);
	assert.match(embeddedTaskModal, /if \(subtitle\) meta\.createEl/);
	assert.match(embeddedTaskModal, /renderEmbeddedTaskCheckbox\(row, task, store\)/);
	assert.match(embeddedTasks, /if \(task\.sourceType === 'daily'\) return null/);
	assert.match(embeddedTasks, /return `\$\{task\.sourceDisplayName\}\$\{detail \? ` · \$\{detail\}` : ''\}`/);
});
test('native Embedded Task checkbox reuses po-check visuals with explicit checked and unchecked states', () => {
	assert.match(embeddedTaskCheckbox, /cls: 'mx-embedded-task-checkbox'/);
	assert.match(embeddedTaskCheckbox, /cls: 'po-check mx-embedded-task-check-visual'/);
	const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
	assert.match(css, /input\.mx-embedded-task-check\s*\{[^}]*appearance:\s*none;[^}]*opacity:\s*0/);
	assert.match(css, /\.mx-embedded-task-check-visual\s*\{[^}]*flex:\s*0 0 16px;[^}]*border-radius:\s*var\(--checkbox-radius, 3px\)/);
	assert.match(css, /input\.mx-embedded-task-check:checked \+ \.mx-embedded-task-check-visual\s*\{[^}]*border-color:\s*var\(--interactive-accent\);[^}]*background:\s*var\(--background-primary\)/);
	assert.match(css, /input\.mx-embedded-task-check:checked \+ \.mx-embedded-task-check-visual::after\s*\{[^}]*opacity:\s*1/);
	assert.doesNotMatch(css, /mx-embedded-task-check[^}]*(?:#000|black)/i);
});
test('every Embedded Task summary surface reaches the one shared checkbox renderer', () => {
	const dashboard = readFileSync(new URL('../views/DashboardView.ts', import.meta.url), 'utf8');
	const quick = readFileSync(new URL('../views/ProcessTasksModal.ts', import.meta.url), 'utf8');
	assert.match(journalTaskRenderer, /renderEmbeddedTaskCheckbox\(row, task, store\)/);
	assert.match(view, /renderEmbeddedTaskCheckbox\(row, task, this\.plugin\.embeddedTasks\)/);
	assert.match(embeddedTaskModal, /renderEmbeddedTaskCheckbox\(row, task, store\)/);
	assert.match(dashboard, /renderEmbeddedRows\(parent, group, this\.app, this\.plugin\.embeddedTasks/);
	assert.match(quick, /renderEmbeddedRows\(pending,[\s\S]*renderEmbeddedRows\(completed,/);
	assert.doesNotMatch(quick, /querySelectorAll\('input'\).*addClass\('po-check'\)/);
});
test('optional journal title input is anchored inside 今日日记 and reuses the existing input language', () => {
	assert.match(journalSummary, /title === '今日日记'[\s\S]*mx-journal-title-editor[\s\S]*new JournalTitleEditor/);
	assert.match(journalSummary, /cls: 'ad-modal-input'[\s\S]*placeholder: '输入今天这篇日记的标题'/);
	assert.match(journalSummary, /cls: 'ad-modal-label', text: '标题'/);
});
test('journal title editor persists one frontmatter field without creating an H1 or renaming files', () => {
	assert.match(journalSummary, /writeJournalTitle\(this\.app, file, title\)/);
	assert.equal(journalSummary.includes("createEl('h1'"), false);
	assert.equal(journalSummary.includes('vault.rename'), false);
});
test('live preview journal title uses a block-capable CodeMirror state extension and shared title helpers', () => {
	assert.match(main, /registerEditorExtension\(journalTitleLivePreviewExtension\(this\.app\)\)/);
	assert.match(journalLivePreview, /StateField\.define<JournalTitleEditorState>/);
	assert.match(journalLivePreview, /EditorView\.decorations\.from\(field, value => value\.decorations\)/);
	assert.match(journalLivePreview, /Decoration\.widget\(\{ widget, side: 1, block: true \}\)/);
	assert.match(journalLivePreview, /readJournalTitle\(app, file\)/);
	assert.match(journalLivePreview, /writeJournalTitle\(this\.app, file, title\)/);
	assert.match(journalSummary, /readJournalTitle\(this\.app, file\)/);
});
test('live preview title is mode and file scoped with one mapped widget', () => {
	assert.match(journalLivePreview, /editorLivePreviewField/);
	assert.match(journalLivePreview, /isCanonicalDailyJournalPath\(file\.path\)/);
	assert.match(journalLivePreview, /journalTitleWidgetOffset\(state\.doc\.toString\(\)\)/);
	assert.match(journalLivePreview, /value\.decorations\.map\(transaction\.changes\)/);
	assert.doesNotMatch(journalLivePreview, /MutationObserver|setInterval|querySelector/);
});
test('live preview title debounce and composition guards protect Chinese input', () => {
	assert.match(journalLivePreview, /SAVE_DELAY_MS = 400/);
	assert.match(journalLivePreview, /compositionstart/);
	assert.match(journalLivePreview, /compositionend/);
	assert.match(journalLivePreview, /if \(!this\.composing\) this\.scheduleSave\(\)/);
	assert.match(journalLivePreview, /ignoreEvent\(\): boolean \{ return true; \}/);
});
test('journal metadata changes refresh the mounted calendar without rebuilding the shell', () => {
	const onOpen = view.match(/async onOpen\(\): Promise<void> \{[\s\S]*?\n\t\}/)?.[0] ?? '';
	assert.match(onOpen, /metadataCache\.on\('changed', file => \{ if \(this\.mode === 'calendar' && !!journalDateFromPath\(file\.path\)\) void this\.renderPlanContent\(\); \}\)/);
});
test('quick-note fallback is not duplicated in day detail metadata', () => {
	assert.match(view, /journal\.quickNoteCount && journal\.titleSource !== 'quick-note'/);
});
