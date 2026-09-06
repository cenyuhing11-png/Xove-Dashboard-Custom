import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureJournal, journalEntry, journalHistory, journalInfo, journalStates, journalTemplate } from './journal.ts';
import type { JournalEntry, JournalKind } from './journal.ts';
import type { PlanFiles } from './planning.ts';

const date = new Date(2026, 8, 6, 0, 1);
for (const [kind, suffix] of Object.entries({ day: '01-日记/2026-09-06 日记', week: '02-周记/2026-W36 周记', month: '03-月度复盘/2026-09 月度复盘', year: '04-年度复盘/2026 年度复盘' })) {
	test(`${kind} local path`, () => assert.equal(journalInfo(kind as JournalKind, date).path, `04-日记与复盘/${suffix}.md`));
}
test('week journal shares ISO week-year boundaries with planning', () => {
	assert.equal(journalInfo('week', new Date(2021, 0, 1)).period, '2020-W53');
	assert.equal(journalInfo('week', new Date(2018, 11, 31)).period, '2019-W01');
	assert.match(journalTemplate('week', new Date(2021, 0, 1)), /关联计划: "\[\[2020-W53 周计划\]\]"/);
});
test('local late night and midnight do not shift date', () => {
	assert.equal(journalInfo('day', new Date(2026, 0, 1, 0, 1)).period, '2026-01-01');
	assert.equal(journalInfo('day', new Date(2026, 11, 31, 23, 59)).period, '2026-12-31');
});
test('daily template is lightweight with exact sections', () => {
	assert.equal(journalTemplate('day', date), '---\n类型: 日记\n日期: 2026-09-06\n---\n\n# 2026年9月6日\n\n## 今天\n\n## 想法\n\n## 学习与收获\n\n## 明天\n\n');
});
test('weekly template includes current plan link and six sections', () => {
	const md = journalTemplate('week', date);
	assert.match(md, /类型: 周记\n期间: 2026-W36\n关联计划: "\[\[2026-W36 周计划\]\]"/);
	assert.equal((md.match(/^## /gm) ?? []).length, 6);
	assert.match(md, /# 2026 W36 周记/);
});
test('monthly template includes nine sections and monthly plan link', () => {
	const md = journalTemplate('month', date);
	assert.match(md, /类型: 复盘\n周期: 月度\n期间: 2026-09/);
	assert.match(md, /关联计划: "\[\[2026-09 月度计划\]\]"/);
	assert.equal((md.match(/^## /gm) ?? []).length, 9);
	assert.match(md, /# 2026年9月复盘/);
});
test('annual template includes ten sections and yearly plan link', () => {
	const md = journalTemplate('year', date);
	assert.match(md, /类型: 复盘\n周期: 年度\n期间: 2026/);
	assert.match(md, /关联计划: "\[\[2026 年度计划\]\]"/);
	assert.equal((md.match(/^## /gm) ?? []).length, 10);
	assert.match(md, /# 2026年度复盘/);
});
function store() {
	const contents = new Map<string, string>();
	const folders = new Set<string>();
	const files: PlanFiles = {
		kind: (p) => contents.has(p) ? 'file' : folders.has(p) ? 'folder' : undefined,
		read: async (p) => contents.get(p) ?? '',
		createFolder: async (p) => { if (folders.has(p)) throw new Error('exists'); folders.add(p); },
		create: async (p, md) => { if (contents.has(p)) throw new Error('exists'); contents.set(p, md); },
	};
	return { contents, folders, files };
}
test('existing diary is never overwritten', async () => {
	const s = store(); const path = journalInfo('day', date).path;
	s.contents.set(path, '用户真实记录');
	assert.equal(await ensureJournal(s.files, 'day', date), path);
	assert.equal(s.contents.get(path), '用户真实记录');
});
for (const kind of ['day', 'week', 'month', 'year'] as const) test(`${kind} missing note creates template and no other note`, async () => {
	const s = store(); const path = await ensureJournal(s.files, kind, date);
	assert.equal(s.contents.get(path), journalTemplate(kind, date));
	await ensureJournal(s.files, kind, date);
	assert.equal(s.contents.size, 1);
	assert.ok(s.folders.has(journalInfo(kind, date).folder));
});
test('concurrent create is safe', async () => {
	const s = store();
	await Promise.all([ensureJournal(s.files, 'week', date), ensureJournal(s.files, 'week', date)]);
	assert.equal(s.contents.size, 1);
});
test('empty-directory status inspection never creates files', () => {
	const s = store();
	assert.ok(journalStates(s.files, date).every((n) => !n.exists && !n.blocked));
	assert.equal(s.contents.size + s.folders.size, 0);
	assert.deepEqual(journalHistory([], 'records'), []);
	assert.deepEqual(journalHistory([], 'reviews'), []);
});
test('file and folder collisions fail without destroying data', async () => {
	const s = store();
	s.folders.add(journalInfo('day', date).path);
	assert.equal(journalStates(s.files, date)[0]?.blocked, true);
	await assert.rejects(ensureJournal(s.files, 'day', date));
	s.contents.set('04-日记与复盘', '保留');
	await assert.rejects(ensureJournal(s.files, 'year', date));
	assert.equal(s.contents.get('04-日记与复盘'), '保留');
});
function entry(kind: JournalKind, period: string): JournalEntry {
	const folder = { day: '01-日记', week: '02-周记', month: '03-月度复盘', year: '04-年度复盘' }[kind];
	return journalEntry(`04-日记与复盘/${folder}/${period}.md`, period, {
		类型: kind === 'day' ? '日记' : kind === 'week' ? '周记' : '复盘',
		周期: kind === 'month' ? '月度' : '年度', 日期: period, 期间: period,
	})!;
}
test('recent records combine days and weeks by period start, descending', () => {
	const notes = [entry('day', '2026-08-31'), entry('week', '2026-W36'), entry('day', '2026-09-06'), entry('week', '2026-W37')];
	assert.deepEqual(journalHistory(notes, 'records').map((n) => n.period), ['2026-W37', '2026-09-06', '2026-08-31', '2026-W36']);
	assert.equal(notes[0]?.period, '2026-08-31');
});
test('reviews combine monthly and yearly periods descending', () => {
	const notes = [entry('year', '2025'), entry('month', '2026-09'), entry('year', '2026'), entry('day', '2026-09-06')];
	assert.deepEqual(journalHistory(notes, 'reviews').map((n) => n.period), ['2026-09', '2026', '2025']);
});
test('history is limited to 30 entries', () => {
	const notes = Array.from({ length: 40 }, (_, i) => entry('year', String(2000 + i)));
	assert.equal(journalHistory(notes, 'reviews').length, 30);
});
test('invalid properties, periods and dates are skipped', () => {
	for (const fm of [null, undefined, [], 'invalid YAML', { 类型: '其它' }, { 类型: '日记', 日期: '2026-02-30' }, { 类型: '日记', 日期: ['2026-09-06'] }]) {
		assert.equal(journalEntry('04-日记与复盘/01-日记/x.md', 'x', fm), null);
	}
	assert.equal(entry('week', '2026-W99'), null);
	assert.equal(entry('month', '2026-13'), null);
	assert.equal(entry('year', 'oops'), null);
});
test('history does not pick up unrelated legacy diary directories', () => {
	assert.equal(journalEntry('Daily/2026-09-06.md', '旧日记', { 类型: '日记', 日期: '2026-09-06' }), null);
});
test('numeric annual property from YAML is supported', () => {
	assert.equal(journalEntry('04-日记与复盘/04-年度复盘/2026 年度复盘.md', '2026 年度复盘', { 类型: '复盘', 周期: '年度', 期间: 2026 })?.period, '2026');
});
