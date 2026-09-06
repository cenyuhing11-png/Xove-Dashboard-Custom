import test from 'node:test';
import assert from 'node:assert/strict';
import { ensurePlan, isoWeek, planInfo, planTemplate, readPlan, readSection } from './planning.ts';
import type { PlanFiles, PlanPeriod } from './planning.ts';

const date = new Date(2026, 8, 6, 23, 59);
for (const [period, path] of Object.entries({
	year: '年度/2026 年度计划', quarter: '季度/2026-Q3 季度计划', month: '月度/2026-09 月度计划', week: '周计划/2026-W36 周计划',
})) test(`${period} local plan path`, () => assert.equal(planInfo(period as PlanPeriod, date).path, `05-计划/${path}.md`));

test('ISO week-year boundaries', () => {
	assert.deepEqual(isoWeek(new Date(2021, 0, 1)), { year: 2020, week: 53 });
	assert.deepEqual(isoWeek(new Date(2018, 11, 31)), { year: 2019, week: 1 });
	assert.equal(planInfo('week', new Date(2021, 0, 4)).key, '2021-W01');
});
test('all twelve quarter calculations', () => {
	for (let month = 0; month < 12; month++) assert.equal(planInfo('quarter', new Date(2026, month, 1)).key, `2026-Q${Math.floor(month / 3) + 1}`);
});
test('local midnight stays on the local date', () => {
	assert.equal(planInfo('month', new Date(2026, 8, 1, 0, 1)).key, '2026-09');
	assert.equal(planInfo('week', new Date(2026, 8, 7, 0, 1)).key, '2026-W37');
});
test('section reads dash and star lists, stops at H2', () => {
	assert.deepEqual(readSection('## 本周重点\n- 一\n* 二\n## 备注\n- 不读取', '本周重点').items, ['一', '二']);
});
test('H3 stays inside section, H1 ends it', () => {
	assert.deepEqual(readSection('## 目标\n- 一\n### 分组\n- 二\n# 结束\n- 三', '目标').items, ['一', '二']);
});
test('empty section and empty placeholders', () => {
	assert.deepEqual(readSection('## 目标\n- \n* \n- [ ]\n- [x] ', '目标'), { found: true, items: [], content: [] });
});
test('missing section is explicit', () => {
	assert.deepEqual(readSection('## 其它\n- 一', '目标'), { found: false, items: [], content: [] });
});
test('checkbox markers and inline Markdown become text', () => {
	assert.deepEqual(readSection('## 目标\n- [ ] **学习**\n* [x] [[笔记|读书]]\n- [X] [资料](https://example.com)\n- `练习`', '目标').items, ['学习', '读书', '资料', '练习']);
});
test('frontmatter and fenced code headings are ignored', () => {
	const md = '---\n说明: |\n  ## 目标\n  - 假\n---\n~~~md\n## 目标\n- 假\n~~~\n## 目标\n- 真\n```\n## 其它\n- 假\n```\n- 继续';
	assert.deepEqual(readSection(md, '目标').items, ['真', '继续']);
});
test('CRLF, BOM and closing heading hashes', () => {
	assert.deepEqual(readSection('\uFEFF## 目标 ##\r\n- 一', '目标').items, ['一']);
});
test('malformed frontmatter and fences do not throw', () => {
	assert.equal(readSection('---\n## 目标\n- 一', '目标').found, false);
	assert.deepEqual(readSection('## 目标\n```\n- 一', '目标').items, []);
});

function memoryFiles() {
	const contents = new Map<string, string>();
	const folders = new Set<string>();
	let writes = 0;
	const files: PlanFiles = {
		kind: (path) => contents.has(path) ? 'file' : folders.has(path) ? 'folder' : undefined,
		read: async (path) => { if (!contents.has(path)) throw new Error('missing'); return contents.get(path)!; },
		createFolder: async (path) => { if (folders.has(path) || contents.has(path)) throw new Error('exists'); folders.add(path); },
		create: async (path, text) => { if (contents.has(path) || folders.has(path)) throw new Error('exists'); contents.set(path, text); writes++; },
	};
	return { contents, folders, files, writes: () => writes };
}
test('existing file never overwritten', async () => {
	const store = memoryFiles();
	const path = planInfo('week', date).path;
	store.contents.set(path, '用户内容');
	assert.equal(await ensurePlan(store.files, 'week', date), path);
	assert.equal(store.contents.get(path), '用户内容');
	assert.equal(store.writes(), 0);
});
for (const period of ['year', 'quarter', 'month', 'week'] as PlanPeriod[]) test(`${period} missing file creates exact template, idempotently`, async () => {
	const store = memoryFiles();
	const path = await ensurePlan(store.files, period, date);
	assert.equal(store.contents.get(path), planTemplate(period, date));
	assert.ok(store.folders.has(planInfo(period, date).folder));
	await ensurePlan(store.files, period, date);
	assert.equal(store.writes(), 1);
	assert.deepEqual((await readPlan(store.files, period, date)).entries, []);
});
test('template properties and parent links', () => {
	assert.match(planTemplate('year', date), /类型: 计划\n周期: 年度\n期间: 2026\n状态: 进行中/);
	assert.doesNotMatch(planTemplate('year', date), /上级计划/);
	assert.match(planTemplate('quarter', date), /上级计划: "\[\[2026 年度计划\]\]"/);
	assert.match(planTemplate('month', date), /上级计划: "\[\[2026-Q3 季度计划\]\]"/);
	assert.match(planTemplate('week', date), /上级计划: "\[\[2026-09 月度计划\]\]"/);
});
test('concurrent create only writes once', async () => {
	const store = memoryFiles();
	await Promise.all([ensurePlan(store.files, 'week', date), ensurePlan(store.files, 'week', date)]);
	assert.equal(store.writes(), 1);
});
test('folder/file conflicts and permission errors are not overwritten', async () => {
	const store = memoryFiles();
	store.contents.set('05-计划', '保留');
	await assert.rejects(ensurePlan(store.files, 'week', date));
	assert.equal(store.contents.get('05-计划'), '保留');
	const other = memoryFiles();
	other.files.create = async () => { throw new Error('permission'); };
	await assert.rejects(ensurePlan(other.files, 'week', date), /permission/);
});
test('read missing plan and read failure have different states', async () => {
	const store = memoryFiles();
	assert.equal((await readPlan(store.files, 'week', date)).exists, false);
	store.contents.set(planInfo('week', date).path, '');
	store.files.read = async () => { throw new Error('unavailable'); };
	assert.ok((await readPlan(store.files, 'week', date)).error);
});
test('week/month summaries are limited to three, annual to one', async () => {
	const store = memoryFiles();
	for (const [period, title] of [['week', '本周重点'], ['month', '本月重点'], ['year', '年度核心突破']] as const) {
		store.contents.set(planInfo(period, date).path, `## ${title}\n- 一\n- 二\n- 三\n- 四`);
		assert.equal((await readPlan(store.files, period, date)).entries.length, period === 'year' ? 1 : 3);
	}
});
test('quarter theme supports prose and falls back to focus', async () => {
	const store = memoryFiles();
	const path = planInfo('quarter', date).path;
	store.contents.set(path, '## 当前季度主题\n主题正文\n## 季度重点\n- 重点');
	assert.deepEqual((await readPlan(store.files, 'quarter', date)).entries, ['主题正文']);
	store.contents.set(path, '## 当前季度主题\n- \n## 季度重点\n- 重点');
	assert.deepEqual((await readPlan(store.files, 'quarter', date)).entries, ['重点']);
});
