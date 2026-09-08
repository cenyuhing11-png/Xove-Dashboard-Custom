import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureJournal, isCanonicalDailyJournalPath, journalCalendarEntry, journalDateFromPath, journalEntry, journalHistory, journalInfo, journalStates, journalTasks, journalTemplate, journalTitleWidgetOffset, updateJournalTitleContent } from './journal.ts';
import type { JournalEntry, JournalKind } from './journal.ts';
import type { PlanFiles } from './planning.ts';
import { DAILY_TASK_FILE, parseEmbeddedTasks } from './embeddedTasks.ts';

const date = new Date(2026, 8, 6, 0, 1);
for (const [kind, suffix] of Object.entries({ day: '01-日记/2026-09-06', week: '02-周记/2026-W36 周记', month: '03-月度复盘/2026-09 月度复盘', year: '04-年度复盘/2026 年度复盘' })) {
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
	assert.equal(journalTemplate('day', date), '---\n类型: 日记\n日期: 2026-09-06\n标题:\n---\n\n## 今日任务\n\n## 随时记\n\n## 今日日记\n\n## 今日回看\n\n');
	assert.doesNotMatch(journalTemplate('day', date), /^# /m);
});
test('daily journal date parser accepts current and clean names without touching unrelated notes', () => {
	assert.equal(journalDateFromPath('04-日记与复盘/01-日记/2026-09-08 日记.md'), '2026-09-08');
	assert.equal(journalDateFromPath('04-日记与复盘/01-日记/2026-09-08.md'), '2026-09-08');
	assert.equal(journalDateFromPath('04-日记与复盘/01-日记/快捷指令测试.md'), null);
	assert.equal(journalDateFromPath('Daily/2026-09-08.md'), null);
});
test('live preview title targets only canonical daily journal filenames', () => {
	assert.equal(isCanonicalDailyJournalPath('04-日记与复盘/01-日记/2026-09-08.md'), true);
	assert.equal(isCanonicalDailyJournalPath('04-日记与复盘/01-日记/2026-09-08 日记.md'), false);
	assert.equal(isCanonicalDailyJournalPath('04-日记与复盘/02-周记/2026-09-08.md'), false);
	assert.equal(isCanonicalDailyJournalPath('01-学习与资料/课程/2026-09-08.md'), false);
});
test('live preview title widget is anchored immediately after the exact daily heading', () => {
	const content = '---\n标题: 一天\n---\n\n## 今日日记\n\n正文\n## 今日回看\n';
	const offset = journalTitleWidgetOffset(content);
	assert.equal(offset, content.indexOf('## 今日日记') + '## 今日日记'.length);
	assert.equal(content.slice(offset ?? 0), '\n\n正文\n## 今日回看\n');
});
test('live preview title widget does not appear without an exact heading', () => {
	assert.equal(journalTitleWidgetOffset('---\n标题:\n---\n\n## 今日日记内容\n'), null);
	assert.equal(journalTitleWidgetOffset('---\n说明: "## 今日日记"\n---\n\n正文'), null);
	assert.equal(journalTitleWidgetOffset('```md\n## 今日日记\n```'), null);
});
test('journal summary queries only the journal date and shares three display categories', () => {
	const tasks = [
		...parseEmbeddedTasks('01-学习与资料/视频/学习.md', '## 学习任务\n- [ ] 学习 📅 2026-09-08\n- [ ] 明天 📅 2026-09-09'),
		...parseEmbeddedTasks('02-知识与思考/创作.md', '## 创作任务\n- [ ] 创作 📅 2026-09-08'),
		...parseEmbeddedTasks('03-项目与成果/项目/项目.md', '## 项目任务\n- [ ] 项目 📅 2026-09-08'),
		...parseEmbeddedTasks(DAILY_TASK_FILE, '## 日常待办\n- [ ] 日常 📅 2026-09-08'),
	];
	const result = journalTasks(tasks, '04-日记与复盘/01-日记/2026-09-08 日记.md');
	assert.equal(result.date, '2026-09-08');
	assert.deepEqual(result.groups.learning.map(task => task.text), ['学习']);
	assert.deepEqual(result.groups.creation.map(task => task.text), ['创作', '项目']);
	assert.deepEqual(result.groups.daily.map(task => task.text), ['日常']);
});

test('calendar journal title follows frontmatter, H1 and quick-note fallbacks', () => {
	const path = '04-日记与复盘/01-日记/2026-09-08.md';
	const property = journalCalendarEntry(path, '# 正文标题\n\n## 随时记\n\n- 一条', { 标题: '属性标题' });
	assert.equal(property?.title, '属性标题'); assert.equal(property?.titleSource, 'frontmatter');
	const legacy = journalCalendarEntry(path, '# 正文标题\n', {});
	assert.equal(legacy?.title, '正文标题'); assert.equal(legacy?.titleSource, 'legacy-h1');
	const quick = journalCalendarEntry(path, '## 随时记\n\n- 一条\n- 两条', {});
	assert.equal(quick?.title, '随时记 · 2条'); assert.equal(quick?.titleSource, 'quick-note');
});

test('calendar omits files without an intentional title or quick note', () => {
	const path = '04-日记与复盘/01-日记/2026-09-08.md';
	assert.equal(journalCalendarEntry(path, '## 今日任务\n\n- [ ] 任务 \ud83d\udcc5 2026-09-08\n\n## 随时记\n\n## 今日日记\n\n正文但忘记标题', { 标题: '' }), null);
	assert.equal(journalCalendarEntry(path, '# 2026年9月8日\n\n## 今日任务\n\n- [ ] 任务', {}), null);
});

test('journal title update changes only frontmatter and never creates an H1 copy', () => {
	const content = '---\n类型: 日记\n日期: 2026-09-08\n标题:\n其他: 保留\n---\n\n## 今日日记\n\n正文\n';
	const next = updateJournalTitleContent(content, '今天终于把梦序理顺了一点！');
	assert.match(next, /日期: 2026-09-08\n标题: 今天终于把梦序理顺了一点！\n其他: 保留/);
	assert.equal((next.match(/今天终于把梦序理顺了一点！/g) ?? []).length, 1);
	assert.doesNotMatch(next, /^# /m);
	assert.match(next, /## 今日日记\n\n正文/);
});

test('clearing a journal title keeps the template-compatible empty property', () => {
	const content = '---\r\n类型: 日记\r\n标题: 旧标题\r\n日期: 2026-09-08\r\n---\r\n\r\n## 今日日记\r\n';
	const next = updateJournalTitleContent(content, '   ');
	assert.match(next, /类型: 日记\r\n标题:\r\n日期: 2026-09-08/);
	assert.equal(next.replace(/\r\n/g, '').includes('\n'), false);
});

test('calendar journal reads quick-note count and first daily paragraph without rewriting source', () => {
	const content = '---\n标题: 一天\n---\n\n## 随时记\n\n- A\n- B\n\n## 今日日记\n\n第一段 **内容**。\n仍是第一段。\n\n第二段。';
	const before = content;
	const entry = journalCalendarEntry('04-日记与复盘/01-日记/2026-09-08 日记.md', content, { 标题: '一天' });
	assert.equal(entry?.quickNoteCount, 2);
	assert.equal(entry?.summary, '第一段 内容。 仍是第一段。');
	assert.equal(content, before);
});

test('calendar journal ignores headings inside frontmatter and code fences', () => {
	const content = '---\n说明: "# 假标题"\n---\n\n```md\n# 代码标题\n## 随时记\n- 假记录\n```\n\n# 真实标题';
	const entry = journalCalendarEntry('04-日记与复盘/01-日记/2026-09-08.md', content, {});
	assert.equal(entry?.title, '真实标题');
	assert.equal(entry?.quickNoteCount, 0);
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
test('existing legacy suffixed diary is reused without creating a clean-name duplicate', async () => {
	const s = store(); const legacy = '04-日记与复盘/01-日记/2026-09-06 日记.md';
	s.contents.set(legacy, '用户旧日记');
	assert.equal(await ensureJournal(s.files, 'day', date), legacy);
	assert.equal(s.contents.size, 1);
	assert.equal(journalStates(s.files, date)[0]?.exists, true);
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
