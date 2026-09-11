import test from 'node:test';
import assert from 'node:assert/strict';
import { ensurePlan, existingPlanPath, isoWeek, legacyPlanInfo, planInfo, planPaths, planTemplate, readPlan, readSection } from './planning.ts';
import type { PlanFiles, PlanPeriod } from './planning.ts';

const date = new Date(2026, 8, 6, 23, 59);
for (const [period, path] of Object.entries({
	year: '02-年计划/2026 年计划', quarter: '03-季计划/2026-Q3 季计划', month: '04-月计划/2026-09 月计划', week: '05-周计划/2026-W36 周计划',
})) test(`${period} local plan path`, () => assert.equal(planInfo(period as PlanPeriod, date).path, `05-计划/${path}.md`));

test('legacy plan paths remain explicitly available for fallback reads', () => {
	assert.equal(legacyPlanInfo('year', date).path, '05-计划/02-年度/2026 年度计划.md');
	assert.equal(legacyPlanInfo('quarter', date).path, '05-计划/03-季度/2026-Q3 季度计划.md');
	assert.equal(legacyPlanInfo('month', date).path, '05-计划/04-月度/2026-09 月度计划.md');
	assert.equal(legacyPlanInfo('week', date).path, '05-计划/05-周计划/2026-W36 周计划.md');
});

test('plan path candidates put canonical first and do not duplicate identical week paths', () => {
	assert.deepEqual(planPaths('year', date), ['05-计划/02-年计划/2026 年计划.md', '05-计划/02-年度/2026 年度计划.md']);
	assert.deepEqual(planPaths('quarter', date), ['05-计划/03-季计划/2026-Q3 季计划.md', '05-计划/03-季度/2026-Q3 季度计划.md']);
	assert.deepEqual(planPaths('month', date), ['05-计划/04-月计划/2026-09 月计划.md', '05-计划/04-月度/2026-09 月度计划.md']);
	assert.deepEqual(planPaths('week', date), ['05-计划/05-周计划/2026-W36 周计划.md']);
});

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
	assert.match(planTemplate('quarter', date), /上级计划: "\[\[2026 年计划\]\]"/);
	assert.match(planTemplate('month', date), /上级计划: "\[\[2026-Q3 季计划\]\]"/);
	assert.match(planTemplate('week', date), /上级计划: "\[\[2026-09 月计划\]\]"/);
});

test('all period plan templates use the settled headings and no task checkbox syntax', () => {
	const expected: Record<PlanPeriod, string[]> = {
		week: ['这周我想推进什么', '本周重点', '这周我不准备做什么', '周末希望看到的变化'],
		month: ['这个月我想达到什么状态', '本月重点', '这个月我不准备做什么', '月底希望看到的变化'],
		quarter: ['这个季度我想达到什么状态', '当前季度主题', '季度重点', '这个季度我不准备做什么', '季末希望看到的变化'],
		year: ['这一年我想达到什么状态', '今年最想实现的突破', '这一年我不准备做什么', '年底希望看到的变化'],
	};
	for (const period of ['week', 'month', 'quarter', 'year'] as PlanPeriod[]) {
		const markdown = planTemplate(period, date);
		assert.deepEqual((markdown.match(/^## .+$/gm) ?? []).map(line => line.slice(3)), expected[period]);
		assert.doesNotMatch(markdown, /- \[[ x]\]/);
	}
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
	for (const [period, title] of [['week', '本周重点'], ['month', '本月重点'], ['year', '今年最想实现的突破']] as const) {
		store.contents.set(planInfo(period, date).path, `## ${title}\n- 一\n- 二\n- 三\n- 四`);
		assert.equal((await readPlan(store.files, period, date)).entries.length, period === 'year' ? 1 : 3);
	}
});
test('legacy annual heading remains a fallback when the new heading is empty', async () => {
	const store = memoryFiles();
	store.contents.set(planInfo('year', date).path, '## 今年最想实现的突破\n\n## 年度核心突破\n- 旧标题内容');
	assert.deepEqual((await readPlan(store.files, 'year', date)).entries, ['旧标题内容']);
});
test('legacy plan files stay readable without creating a canonical duplicate', async () => {
	for (const period of ['year', 'quarter', 'month', 'week'] as PlanPeriod[]) {
		const store = memoryFiles();
		const legacy = legacyPlanInfo(period, date).path;
		store.contents.set(legacy, '用户旧计划');
		assert.equal(await ensurePlan(store.files, period, date), legacy);
		assert.equal(store.writes(), 0);
		assert.equal(store.contents.has(planInfo(period, date).path), planInfo(period, date).path === legacy);
	}
});
test('canonical plan wins when canonical and legacy both exist', async () => {
	const store = memoryFiles();
	const canonical = planInfo('month', date).path;
	const legacy = legacyPlanInfo('month', date).path;
	store.contents.set(canonical, '## 本月重点\n- 新');
	store.contents.set(legacy, '## 本月重点\n- 旧');
	assert.equal(existingPlanPath(store.files, 'month', date), canonical);
	assert.deepEqual((await readPlan(store.files, 'month', date)).entries, ['新']);
});
test('quarter theme supports prose and falls back to focus', async () => {
	const store = memoryFiles();
	const path = planInfo('quarter', date).path;
	store.contents.set(path, '## 当前季度主题\n主题正文\n## 季度重点\n- 重点');
	assert.deepEqual((await readPlan(store.files, 'quarter', date)).entries, ['主题正文']);
	store.contents.set(path, '## 当前季度主题\n- \n## 季度重点\n- 重点');
	assert.deepEqual((await readPlan(store.files, 'quarter', date)).entries, ['重点']);
});
