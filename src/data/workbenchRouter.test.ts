import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../views/DashboardView.ts', import.meta.url), 'utf8');
const plan = readFileSync(new URL('../views/PlanView.ts', import.meta.url), 'utf8');
const project = readFileSync(new URL('../views/ProjectView.ts', import.meta.url), 'utf8');
const opportunity = readFileSync(new URL('../views/OpportunityBoard.ts', import.meta.url), 'utf8');
const home = readFileSync(new URL('../components/workbench/WorkbenchHome.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/workbench/WorkbenchShell.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

function method(source: string, name: string): string {
	return source.match(new RegExp(`(?:async )?${name}\\([^]*?\\n\\t}`))?.[0] ?? '';
}
const router = dashboard.match(/async setSection\(section: WorkbenchSection\)[\s\S]*?\n\t}\n\n\tprivate async showDashboard/)?.[0] ?? '';

test('DashboardView remains the one main workbench view', () => {
	assert.match(dashboard, /export class DashboardView extends ItemView/);
	assert.match(dashboard, /getViewType\(\): string \{ return VIEW_TYPE; \}/);
});
test('main workbench title stays stable', () => assert.match(dashboard, /getDisplayText\(\): string \{ return '夏知之 · 梦序'; \}/));
test('router exposes the four primary sections plus one parameterized direction route', () => assert.match(dashboard, /WorkbenchSection = 'home' \| 'timeTrace' \| 'process' \| 'inbox' \| 'direction'/));
test('home action routes inside the main view', () => assert.match(dashboard, /action === 'home'\) await this\.setSection\('home'\)/));
test('time trace action routes inside the main view', () => assert.match(dashboard, /action === 'plan'\) await this\.setSection\('timeTrace'\)/));
test('process action routes inside the main view', () => assert.match(dashboard, /action === 'all'\) await this\.setSection\('process'\)/));
test('inbox action routes inside the main view', () => assert.match(dashboard, /action === 'opportunity'\) await this\.setSection\('inbox'\)/));
test('primary navigation never targets legacy plan or project view states', () => {
	const navigation = method(main, 'navigateWorkbench');
	assert.doesNotMatch(navigation, /setViewState\(\{ type: PLAN_VIEW/);
	assert.doesNotMatch(navigation, /setViewState\(\{ type: PROJECT_VIEW/);
});
test('primary navigation reuses an existing DashboardView leaf', () => assert.match(method(main, 'navigateWorkbench'), /sourceLeaf\?\.view instanceof DashboardView/));
test('router itself never asks for a new tab leaf', () => assert.doesNotMatch(router, /getLeaf\(|setViewState|openLeafInNewTab/));
test('WorkbenchShell is constructed once by DashboardView on open', () => assert.equal(dashboard.match(/new WorkbenchShell\(/g)?.length, 1));
test('LifeCompass is constructed once by DashboardView on open', () => assert.equal(dashboard.match(/renderLifeCompass\(/g)?.length, 1));
test('home renderer no longer owns a second compass', () => assert.doesNotMatch(home, /renderLifeCompass/));
test('active navigation derives from the current route', () => assert.match(router, /section === 'timeTrace' \? 'plan' : section === 'process' \? 'all' : section === 'inbox' \? 'opportunity' : 'home'/));
test('time trace uses the shared PlanWorkspaceRenderer', () => {
	assert.match(dashboard, /new PlanWorkspaceRenderer\(this\.app, plugin,/);
	assert.match(plan, /export class PlanWorkspaceRenderer extends Component/);
});
test('long-term planning remains an internal time-trace mode and deep links reuse the main workbench', () => {
	assert.match(plan, /mode === 'longTermPlan'/); assert.match(dashboard, /openLongTermPlan[\s\S]*setSection\('timeTrace'\)/);
	const renderer = plan.match(/export class PlanWorkspaceRenderer[\s\S]*?(?=\nexport class PlanView)/)?.[0] ?? '';
	assert.ok(renderer); assert.doesNotMatch(renderer, /LONG_TERM_PLAN_VIEW|setViewState/);
});
test('legacy PlanView delegates to the shared renderer', () => {
	assert.match(plan, /export class PlanView extends ItemView/);
	assert.match(plan, /this\.renderer = new PlanWorkspaceRenderer/);
	assert.match(plan, /this\.renderer\.activate/);
});
test('process section reuses the original ProjectBoard renderer', () => assert.match(router, /new ProjectBoard\(this\.processSource\)/));
test('process section keeps the Mengxu adapter and modern detail callbacks', () => {
	assert.match(router, /processBoardItems\(processes\(scanLearning/);
	assert.match(router, /openProcess\(this\.app, item\.process\)/);
});
test('inbox section reuses OpportunityBoard', () => assert.match(router, /this\.oppBoard\.show\(true\)/));
test('section exit disposes observers previews and timers', () => {
	assert.match(router, /planRenderer\.deactivate\(\)/);
	assert.match(router, /processBoard\?\.dispose\(\)/);
	assert.match(router, /oppBoard\.dispose\(\)/);
});
test('time trace listeners attach once per activation and are released', () => {
	assert.match(plan, /if \(this\.sectionDisposers\.length\) return/);
	assert.match(plan, /for \(const dispose of this\.sectionDisposers\.splice\(0\)\) dispose\(\)/);
});
test('time trace state survives renderer deactivation', () => {
	const deactivate = method(plan, 'deactivate');
	assert.doesNotMatch(deactivate, /selectedYear\s*=|selectedMonth\s*=|mode\s*=|calendarMode\s*=/);
});
test('per-section scroll positions are saved and restored', () => {
	assert.match(router, /sectionScroll\.set\(previous, this\.contentEl\.scrollTop\)/);
	assert.match(router, /sectionScroll\.get\(section\) \?\? 0/);
});
test('legacy PLAN_VIEW stays registered for workspace compatibility', () => {
	assert.match(plan, /PLAN_VIEW = 'xove-dashboard-custom-plan-workspace'/);
	assert.match(main, /registerView\(PLAN_VIEW/);
});
test('legacy ProjectView stays registered for details and workspace compatibility', () => {
	assert.match(project, /PROJECT_VIEW = 'xove-dashboard-custom-projects'/);
	assert.match(main, /registerView\(PROJECT_VIEW/);
});
test('specific Markdown navigation still uses openFile', () => {
	assert.match(plan, /getLeaf\('tab'\)\.openFile\(file\)/);
	assert.match(project, /openLearningFile\(this\.app, project\.path\)/);
});
test('time trace and process retain the shared 720px responsive threshold', () => {
	assert.match(css, /@container \(max-width: 720px\)[\s\S]*\.mx-plan-container/);
	assert.match(css, /@container \(max-width: 720px\)[\s\S]*\.mx-project-overview \.po-container/);
});
test('neutral shared checkbox styling remains unchanged', () => {
	assert.match(css, /input\.mx-embedded-task-check:checked \+ \.mx-embedded-task-check-visual/);
	assert.doesNotMatch(css, /\.mx-embedded-task-check[^}]*interactive-accent/);
});
test('OpportunityBoard can preserve its local filters across router switches', () => {
	assert.match(opportunity, /async show\(preserveState = false\)/);
	assert.match(opportunity, /if \(!preserveState\)/);
});
test('router changes only the main board container, never the shell root', () => {
	assert.match(router, /this\.boardEl\.empty\(\)/);
	assert.doesNotMatch(router, /dashboardEl\.empty|containerEl\.empty|new WorkbenchShell|renderLifeCompass/);
});
test('data file names never enter unified router source', () => assert.doesNotMatch(router, /data\.json|workspace\.json/));
