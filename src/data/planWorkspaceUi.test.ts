import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync(new URL('../views/PlanView.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/workbench/WorkbenchShell.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

test('global navigation inserts plan directly after home', () => assert.match(shell, /label: '首页'[\s\S]*label: '计划'[\s\S]*label: '进程'/));
test('plan has a dedicated top-level view', () => assert.match(view, /PLAN_VIEW = 'xove-dashboard-custom-plan-workspace'/));
test('plan top-level view reuses WorkbenchShell with active plan state', () => assert.match(view, /new WorkbenchShell\([\s\S]*'plan'\)/));
test('plan view is registered by the plugin', () => assert.match(main, /registerView\(PLAN_VIEW/));
test('global plan navigation opens the dedicated view', () => assert.match(main, /action === 'plan'[\s\S]*openPlanWorkspace/));
test('plan board reuses original ProjectBoard primitives', () => { for (const cls of ['po-container', 'po-sidebar', 'po-kanban', 'po-kanban__col', 'po-kanban__card']) assert.ok(view.includes(cls)); });
test('plan calendar reuses original calendar primitives', () => { for (const cls of ['po-cal__bar', 'po-cal__days', 'po-cal__week', 'po-cal__det']) assert.ok(view.includes(cls)); });
test('plan workspace never creates plan markdown', () => { assert.equal(view.includes('ensurePlan'), false); assert.equal(view.includes('.vault.create('), false); });
test('calendar checkboxes write through EmbeddedTaskStore complete', () => assert.match(view, /embeddedTasks\.complete\(task/));
test('calendar dates come only from Embedded Tasks, never process start or due dates', () => { assert.equal(view.includes('process.startDate'), false); assert.equal(view.includes('process.dueDate'), false); assert.match(view, /tasksOnDate\(this\.plugin\.embeddedTasks\.all\(\)/); });
test('selected year month and mode are one view state', () => { for (const key of ['selectedYear', 'selectedMonth', 'mode']) assert.ok(view.includes(key)); });
test('plan view does not reference data json', () => assert.equal(view.includes('data.json'), false));
test('month selector remains three columns at every viewport width', () => {
	const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
	assert.match(css, /\.mx-plan-months\s*\{[^}]*repeat\(3,/); assert.equal(css.includes('.mx-plan-months { grid-template-columns: repeat(6'), false); assert.match(css, /@container \(max-width: 1100px\)[\s\S]*\.mx-plan-container/);
});
test('week board has no redundant section heading or quarter caption', () => { assert.equal(view.includes('本月周计划'), false); assert.equal(view.includes('当前选择 · Q'), false); });
test('plan title is a static author-style toolbar label rather than a tab button', () => { assert.match(view, /po-toolbar mx-plan-toolbar/); assert.equal(view.includes("po-tab is-active', text: '计划总览'"), false); });
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
