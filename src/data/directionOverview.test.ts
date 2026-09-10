import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { directionOverviewModel, directionSectionMarkdown } from './directionOverview.ts';
import type { LongTermPlan } from './longTermPlans';
import { longTermPlanListMetadata } from './longTermPlans.ts';
import type { Process } from './processes';

const directionView = readFileSync(new URL('../views/DirectionView.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../views/DashboardView.ts', import.meta.url), 'utf8');
const planView = readFileSync(new URL('../views/PlanView.ts', import.meta.url), 'utf8');
const planRow = readFileSync(new URL('../views/LongTermPlanRow.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

function plan(name: string, directions: string[]): LongTermPlan {
	return { id: name, path: `05-计划/07-长期计划/${name}.md`, name, status: '进行中', startMonth: '2026-09', endMonth: '2027-02', directions, createdDate: '2026-09-10', why: '', desiredState: '', completionCriteria: '', goal: '', stages: [] };
}
function process(name: string, direction: string, category: 'learning' | 'creation', status: Process['status'], longTermPlanId = ''): Process {
	return { id: name, name, processType: category === 'learning' ? 'learning' : 'creation', category, contentType: category === 'learning' ? 'course' : 'knowledge', status, rawStatus: status, direction, sourceFile: `${category}/${name}.md`, ...(longTermPlanId ? { longTermPlanId } : {}), taskTotal: 0, taskCompleted: 0, taskPending: 0, progress: null };
}
const markdown = '---\n类型: 人生方向\n---\n\n## 这条方向对我意味着什么\n\n**保持判断力**\n\n## 长期能力\n\n- 商业视觉\n- 3D 产品视觉\n\n## 当前阶段\n\n保留';
const plans = [plan('多方向', ['设计', 'AI', '3D']), plan('英语计划', ['英语'])];
const items = [
	process('设计学习', '设计', 'learning', '进行中', '多方向'),
	process('设计创作', '设计', 'creation', '暂停', '多方向'),
	process('设计完成', '设计', 'learning', '已完成', '多方向'),
	process('设计归档', '设计', 'learning', '归档'),
	process('设计成果', '设计', 'creation', '已完成'),
	process('AI学习', 'AI', 'learning', '计划中', '多方向'),
];
const overview = () => directionOverviewModel('设计', markdown, plans, items);

test('legal direction builds an overview model', () => assert.equal(overview().direction, '设计'));
test('tier comes from LIFE_COMPASS', () => assert.equal(overview().tier, '主攻'));
test('abilities come from the direction Markdown section', () => assert.deepEqual(overview().abilities, ['商业视觉', '3D 产品视觉']));
test('ability count is the actual effective item count', () => assert.equal(overview().abilities.length, 2));
test('long-term plan appears when its direction array includes current direction', () => assert.deepEqual(overview().longTermPlans.map(p => p.name), ['多方向']));
test('long-term plan is excluded when directions do not include current direction', () => assert.equal(overview().longTermPlans.some(p => p.name === '英语计划'), false));
test('one multi-direction plan can appear on 设计', () => assert.equal(directionOverviewModel('设计', markdown, plans, []).longTermPlans.length, 1));
test('one multi-direction plan can appear on AI', () => assert.equal(directionOverviewModel('AI', '', plans, []).longTermPlans.length, 1));
test('one multi-direction plan can appear on 3D', () => assert.equal(directionOverviewModel('3D', '', plans, []).longTermPlans.length, 1));
test('long-term summary renderer never expands stages or linked processes', () => assert.doesNotMatch(planRow, /processRefs|renderProcessRow|阶段安排/));
test('shared long-term row keeps the established metadata formatter', () => assert.match(planRow, /longTermPlanListMetadata\(plan\)/));
test('shared long-term row metadata remains direction date duration status', () => assert.equal(longTermPlanListMetadata(plans[0]!), '设计 / AI / 3D · 2026.09 — 2027.02 · 6个月 · 进行中'));
test('direction long-term row routes to internal long-term detail callback', () => assert.match(directionView, /openLongTermPlan\(plan\.id\)/));
test('active process direction must exactly match current direction', () => assert.equal(overview().activeProcesses.some(p => p.name === 'AI学习'), false));
test('long-term directions never broaden process direction ownership', () => assert.equal(overview().activeProcesses.filter(p => p.longTermPlanId === '多方向').length, 2));
test('active learning process is included', () => assert.equal(overview().activeProcesses.some(p => p.name === '设计学习'), true));
test('active creation process is included', () => assert.equal(overview().activeProcesses.some(p => p.name === '设计创作'), true));
test('planned process is included in current processes', () => assert.equal(directionOverviewModel('AI', '', plans, items).activeProcesses.some(p => p.name === 'AI学习'), true));
test('paused process is included in current processes', () => assert.equal(overview().activeProcesses.some(p => p.status === '暂停'), true));
test('completed process is excluded from current processes', () => assert.equal(overview().activeProcesses.some(p => p.status === '已完成'), false));
test('archived process is excluded from current processes', () => assert.equal(overview().activeProcesses.some(p => p.status === '归档'), false));
test('direction process UI reuses shared ProcessRow', () => assert.match(directionView, /renderProcessRow\(parent/));
test('zero-task process never gets a progress field', () => assert.match(directionView, /process\.taskTotal > 0/));
test('completed learning in current direction enters learning history', () => assert.equal(overview().learningHistory.some(p => p.name === '设计完成'), true));
test('archived learning in current direction enters learning history', () => assert.equal(overview().learningHistory.some(p => p.name === '设计归档'), true));
test('active learning does not enter learning history', () => assert.equal(overview().learningHistory.some(p => p.name === '设计学习'), false));
test('completed creation does not enter learning history', () => assert.equal(overview().learningHistory.some(p => p.name === '设计成果'), false));
test('learning from another direction does not enter learning history', () => assert.equal(overview().learningHistory.some(p => p.name === 'AI学习'), false));
test('long-term relation does not affect learning-history direction ownership', () => assert.equal(overview().learningHistory.some(p => p.name === '设计完成'), true));
test('one source cannot appear in both active and learning-history lists', () => { const a = new Set(overview().activeProcesses.map(p => p.sourceFile)); assert.equal(overview().learningHistory.some(p => a.has(p.sourceFile)), false); });
test('learning history overview is capped at five rows', () => { const many = Array.from({ length: 7 }, (_, i) => process(`完成${i}`, '设计', 'learning', '已完成')); assert.equal(directionOverviewModel('设计', '', [], many).recentLearningHistory.length, 5); });
test('learning history prefers source mtime and keeps path as a stable fallback', () => {
	const older = process('较早', '设计', 'learning', '已完成');
	const newer = process('较新', '设计', 'learning', '归档');
	const times = new Map([[older.sourceFile, 1], [newer.sourceFile, 2]]);
	assert.deepEqual(directionOverviewModel('设计', '', [], [older, newer], path => times.get(path) ?? 0).learningHistory.map(item => item.name), ['较新', '较早']);
});
test('header ability count and section share one model array', () => assert.equal(overview().abilities.length, 2));
test('header long-term count and section share one model array', () => assert.equal(overview().longTermPlans.length, 1));
test('header active-process count and section share one model array', () => assert.equal(overview().activeProcesses.length, 2));
test('header learning-history count includes the full list, not only recent five', () => { const many = Array.from({ length: 7 }, (_, i) => process(`完成${i}`, '设计', 'learning', '已完成')); const model = directionOverviewModel('设计', '', [], many); assert.equal(model.learningHistory.length, 7); assert.equal(model.recentLearningHistory.length, 5); });
test('direction narrative reads its original raw Markdown section', () => assert.equal(overview().narrative, '**保持判断力**'));
test('direction narrative parser ignores fenced near-headings', () => assert.equal(directionSectionMarkdown('## 这条方向对我意味着什么\n```md\n## 假标题\n```\n正文\n## 长期能力', '这条方向对我意味着什么'), '```md\n## 假标题\n```\n正文'));
test('missing direction narrative section is safe', () => assert.equal(directionSectionMarkdown('## 长期能力\n- A', '这条方向对我意味着什么'), ''));
test('narrative disclosure starts folded', () => assert.match(directionView, /narrativeBody\.hidden = !expanded/));
test('narrative title and chevron share the same local toggle', () => assert.match(directionView, /narrativeTitle\.onclick = toggleNarrative; narrativeToggle\.onclick = toggleNarrative/));
test('narrative menu stops propagation and edits the source note', () => assert.match(directionView, /narrativeMenu\.onclick = event => \{ event\.stopPropagation\(\)/));
test('direction edit action still opens source Markdown explicitly', () => { assert.match(directionView, /编辑方向笔记/); assert.match(directionView, /openLearningFile\(this\.app, path\)/); });
test('direction switching reruns the shared overview calculation', () => assert.match(directionView, /directionOverviewModel\(info\.name, markdown, longTermPlans, allProcesses,/));
test('direction detail uses long-term detail visual primitives', () => { for (const cls of ['po-topbar', 'mx-long-term-summary', 'mx-long-term-detail-content', 'mx-long-term-narrative', 'mx-long-term-stages']) assert.ok(directionView.includes(cls)); });
test('direction overview does not add statistics cards or a new hero', () => assert.doesNotMatch(directionView, /mx-direction-stat|stat-card|direction-hero/));
test('Workbench direction route still does not create a leaf or remount shell', () => { const route = dashboard.match(/async setSection\(section: WorkbenchSection\)[\s\S]*?private async renderDirectionSection/)?.[0] ?? ''; assert.doesNotMatch(route, /getLeaf|new WorkbenchShell/); });
test('legacy DIRECTION_VIEW remains registered only as compatibility', () => { assert.equal(main.match(/registerView\(DIRECTION_VIEW/g)?.length, 1); assert.match(main, /new DirectionView\(leaf, this\)/); });
test('direction overview CSS reuses the established 720px responsive ProcessRow', () => { assert.match(css, /@container \(max-width: 720px\)/); assert.match(css, /\.mx-process-row--inline/); });
test('direction overview does not modify long-term or process ownership fields', () => { assert.doesNotMatch(directionView, /updateLongTermPlanDirections|setProcessLongTermPlan|关联长期计划ID|方向\s*:/); assert.match(planView, /updateLongTermPlanDirections/); });
