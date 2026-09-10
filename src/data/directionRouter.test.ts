import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIFE_COMPASS } from '../components/workbench/config.ts';
import { directionInfo } from './compass.ts';

const dashboard = readFileSync(new URL('../views/DashboardView.ts', import.meta.url), 'utf8');
const directionView = readFileSync(new URL('../views/DirectionView.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const plan = readFileSync(new URL('../views/PlanView.ts', import.meta.url), 'utf8');
const project = readFileSync(new URL('../views/ProjectView.ts', import.meta.url), 'utf8');
const longTermModal = readFileSync(new URL('../views/LongTermPlanDirectionModal.ts', import.meta.url), 'utf8');
const processModal = readFileSync(new URL('../views/UnifiedProcessModal.ts', import.meta.url), 'utf8');

function method(source: string, name: string): string {
	return source.match(new RegExp(`(?:async )?${name}\\([^]*?\\n\\t}`))?.[0] ?? '';
}
const openDirection = method(dashboard, 'openDirection');
const router = dashboard.match(/async setSection\(section: WorkbenchSection\)[\s\S]*?\n\t}\n\n\tprivate async renderDirectionSection/)?.[0] ?? '';

test('LifeCompass click invokes the Dashboard internal direction route', () => assert.match(dashboard, /renderLifeCompass\(this\.dashboardEl, name => \{ void this\.openDirection\(name\); \}\)/));
test('normal direction navigation no longer imports the standalone Markdown-tab opener', () => assert.doesNotMatch(dashboard, /import \{ openDirection \}/));
test('direction navigation never opens a file or standalone view', () => assert.doesNotMatch(openDirection, /openFile|openLinkText|setViewState|getLeaf/));
test('direction navigation does not create a new leaf or tab', () => assert.doesNotMatch(openDirection, /getLeaf|openLeafInNewTab/));
test('WorkbenchShell remains constructed exactly once', () => assert.equal(dashboard.match(/new WorkbenchShell\(/g)?.length, 1));
test('direction uses one route and one selectedDirection parameter', () => {
	assert.match(dashboard, /currentSection: WorkbenchSection = 'home'/);
	assert.match(dashboard, /selectedDirection: string \| null = null/);
	assert.match(router, /section === 'direction'/);
});
test('the ten directions are not expanded into ten route keys', () => {
	for (const name of LIFE_COMPASS.flatMap(lane => lane.items)) assert.doesNotMatch(dashboard, new RegExp(`direction[:/-]${name}`));
});
test('direction parameter reaches the shared detail renderer', () => assert.match(dashboard, /directionRenderer\.render\(this\.boardEl, this\.selectedDirection\)/));
test('设计 and AI are both legal values from the same compass source', () => {
	assert.equal(directionInfo('设计').name, '设计'); assert.equal(directionInfo('AI').name, 'AI');
});
test('all valid direction names come from LIFE_COMPASS', () => assert.deepEqual(LIFE_COMPASS.flatMap(lane => lane.items), ['设计', 'AI', '3D', '英语', '自媒体', '阅读', '绘画', '摄影', '理财', '生活']));
test('invalid direction is rejected before ensure and falls back safely', () => {
	assert.throws(() => directionInfo('foo'), /未知人生方向/);
	assert.ok(openDirection.indexOf('directionInfo(name)') < openDirection.indexOf('ensureDirection('));
	assert.match(openDirection, /setSection\('home'\)/);
});
test('valid missing direction note is ensured before entering the route', () => {
	assert.ok(openDirection.indexOf('ensureDirection(') < openDirection.indexOf("setSection('direction')"));
});
test('ensure completion enters direction route rather than opening Markdown', () => {
	assert.match(openDirection, /await this\.setSection\('direction'\)/);
	assert.doesNotMatch(openDirection, /openLearningFile|openFile/);
});
test('existing direction notes reuse the idempotent ensure implementation', () => assert.match(openDirection, /ensureDirection\(learningFiles\(this\.app\), info\.name\)/));
test('legacy direction content is extracted into one shared renderer', () => {
	assert.match(directionView, /export class DirectionDetailRenderer/);
	assert.match(directionView, /this\.renderer\.render\(this\.contentEl, this\.direction\)/);
	assert.match(dashboard, /new DirectionDetailRenderer\(this\.app\)/);
});
test('explicit edit direction note still opens the real source Markdown', () => assert.match(directionView, /编辑方向笔记 →[\s\S]*openLearningFile\(this\.app, info\.path\)/));
test('switching direction cancels stale rendering without rebuilding shell', () => {
	assert.match(router, /previous === 'direction'\) this\.directionRenderer\.cancel\(\)/);
	assert.doesNotMatch(router, /new WorkbenchShell|renderLifeCompass|containerEl\.empty/);
});
test('home timeTrace process and inbox navigation remain unchanged', () => {
	for (const pair of [["'home'", "setSection('home')"], ["'plan'", "setSection('timeTrace')"], ["'all'", "setSection('process')"], ["'opportunity'", "setSection('inbox')"]]) assert.ok(dashboard.includes(`action === ${pair[0]}) await this.${pair[1]}`));
});
test('legacy plan and project compass hosts route into the main workbench', () => {
	assert.match(plan, /openWorkbenchDirection\(name, this\.leaf\)/);
	assert.match(project, /openWorkbenchDirection\(name, this\.leaf\)/);
	assert.match(main, /async openWorkbenchDirection\(name: string, sourceLeaf\?: WorkspaceLeaf\)/);
});
test('no new Obsidian direction view type is registered', () => {
	assert.equal(main.match(/registerView\(DIRECTION_VIEW/g)?.length, 1);
	assert.doesNotMatch(main, /xove-direction-view|workbench-direction-view/);
});
test('long-term multi-direction and process single-direction controls remain intact', () => {
	assert.match(longTermModal, /projectDirections\(\)/);
	assert.match(processModal, /const direction = [^\n]*createEl\('select'/);
	assert.doesNotMatch(processModal, /LongTermPlanDirectionModal/);
});
test('direction route source contains no settings data file access', () => assert.doesNotMatch(openDirection + router, /data\.json|workspace\.json/));
