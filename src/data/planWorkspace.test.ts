import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, incompleteTaskCountOnDate, localPlanSelection, monthIsoWeeks, quarterForMonth, readPlanWorkspace, selectionDate, taskCalendarCategory, taskCalendarSourceLabel, tasksInMonth, tasksOnDate } from './planWorkspace.ts';
import { planInfo } from './planning.ts';
import type { EmbeddedTask, EmbeddedSourceType } from './embeddedTasks.ts';

function task(sourceType: EmbeddedSourceType, date?: string, completed = false, sourceFile?: string): EmbeddedTask {
	return { id: `${sourceType}-${date}-${completed}`, text: `${sourceType} task`, completed, date, sourceType, sourceFile: sourceFile ?? (sourceType === 'daily' ? '05-计划/06-日常任务.md' : sourceType === 'project' ? '03-项目与成果/P/P.md' : sourceType === 'creation' ? '02-知识与思考/K.md' : '01-学习与资料/课程/L.md'), sourceHeading: '任务', sourceDisplayName: '来源', locator: { line: 1, raw: '', snapshot: '', persistent: true } };
}

test('local selection uses local year and one-based month', () => assert.deepEqual(localPlanSelection(new Date(2026, 8, 7, 23)), { year: 2026, month: 9 }));
for (let month = 1; month <= 12; month++) test(`month ${month} belongs to quarter ${Math.floor((month - 1) / 3) + 1}`, () => assert.equal(quarterForMonth(month), Math.floor((month - 1) / 3) + 1));
test('quarter rejects month zero', () => assert.throws(() => quarterForMonth(0)));
test('quarter rejects month thirteen', () => assert.throws(() => quarterForMonth(13)));
test('selection date is local first day at noon', () => { const date = selectionDate(2026, 9); assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()], [2026, 8, 1, 12]); });
test('selection rejects invalid year', () => assert.throws(() => selectionDate(0, 1)));

const weekCounts = [5, 5, 6, 5, 5, 5, 5, 6, 5, 5, 6, 5];
for (let month = 1; month <= 12; month++) test(`2026 month ${month} exposes every intersecting ISO week`, () => {
	const weeks = monthIsoWeeks(2026, month);
	assert.equal(weeks.length, weekCounts[month - 1]);
	assert.equal(weeks[0]!.start.getDay(), 1); assert.equal(weeks.at(-1)!.end.getDay(), 0);
});
test('January may start in prior ISO year', () => { const first = monthIsoWeeks(2021, 1)[0]!; assert.deepEqual([first.isoYear, first.week], [2020, 53]); });
test('December may end in next ISO year', () => { const last = monthIsoWeeks(2018, 12).at(-1)!; assert.deepEqual([last.isoYear, last.week], [2019, 1]); });
test('date key uses local calendar date', () => assert.equal(dateKey(new Date(2026, 8, 7, 1)), '2026-09-07'));

function store(values: Record<string, string>) { return { kind: (path: string) => path in values ? 'file' as const : undefined, read: async (path: string) => values[path]! }; }
test('workspace reads annual, quarterly and monthly sections without creating files', async () => {
	const date = new Date(2026, 8, 1, 12); const values: Record<string, string> = {};
	values[planInfo('year', date).path] = '## 年度核心突破\n- A\n- B\n- C\n- D';
	values[planInfo('quarter', date).path] = '## 当前季度主题\n- Q1\n- Q2';
	values[planInfo('month', date).path] = '## 本月重点\n- M';
	const result = await readPlanWorkspace(store(values), 2026, 9);
	assert.deepEqual(result.annual.entries, ['A', 'B', 'C']); assert.deepEqual(result.quarterly.entries, ['Q1', 'Q2']); assert.deepEqual(result.monthly.entries, ['M']);
});
test('quarter falls back to 季度重点', async () => { const date = new Date(2026, 8, 1, 12); const values = { [planInfo('quarter', date).path]: '## 季度重点\n- fallback' }; assert.deepEqual((await readPlanWorkspace(store(values), 2026, 9)).quarterly.entries, ['fallback']); });
test('missing plans remain neutral read-only states', async () => { const result = await readPlanWorkspace(store({}), 2026, 9); assert.equal(result.annual.exists, false); assert.equal(result.monthly.entries.length, 0); assert.ok(result.weeks.every(week => !week.exists)); });
test('malformed plan path is reported without throwing', async () => { const files = { kind: () => 'folder' as const, read: async () => '' }; assert.equal((await readPlanWorkspace(files, 2026, 9)).annual.error, '暂时无法读取计划'); });
test('week cards read at most three priorities', async () => { const date = monthIsoWeeks(2026, 9)[0]!.start; const values = { [planInfo('week', date).path]: '## 本周重点\n- 1\n- 2\n- 3\n- 4' }; const result = await readPlanWorkspace(store(values), 2026, 9); assert.deepEqual(result.weeks[0]!.entries, ['1', '2', '3']); });
test('selected month determines quarter label', async () => assert.equal((await readPlanWorkspace(store({}), 2026, 12)).quarter, 4));
test('week range always spans six calendar days', () => { for (const week of monthIsoWeeks(2026, 9)) assert.equal(Math.round((week.end.getTime() - week.start.getTime()) / 86400000), 6); });

test('tasks on date excludes undated and other dates', () => assert.equal(tasksOnDate([task('daily'), task('daily', '2026-09-07'), task('daily', '2026-09-08')], '2026-09-07').length, 1));
test('tasks on date sorts incomplete before complete', () => assert.deepEqual(tasksOnDate([task('daily', '2026-09-07', true), task('daily', '2026-09-07')], '2026-09-07').map(value => value.completed), [false, true]));
test('one incomplete task produces a count of one', () => assert.equal(incompleteTaskCountOnDate([task('daily', '2026-09-07')], '2026-09-07'), 1));
test('completed tasks never enter the incomplete count', () => assert.equal(incompleteTaskCountOnDate([task('daily', '2026-09-07', true)], '2026-09-07'), 0));
test('learning creation project and daily tasks all enter the incomplete count', () => assert.equal(incompleteTaskCountOnDate(['learning', 'creation', 'project', 'daily'].map(source => task(source as EmbeddedSourceType, '2026-09-07')), '2026-09-07'), 4));
test('incomplete count stays on its original past date', () => { const values=[task('daily','2026-09-07'),task('daily','2026-09-08')];assert.equal(incompleteTaskCountOnDate(values,'2026-09-07'),1);assert.equal(incompleteTaskCountOnDate(values,'2026-09-09'),0); });
test('tasks in month excludes undated tasks', () => assert.equal(tasksInMonth([task('daily'), task('daily', '2026-09-01')], 2026, 9).length, 1));
test('tasks in month does not prefix-match another month', () => assert.equal(tasksInMonth([task('daily', '2026-09-01'), task('daily', '2026-10-01')], 2026, 9).length, 1));
for (const [source, category] of [['learning', 'learning'], ['creation', 'creation'], ['project', 'creation'], ['daily', 'daily']] as const) test(`${source} aggregates as ${category}`, () => assert.equal(taskCalendarCategory(task(source)), category));
for (const [source, label] of [['project', '项目'], ['creation', '知识'], ['daily', '日常']] as const) test(`${source} source has stable ${label} label`, () => assert.equal(taskCalendarSourceLabel(task(source)), label));
test('video learning source uses 视频 label', () => assert.equal(taskCalendarSourceLabel(task('learning', '2026-09-07', false, '01-学习与资料/视频/示例.md')), '视频'));
test('other learning sources use 学习 label', () => assert.equal(taskCalendarSourceLabel(task('learning')), '学习'));
