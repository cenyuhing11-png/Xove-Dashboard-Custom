import test from 'node:test';
import assert from 'node:assert/strict';
import {
	discoverReviewRecords,
	ensureDayReviewForFocus,
	ensureReviewForFocus,
	pastTodayReference,
	pastTodayReviewRecords,
	plainReviewText,
	randomReviewRecord,
	recentReviewRecords,
	recentReviewTimeLabel,
	recentReviewTitle,
	reviewRecordFromSource,
	reviewRecordTimeLabel,
	searchReviewRecords,
	timeStateForReviewRecord,
} from './journalReview.ts';
import type { ReviewRecord, ReviewRecordSource } from './journalReview.ts';
import { journalInfo, journalTemplate } from './journal.ts';
import type { PlanFiles } from './planning.ts';

const root = '04-日记与复盘';

function source(kind: 'day' | 'week' | 'month' | 'year', period: string, markdown = '', extra: Record<string, unknown> = {}): ReviewRecordSource {
	const meta = kind === 'day'
		? { 类型: '日记', 日期: period, ...extra }
		: kind === 'week'
			? { 类型: '周记', 期间: period, ...extra }
			: { 类型: '复盘', 周期: kind === 'month' ? '月度' : '年度', 期间: period, ...extra };
	const folder = { day: '01-日记', week: '02-周记', month: '03-月度复盘', year: '04-年度复盘' }[kind];
	const basename = kind === 'day' ? period : `${period} ${{ week: '周记', month: '月度复盘', year: '年度复盘' }[kind]}`;
	return { path: `${root}/${folder}/${basename}.md`, basename, markdown, properties: meta };
}

function record(kind: 'day' | 'week' | 'month' | 'year', period: string, markdown = '', extra: Record<string, unknown> = {}): ReviewRecord {
	const value = reviewRecordFromSource(source(kind, period, markdown, extra));
	assert.ok(value);
	return value;
}

function journalStore(initial?: Record<string, string>) {
	const contents = new Map(Object.entries(initial ?? {}));
	const folders = new Set<string>();
	const files: PlanFiles = {
		kind: path => contents.has(path) ? 'file' : folders.has(path) ? 'folder' : undefined,
		read: async path => contents.get(path) ?? '',
		createFolder: async path => { if (folders.has(path)) throw new Error('exists'); folders.add(path); },
		create: async (path, content) => { if (contents.has(path)) throw new Error('exists'); contents.set(path, content); },
	};
	return { contents, files };
}

test('day review creation uses the explicit historical focus and shared template', async () => {
	const store = journalStore();
	const focus = { kind: 'day', date: '2026-09-08' } as const;
	const path = await ensureDayReviewForFocus(store.files, focus);
	assert.equal(path, '04-日记与复盘/01-日记/2026-09-08.md');
	assert.equal(store.contents.get(path!), journalTemplate('day', new Date(2026, 8, 8, 12)));
	assert.doesNotMatch(store.contents.keys().next().value ?? '', /2026-09-11/);
});

test('day review creation supports today through the same focus-driven helper', async () => {
	const today = new Date();
	const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
	const store = journalStore();
	assert.equal(await ensureDayReviewForFocus(store.files, { kind: 'day', date: period }), journalInfo('day', today).path);
});

test('existing focused daily journal is reused without duplicate creation', async () => {
	const path = '04-日记与复盘/01-日记/2026-09-08.md';
	const store = journalStore({ [path]: '用户已有正文' });
	assert.equal(await ensureDayReviewForFocus(store.files, { kind: 'day', date: '2026-09-08' }), path);
	assert.equal(store.contents.size, 1);
	assert.equal(store.contents.get(path), '用户已有正文');
});

test('focused daily creation rejects invalid dates and ignores non-day focus', async () => {
	const store = journalStore();
	await assert.rejects(ensureDayReviewForFocus(store.files, { kind: 'day', date: '2026-02-30' }), /日期无效/);
	assert.equal(await ensureDayReviewForFocus(store.files, { kind: 'month', year: 2026, month: 9 }), null);
	assert.equal(store.contents.size, 0);
});

test('focused daily creation surfaces storage failures without pretending success', async () => {
	const store = journalStore();
	store.files.create = async () => { throw new Error('磁盘只读'); };
	await assert.rejects(ensureDayReviewForFocus(store.files, { kind: 'day', date: '2026-09-08' }), /磁盘只读/);
	assert.equal(store.contents.size, 0);
});

test('week review creation uses the selected ISO week rather than the current real week', async () => {
	const store = journalStore();
	const focus = { kind: 'week', isoYear: 2024, isoWeek: 18, anchorDate: '2099-01-01' } as const;
	const path = await ensureReviewForFocus(store.files, focus);
	const date = new Date(2024, 3, 29, 12);
	assert.equal(path, journalInfo('week', date).path);
	assert.equal(store.contents.get(path), journalTemplate('week', date));
	assert.match(path, /2024-W18 周记\.md$/);
});

test('month and year review creation use their selected historical focus and shared templates', async () => {
	for (const [focus, kind, date] of [
		[{ kind: 'month', year: 2025, month: 6 } as const, 'month' as const, new Date(2025, 5, 1, 12)],
		[{ kind: 'year', year: 2023 } as const, 'year' as const, new Date(2023, 0, 1, 12)],
	] as const) {
		const store = journalStore();
		const path = await ensureReviewForFocus(store.files, focus);
		assert.equal(path, journalInfo(kind, date).path);
		assert.equal(store.contents.get(path), journalTemplate(kind, date));
	}
});

test('focused review creation reuses existing files and rejects invalid periods', async () => {
	const existing = journalInfo('month', new Date(2025, 5, 1, 12)).path;
	const store = journalStore({ [existing]: '用户已有复盘' });
	assert.equal(await ensureReviewForFocus(store.files, { kind: 'month', year: 2025, month: 6 }), existing);
	assert.equal(store.contents.size, 1);
	assert.equal(store.contents.get(existing), '用户已有复盘');
	await assert.rejects(ensureReviewForFocus(store.files, { kind: 'month', year: 2025, month: 13 }), /周期无效/);
	await assert.rejects(ensureReviewForFocus(store.files, { kind: 'week', isoYear: 2025, isoWeek: 54, anchorDate: '2025-01-01' }), /周期无效/);
});

test('discovery recognizes the four real journal and review kinds', () => {
	assert.equal(record('day', '2026-09-10').kind, 'day');
	assert.equal(record('week', '2026-W37').kind, 'week');
	assert.equal(record('month', '2026-09').kind, 'month');
	assert.equal(record('year', '2026').kind, 'year');
});

test('discovery rejects plans and journals outside the canonical folders', () => {
	assert.equal(reviewRecordFromSource({ ...source('day', '2026-09-10'), path: '05-计划/2026-09-10.md' }), null);
	assert.equal(reviewRecordFromSource({ path: '05-计划/02-年度/2026 年度计划.md', basename: '2026 年度计划', markdown: '## 目标\n内容', properties: { 类型: '计划', 周期: '年度', 期间: '2026' } }), null);
});

test('discovery is read-only and sorts one transient vault scan by logical time', async () => {
	const files = [source('year', '2025'), source('day', '2026-09-10', '## 今日日记\n今天')].map(item => ({ path: item.path, basename: item.basename, item }));
	let fileScans = 0;
	let reads = 0;
	const app = {
		vault: {
			getMarkdownFiles: () => { fileScans++; return files; },
			cachedRead: async (file: typeof files[number]) => { reads++; return file.item.markdown; },
		},
		metadataCache: { getFileCache: (file: typeof files[number]) => ({ frontmatter: file.item.properties }) },
	};
	const found = await discoverReviewRecords(app as never);
	assert.deepEqual(found.map(item => item.period), ['2026-09-10', '2025']);
	assert.equal(fileScans, 1);
	assert.equal(reads, 2);
	assert.equal('create' in app.vault, false);
});

test('daily record uses frontmatter title and the settled three reading sections', () => {
	const item = record('day', '2026-09-10', '## 今日任务\n- [ ] 私密待办\n\n## 随时记\n- 09:20 灵感\n\n## 今日日记\n正文\n\n## 今日回看\n反思', { 标题: '秋天的一天' });
	assert.equal(item.title, '秋天的一天');
	assert.match(item.searchableText, /秋天的一天.*灵感.*正文.*反思/);
	assert.doesNotMatch(item.searchableText, /私密待办/);
});

test('daily record falls back to a legacy H1 title', () => {
	assert.equal(record('day', '2026-09-10', '# 老标题\n\n## 今日日记\n正文').title, '老标题');
});

test('daily record falls back to quick-note count without inventing unnamed diary text', () => {
	assert.equal(record('day', '2026-09-10', '## 随时记\n- 09:20 一条\n- 12:30 二条').title, '随时记 · 2条');
	assert.equal(record('day', '2026-09-11', '## 今日日记\n').title, '暂无正文');
});

test('daily recent title falls back from diary body to reflection and then empty copy', () => {
	assert.equal(record('day', '2026-09-08', '## 今日日记\n第一段正文\n\n第二段').title, '第一段正文');
	assert.equal(record('day', '2026-09-09', '## 今日回看\n今天的回看').title, '今天的回看');
	assert.equal(record('day', '2026-09-10', '## 随时记\n\n## 今日日记\n\n## 今日回看\n').title, '暂无正文');
});

test('week month and year records search their review bodies', () => {
	assert.match(record('week', '2026-W37', '## 本周感受\n周内容').searchableText, /周内容/);
	assert.match(record('month', '2026-09', '## 本月完成\n月内容').searchableText, /月内容/);
	assert.match(record('year', '2026', '## 年度收获\n年内容').searchableText, /年内容/);
});

test('plain text extraction preserves visible aliases while removing markdown decoration', () => {
	assert.equal(plainReviewText('- **看完** [[原名|显示名]] 和 [网页](https://example.com)'), '看完 显示名 和 网页');
});

test('recent records merge all four kinds and sort newest first', () => {
	const records = [record('year', '2025'), record('week', '2026-W36'), record('day', '2026-09-10'), record('month', '2026-08')];
	assert.deepEqual(recentReviewRecords(records).map(item => item.period), ['2026-09-10', '2026-W36', '2026-08', '2025']);
});

test('recent records show twelve by default and can grow by another twelve', () => {
	const records = Array.from({ length: 25 }, (_, index) => record('day', `2026-08-${String(index + 1).padStart(2, '0')}`));
	assert.equal(recentReviewRecords(records).length, 12);
	assert.equal(recentReviewRecords(records, 24).length, 24);
});

test('recent row time labels encode granularity without a second type line', () => {
	assert.equal(recentReviewTimeLabel(record('day', '2026-09-10')), '09.10');
	assert.equal(recentReviewTimeLabel(record('week', '2026-W37')), 'W37');
	assert.equal(recentReviewTimeLabel(record('month', '2026-09')), '2026.09');
	assert.equal(recentReviewTimeLabel(record('year', '2026')), '2026');
});

test('recent row titles keep real headings and provide compact month and year defaults', () => {
	assert.equal(recentReviewTitle(record('week', '2026-W37')), '2026-W37 周记');
	assert.equal(recentReviewTitle(record('month', '2026-09')), '9 月复盘');
	assert.equal(recentReviewTitle(record('year', '2026')), '2026 年度复盘');
	assert.equal(recentReviewTitle(record('month', '2026-09', '# 九月重新出发\n\n## 本月完成\n内容')), '九月重新出发');
});

test('recent sort does not depend on filesystem modification time', () => {
	const older = record('day', '2025-01-01');
	const newer = record('day', '2026-01-01');
	assert.deepEqual(recentReviewRecords([older, newer]).map(item => item.period), ['2026-01-01', '2025-01-01']);
});

test('search trims query and is case-insensitive for ASCII', () => {
	const records = [record('day', '2026-09-10', '## 今日日记\nLearning TypeScript')];
	assert.equal(searchReviewRecords(records, '  typescript  ').length, 1);
	assert.equal(searchReviewRecords(records, 'LEARNING').length, 1);
});

test('search supports Chinese substrings in daily title and body', () => {
	const item = record('day', '2026-09-10', '## 今日回看\n完成了动画练习', { 标题: '充实的一天' });
	assert.equal(searchReviewRecords([item], '实的一').length, 1);
	assert.equal(searchReviewRecords([item], '动画').length, 1);
});

test('search excludes daily task section', () => {
	const item = record('day', '2026-09-10', '## 今日任务\n- [ ] 机密任务\n\n## 今日日记\n普通正文');
	assert.equal(searchReviewRecords([item], '机密任务').length, 0);
});

test('search includes weekly monthly and yearly review bodies', () => {
	const records = [
		record('week', '2026-W37', '## 感受\n共同关键词'),
		record('month', '2026-09', '## 完成\n共同关键词'),
		record('year', '2026', '## 收获\n共同关键词'),
	];
	assert.deepEqual(searchReviewRecords(records, '共同关键词').map(item => item.record.kind), ['week', 'month', 'year']);
});

test('search returns an empty result for blank queries', () => {
	assert.deepEqual(searchReviewRecords([record('day', '2026-09-10', '## 今日日记\n内容')], '   '), []);
});

test('search returns one result per source file with a nearby snippet', () => {
	const item = record('day', '2026-09-10', `## 今日日记\n${'前文'.repeat(30)}命中词${'后文'.repeat(30)}`);
	const results = searchReviewRecords([item], '命中词');
	assert.equal(results.length, 1);
	assert.match(results[0]!.snippet, /…….*命中词.*……/);
});

test('random review uses equal index selection without changing records', () => {
	const records = [
		record('day', '2026-09-08', '## 今日日记\n一'),
		record('day', '2026-09-09', '## 今日日记\n二'),
		record('day', '2026-09-10', '## 今日日记\n三'),
	];
	assert.equal(randomReviewRecord(records, () => 0)?.period, '2026-09-08');
	assert.equal(randomReviewRecord(records, () => 0.5)?.period, '2026-09-09');
	assert.equal(randomReviewRecord(records, () => 0.999)?.period, '2026-09-10');
	assert.equal(randomReviewRecord([], () => 0), undefined);
});

test('random review excludes empty template placeholders', () => {
	const empty = record('week', '2026-W36', '## 本周完成\n\n## 本周感受\n');
	const written = record('week', '2026-W37', '## 本周感受\n真正写下的内容');
	assert.equal(randomReviewRecord([empty, written], () => 0)?.period, '2026-W37');
	assert.equal(randomReviewRecord([empty], () => 0), undefined);
});

test('past today uses selected day month/day and excludes the reference year', () => {
	const records = [record('day', '2026-09-10'), record('day', '2025-09-10'), record('day', '2024-09-10'), record('day', '2025-09-11')];
	assert.deepEqual(pastTodayReviewRecords(records, new Date(2026, 8, 10, 12)).map(item => item.period), ['2025-09-10', '2024-09-10']);
});

test('past today ignores weekly monthly and yearly records', () => {
	const records = [record('week', '2025-W37'), record('month', '2025-09'), record('year', '2025')];
	assert.deepEqual(pastTodayReviewRecords(records, new Date(2026, 8, 10, 12)), []);
});

test('past today matches leap day exactly', () => {
	const records = [record('day', '2024-02-29'), record('day', '2023-02-28')];
	assert.deepEqual(pastTodayReviewRecords(records, new Date(2028, 1, 29, 12)).map(item => item.period), ['2024-02-29']);
});

test('past today reference follows day focus and otherwise uses real today', () => {
	assert.equal(pastTodayReference({ kind: 'day', date: '2024-02-29' }, new Date(2026, 8, 11)).getDate(), 29);
	assert.equal(pastTodayReference({ kind: 'month', year: 2025, month: 2 }, new Date(2026, 8, 11)).getDate(), 11);
});

test('opening a review record maps all four kinds back to the shared TimeFocus', () => {
	const state = { visible: { year: 2026, month: 9 }, focus: { kind: 'day', date: '2026-09-11' } as const };
	assert.equal(timeStateForReviewRecord(state, record('day', '2025-09-10')).focus.kind, 'day');
	assert.equal(timeStateForReviewRecord(state, record('week', '2025-W37')).focus.kind, 'week');
	assert.equal(timeStateForReviewRecord(state, record('month', '2025-09')).focus.kind, 'month');
	assert.equal(timeStateForReviewRecord(state, record('year', '2025')).focus.kind, 'year');
});

test('record labels stay compact and truthful in result lists', () => {
	assert.equal(reviewRecordTimeLabel(record('day', '2026-09-10'), true), '09.10');
	assert.equal(reviewRecordTimeLabel(record('week', '2026-W37')), '2026-W37');
	assert.equal(reviewRecordTimeLabel(record('month', '2026-09')), '2026 年 9 月');
	assert.equal(reviewRecordTimeLabel(record('year', '2026')), '2026 年');
});
