import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync(new URL('../views/PlanView.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/workbench/WorkbenchShell.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

test('global navigation names time trace directly after home', () => assert.match(shell, /label: '首页'[\s\S]*label: '时迹'[\s\S]*label: '进程'/));
test('plan has a dedicated top-level view', () => assert.match(view, /PLAN_VIEW = 'xove-dashboard-custom-plan-workspace'/));
test('plan top-level view reuses WorkbenchShell with active plan state', () => assert.match(view, /new WorkbenchShell\([\s\S]*'plan'\)/));
test('plan view is registered by the plugin', () => assert.match(main, /registerView\(PLAN_VIEW/));
test('global plan navigation opens the dedicated view', () => assert.match(main, /action === 'plan'[\s\S]*openPlanWorkspace/));
test('plan board reuses original ProjectBoard primitives', () => { for (const cls of ['po-container', 'po-sidebar', 'po-kanban', 'po-kanban__col', 'po-kanban__card']) assert.ok(view.includes(cls)); });
test('plan calendar reuses original calendar primitives', () => { for (const cls of ['po-cal__bar', 'po-cal__days', 'po-cal__week', 'po-cal__det']) assert.ok(view.includes(cls)); });
test('plan workspace never creates plan markdown', () => { assert.equal(view.includes('ensurePlan'), false); assert.equal(view.includes('.vault.create('), false); });
test('calendar checkboxes write through EmbeddedTaskStore complete', () => assert.match(view, /embeddedTasks\.complete\(task/));
test('calendar dates come only from Embedded Tasks, never process start or due dates', () => { assert.equal(view.includes('process.startDate'), false); assert.equal(view.includes('process.dueDate'), false); assert.match(view, /tasksOnDate\(this\.plugin\.embeddedTasks\.all\(\)/); });
test('selected year month and all three modes are one shared view state', () => { for (const key of ['selectedYear', 'selectedMonth', 'mode', "'review'"]) assert.ok(view.includes(key)); });
test('plan view does not reference data json', () => assert.equal(view.includes('data.json'), false));
test('month selector remains three columns at every viewport width', () => {
	const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
	assert.match(css, /\.mx-plan-months\s*\{[^}]*repeat\(3,/); assert.equal(css.includes('.mx-plan-months { grid-template-columns: repeat(6'), false); assert.match(css, /@container \(max-width: 1100px\)[\s\S]*\.mx-plan-container/);
});
test('week board has no redundant section heading or quarter caption', () => { assert.equal(view.includes('本月周计划'), false); assert.equal(view.includes('当前选择 · Q'), false); });
test('time trace title is a static author-style toolbar label rather than a tab button', () => { assert.match(view, /po-toolbar mx-plan-toolbar/); assert.ok(view.includes("mx-plan-title', text: '时迹'")); assert.equal(view.includes("计划总览"), false); });
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
