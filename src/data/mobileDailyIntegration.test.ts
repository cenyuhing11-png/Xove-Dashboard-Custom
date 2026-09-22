import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as tasks from './embeddedTasks.ts';
import * as journal from './journal.ts';
import * as planning from './planning.ts';
import * as calendar from './planWorkspace.ts';
import * as time from './timeTrace.ts';
import * as quarters from './quarters.ts';
import * as taskLogic from './taskLogic.ts';
import { QuickJournalService } from './quickJournal.ts';

// Execute production view methods against an in-memory Vault and a small Obsidian DOM adapter.
// No real Vault access, no duplicated task-source/marker/viewport business logic.
class El {
	isConnected = true;
	children: El[] = []; parent?: El; classes = new Set<string>(); attrs: Record<string, string> = {};
	dataset: Record<string, string> = {}; textContent = ''; value = ''; disabled = false;
	listeners = new Map<string, (() => unknown)[]>(); onclick?: (event: any) => unknown;
	style = { values: new Map<string, string>(), setProperty: (key: string, value: string) => this.style.values.set(key, value) };
	createEl(_tag: string, options: any = {}): El { const e = new El(); e.parent = this; e.textContent = options.text ?? ''; e.attrs = { ...options.attr }; e.addClass(options.cls ?? ''); this.children.push(e); return e; }
	createDiv(o: any = {}) { return this.createEl('div', o); }
	createSpan(o: any = {}) { return this.createEl('span', o); }
	addClass(s: string) { s.split(' ').filter(Boolean).forEach(c => this.classes.add(c)); }
	removeClass(s: string) { this.classes.delete(s); }
	toggleClass(s: string, yes: boolean) { if (yes) this.addClass(s); else this.removeClass(s); }
	setAttribute(k: string, v: string) { this.attrs[k] = v; }
	removeAttribute(k: string) { delete this.attrs[k]; }
	addEventListener(k: string, fn: () => unknown) { this.listeners.set(k, [...this.listeners.get(k) ?? [], fn]); }
	async fire(k: string) { for (const fn of this.listeners.get(k) ?? []) await fn(); }
	appendChild(e: El) { if (e.parent) e.parent.children = e.parent.children.filter(c => c !== e); e.parent = this; this.children.push(e); }
	all(): El[] { return this.children.flatMap(c => [c, ...c.all()]); }
	querySelectorAll(s: string) { return this.all().filter(e => e.classes.has(s.slice(1))); }
	querySelector(s: string) { return this.querySelectorAll(s)[0]; }
	closest() { return this; }
	empty() { this.children = []; }
	focus() {}
}
class Base {}
class File {}
class Modal {
	modalEl = new El(); contentEl = new El(); containerEl = new El(); closed = false;
	close() { this.closed = true; (this as any).onClose(); }
}
const phone = new Set(['is-mobile', 'is-phone']);
const viewport = { height: 700, offsetTop: 0, handlers: new Map<string, () => void>(), addEventListener(k: string, fn: () => void) { this.handlers.set(k, fn); }, removeEventListener(k: string) { this.handlers.delete(k); } };
const common: Record<string, any> = { obsidian: { Component: Base, ItemView: Base, TFile: File, TFolder: Base, Modal, Notice: Base }, '../data/embeddedTasks': tasks, '../data/journal': journal, '../data/planning': planning, '../data/planWorkspace': calendar, '../data/timeTrace': time };
function load(path: string, imports: Record<string, any> = {}) {
	const source = readFileSync(new URL(path, import.meta.url), 'utf8');
	const exports: any = {};
	runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, {
		exports, require: (id: string) => imports[id] ?? common[id] ?? {}, console,
		document: { body: { classList: { contains: (c: string) => phone.has(c) } } }, window: { visualViewport: viewport, innerHeight: 800 },
	});
	return exports;
}
const mini = load('../components/timeTrace/TimeTraceMiniCalendar.ts', { '../../data/planWorkspace': calendar, '../../data/timeTrace': time, '../../data/quarters': quarters });
const checkbox = load('../components/tasks/EmbeddedTaskCheckbox.ts');
const plan = load('../views/PlanView.ts', {
 '../components/timeTrace/TimeTraceMiniCalendar': mini,
 '../components/tasks/EmbeddedTaskCheckbox': checkbox,
 '../data/longTermNarrative': { NarrativeDisclosure: class {} },
 '../data/learningVault': { scanLearning: () => [] }, '../data/projectVault': { scanProjects: () => [] },
 '../data/processes': { processes: () => [] },
 './EmbeddedTaskModal': { NewEmbeddedTaskModal: class { constructor(...args: unknown[]) { modalArgs = args; } open() {} } },
});
let modalArgs: unknown[] = [];
function fixture() {
	const notes = new Map<string, string>(), dirs = new Set<string>(); let id = 0;
	const files = { kind: (p: string): 'file' | 'folder' | undefined => notes.has(p) ? 'file' : dirs.has(p) ? 'folder' : undefined, paths: () => [...notes.keys()], read: async (p: string) => notes.get(p)!, createFolder: async (p: string) => { dirs.add(p); }, create: async (p: string, s: string) => { assert.ok(!notes.has(p)); notes.set(p, s); }, process: async (p: string, fn: (s: string) => string) => { notes.set(p, fn(notes.get(p)!)); }, ensureDaily: async (d: string) => { await journal.ensureCanonicalDailyJournal(files, d); } };
	const index = new tasks.EmbeddedTaskIndex(files, () => `integration-${++id}`);
	const markdownFiles = () => [...notes].map(([path, body]) => ({ path, basename: path.split('/').at(-1)!.slice(0, -3), stat: { mtime: 1, size: body.length } }));
	const app = { vault: { getMarkdownFiles: markdownFiles, cachedRead: async (f: { path: string }) => notes.get(f.path)!, getAbstractFileByPath: () => undefined }, metadataCache: { getFileCache: () => ({ frontmatter: {} }) } };
	return { notes, files, index, app };
}
async function renderer(f: ReturnType<typeof fixture>) {
	const p = Object.create(plan.PlanWorkspaceRenderer.prototype);
	Object.assign(p, { app: f.app, plugin: { embeddedTasks: f.index }, mode: 'calendar', mobileCalendarExpanded: false, meaningfulDays: await journal.meaningfulJournalDates(f.app as never), timeState: time.initialTimeTraceState(new Date('2026-09-22T12:00:00')) });
	return p;
}

test('integration: mobile collapsed/expanded TimeTrace excludes task-only day markers, desktop stays expanded', async () => {
	const f = fixture(); await f.index.addDaily('future', '2026-09-25');
	const p = await renderer(f); p.mode = 'review'; let root = new El(); p.renderSidebar(root);
	assert.ok(root.querySelector('.mx-time-trace-time-tools')!.classes.has('is-calendar-collapsed'));
	const day = root.querySelectorAll('.mx-mini-calendar-day').find(e => e.attrs['aria-label'] === '2026-09-25')!;
	assert.equal(day.querySelector('.mx-mini-calendar-marker'), undefined);
	p.renderPlanContent = () => { root = new El(); p.renderSidebar(root); };
	root.querySelector('.mx-mini-calendar-toggle')!.onclick!({ stopPropagation() {} });
	assert.equal(root.querySelector('.mx-time-trace-time-tools')!.classes.has('is-calendar-collapsed'), false);
	const service = new QuickJournalService(f.files); await service.appendQuickJournalEntry('narrative', new Date('2026-09-25T12:00:00'));
	p.meaningfulDays = await journal.meaningfulJournalDates(f.app as never); root = new El(); p.renderSidebar(root);
	assert.ok(root.querySelectorAll('.mx-mini-calendar-day').find(e => e.attrs['aria-label'] === '2026-09-25')!.querySelector('.mx-mini-calendar-marker'));
	phone.clear(); try { p.mobileCalendarExpanded = false; root = new El(); p.renderSidebar(root); assert.equal(root.querySelector('.mx-time-trace-time-tools')!.classes.has('is-calendar-collapsed'), false); } finally { phone.add('is-mobile'); phone.add('is-phone'); }
});

test('integration: mobile month renders future task count without a Journal row and follows completion', async () => {
	const f = fixture(); await f.index.addDaily('future', '2026-09-25'); const p = await renderer(f);
	const entries = new Map([...f.notes].flatMap(([path, body]) => { const entry = journal.journalCalendarEntry(path, body, {}); return entry ? [['2026-09-25', entry] as const] : []; }));
	let root = new El(); p.renderDailyPlanMonth(root, f.index.all());
	const day = root.querySelectorAll('.po-cal__day').find(e => !e.classes.has('is-out') && e.querySelector('.po-cal__day-num')?.textContent === '25')!;
	assert.equal(day.querySelector('.mx-plan-calendar-incomplete')?.textContent, '☐ 1'); assert.equal(day.querySelector('.mx-calendar-journal-row'), undefined);
	await f.index.complete(f.index.all()[0]!, true); root = new El(); p.renderDailyPlanMonth(root, f.index.all()); assert.equal(root.querySelectorAll('.mx-plan-calendar-incomplete').length, 0);
});

test('integration: mobile viewport resize during Quick Journal save reuses task-only source and keeps UUID', async () => {
	const f = fixture(); const date = new Date('2026-09-22T12:00:00'); await f.index.addDaily('today', '2026-09-22'); const id = f.index.all()[0]!.id;
	let saved: Promise<unknown> | undefined; const service = new QuickJournalService(f.files, () => date);
	const { QuickJournalModal } = load('../views/QuickJournalModal.ts', { './viewPrimitives.ts': { beginListModal: (m: Modal) => m.contentEl, closeListModal: () => {} } });
	const modal = new QuickJournalModal({}, { appendQuickJournalEntry: (s: string) => saved = service.appendQuickJournalEntry(s) }); modal.onOpen();
	const input = modal.contentEl.querySelector('.mx-quick-journal-input')!; input.value = 'integration quick note'; await input.fire('input');
	viewport.height = 320; viewport.handlers.get('resize')!(); assert.equal(modal.modalEl.style.values.get('--mx-quick-journal-vh'), '308px');
	await modal.contentEl.querySelector('.mx-quick-journal-footer')!.children.find((e: El) => e.textContent === '保存')!.fire('click'); await saved; await new Promise<void>(resolve => setImmediate(resolve));
	assert.equal(f.notes.size, 1); const text = f.notes.get(tasks.dailyTaskPath('2026-09-22'))!; assert.ok(journal.hasMeaningfulJournalContent(text)); assert.ok(text.includes(id)); assert.ok(text.includes('integration quick note'));
	assert.ok(modal.closed); assert.equal(viewport.handlers.size, 0); viewport.height = 700;
});

test('integration: mobile Workbench action navigation retains Journal today execution and excludes future tasks', async () => {
	const f = fixture(); await f.index.addDaily('today'); await f.index.addDaily('future', '2099-09-25');
	let rendered: any[] = []; const board = new El();
	const { DashboardView } = load('../views/DashboardView.ts', {
		'../data/taskLogic': taskLogic, '../data/projectVault': { scanProjects: async () => [] }, '../data/planning': { ...planning, PLAN_PERIODS: [] },
		'../data/learning': { currentLearning: async () => [] }, '../data/learningVault': { scanLearning: () => [], learningFiles: () => ({}) }, '../data/processes': { processes: () => [] },
		'../components/workbench/WorkbenchHome': { renderWorkbenchHome: (el: El, data: any) => data.renderEmbeddedToday(el) },
		'./EmbeddedTaskModal': { renderEmbeddedRows: (_: El, list: any[]) => { rendered.push(...list); } },
	});
	const view = Object.create(DashboardView.prototype); Object.assign(view, { app: f.app, plugin: { settings: {}, embeddedTasks: f.index }, boardEl: board, currentSection: 'home', homeMode: 'workbench', workbenchRenderVersion: 0, taskStore: { scanAllTasks: async () => [] }, planFiles: () => f.files });
	const { WorkbenchShell } = load('../components/workbench/WorkbenchShell.ts', { '../../i18n': { t: (s: string) => s } });
	const root = new El(); const shell = Object.create(WorkbenchShell.prototype); let render: Promise<void> | undefined;
	Object.assign(shell, { dashboardEl: root, plugin: { settings: { boardEnabled: true } }, active: 'home', navigate: () => render = view.renderWorkbenchDashboard() }); shell.renderActions(root);
	assert.equal(root.querySelector('.ad-toolbar__group--action')!.children.length, 6);
	await root.querySelectorAll('.ad-toolbar__btn').find(e => e.dataset.action === 'home')!.fire('click'); await render;
	assert.deepEqual(rendered.map(t => t.text), ['today']); assert.equal(rendered[0].sourceFile, tasks.dailyTaskPath(tasks.todayTaskDate())); assert.equal(f.notes.has(tasks.LEGACY_DAILY_TASK_FILE), false);
});

// Daily Plan behavior tests execute production renderers; all note data is fictional.
function mixedTasks() {
 return [
  ...tasks.parseEmbeddedTasks('01-学习与资料/MXDP-learning.md', '## 学习任务\n- [ ] MXDP learning 📅 2036-04-18 <!-- mx-task:dp-learning -->'),
  ...tasks.parseEmbeddedTasks('02-知识与思考/MXDP-creation.md', '## 创作任务\n- [ ] MXDP creation 📅 2036-04-18 <!-- mx-task:dp-creation -->'),
  ...tasks.parseEmbeddedTasks(tasks.dailyTaskPath('2036-04-18'), '## 今日任务\n- [ ] MXDP daily 📅 2036-04-18 <!-- mx-task:dp-daily -->'),
 ];
}
for (const isPhone of [false, true]) test(`daily plan shared nav order and active state on ${isPhone ? 'phone' : 'desktop'}`, async () => {
 const f = fixture(); const p = await renderer(f); p.mode = 'review';
 if (!isPhone) phone.clear();
 try {
  const root = new El(); p.renderSidebar(root);
  assert.deepEqual(root.querySelectorAll('.mx-time-trace-nav-item').map(e => e.textContent), ['日记&复盘','每日计划','长期计划','周期计划']);
  assert.equal(root.querySelectorAll('.mx-time-trace-nav-item').filter(e => e.classes.has('is-active'))[0]!.textContent, '日记&复盘');
 } finally { phone.add('is-mobile'); phone.add('is-phone'); }
});
test('first renderer defaults to review and session deactivation retains chosen section', async () => {
 const f = fixture(); const p = new plan.PlanWorkspaceRenderer(f.app, { embeddedTasks: f.index });
 assert.equal(p.getState().mode, 'review'); await p.setState({ mode: 'calendar' }); p.deactivate();
 assert.equal(p.getState().mode, 'calendar'); assert.equal(p.mobileCalendarExpanded, false);
});
test('Daily Plan renders without reading Journal bodies or scanning meaningful dates', async () => {
 const f = fixture(); const p = await renderer(f); let reads = 0;
 f.app.vault.cachedRead = async () => { reads++; throw new Error('forbidden body read'); };
 f.notes.set(tasks.dailyTaskPath('2036-04-18'), 'PRIVATE-FIXTURE title and narrative');
 Object.assign(p, { workspaceEl: new El(), generation: 0, sourceLabels: new Map(), timeState: time.selectMonth(time.initialTimeTraceState(new Date('2036-04-18'))) });
 await p.renderPlanContent(); assert.equal(reads, 0); assert.equal(p.meaningfulDays.size, 0);
});
test('Month combines learning creation daily incomplete counts and marks completed-only dates', async () => {
 const p = await renderer(fixture()); const all = mixedTasks(); all.push({ ...all[0]!, id: 'completed', completed: true, date: '2036-04-19' });
 p.timeState = time.selectMonth(time.initialTimeTraceState(new Date('2036-04-18')));
 const root = new El(); p.renderDailyPlanMonth(root, all);
 const day = root.querySelectorAll('.po-cal__day').find(e => e.attrs['data-date'] === '2036-04-18')!;
 assert.equal(day.querySelector('.mx-plan-calendar-incomplete')!.textContent, '☐ 3');
 const done = root.querySelectorAll('.po-cal__day').find(e => e.attrs['data-date'] === '2036-04-19')!;
 assert.ok(done.querySelector('.mx-daily-plan-task-dot')); assert.equal(done.querySelector('.mx-plan-calendar-incomplete'), undefined);
 assert.equal(root.querySelector('.mx-calendar-journal-row'), undefined); assert.equal(root.querySelector('.mx-calendar-task-text'), undefined);
 let selected = ''; p.setDayFocus = (d: Date) => { selected = calendar.dateKey(d); }; await day.fire('click'); assert.equal(selected, '2036-04-18');
});
test('Week uses the same count and renders all three task types with real checkbox handlers', async () => {
 const p = await renderer(fixture()); const all = mixedTasks();
 p.timeState = time.selectWeek(time.initialTimeTraceState(new Date('2036-04-18')), new Date('2036-04-18'));
 const root = new El(); p.renderDailyPlanWeek(root, all);
 assert.deepEqual(root.querySelectorAll('.mx-calendar-task-marker').map(e => e.textContent).sort(), ['创','学','日'].sort());
 assert.equal(root.querySelectorAll('.mx-embedded-task-check').length, 3);
 assert.equal(root.querySelector('.mx-plan-calendar-incomplete')!.textContent, '☐ 3'); assert.equal(root.querySelector('.mx-calendar-journal-row'), undefined);
});
test('selected day pane contains only that date and shares the incomplete count', async () => {
 const p = await renderer(fixture()); const all = mixedTasks(); all.push({ ...all[0]!, id: 'other', date: '2036-04-19', text: 'excluded' });
 p.plugin.embeddedTasks.all = () => all; p.sourceLabels = new Map(); const root = new El(); p.renderDayDetail(root, new Date('2036-04-18'));
 assert.deepEqual(root.querySelectorAll('.mx-day-task-section__title').map(e => e.textContent), ['学习','创作','日常']);
 assert.equal(root.querySelectorAll('.po-cal__task').length, 3); assert.equal(root.querySelector('.mx-plan-calendar-incomplete')!.textContent, '☐ 3');
 assert.equal(root.querySelector('.mx-day-detail-journal-pane'), undefined);
});
test('Daily Plan marker ignores diary text and remains after the final task checkbox completes', async () => {
 const f = fixture(); await f.index.addDaily('MXDP check', '2026-09-25'); const p = await renderer(f);
 assert.equal(p.markerResolver()({kind:'day',date:'2026-09-25'}), true);
 assert.equal(p.markerResolver()({kind:'day',date:'2026-09-26'}), false);
 let writes = 0; const complete = f.index.complete.bind(f.index); p.plugin.embeddedTasks = { all: () => f.index.all(), complete: async (...args: Parameters<typeof complete>) => { await complete(...args); writes++; } };
 const root = new El(); p.renderDailyPlanChip(root, f.index.all()[0]); const check: any = root.querySelector('.mx-embedded-task-check');
 check.checked = true; check.onchange(); await new Promise(resolve => setTimeout(resolve, 10));
 assert.equal(writes, 1); assert.equal(f.index.all()[0]!.completed, true);
 assert.equal(calendar.incompleteTaskCountOnDate(f.index.all(), '2026-09-25'), 0);
 assert.equal(p.markerResolver()({kind:'day',date:'2026-09-25'}), true);
 p.meaningfulDays.add('2026-09-26'); assert.equal(p.markerResolver()({kind:'day',date:'2026-09-26'}), false);
 p.mode='review'; assert.equal(p.markerResolver()({kind:'day',date:'2026-09-25'}), false);
});
test('new task action presets only explicit day focus, never guesses week or month dates', async () => {
 const p = await renderer(fixture()); p.timeState = time.selectDay(p.timeState, new Date('2036-04-18')); p.openDailyPlanTask(); assert.equal(modalArgs[3], '2036-04-18');
 p.timeState = time.selectWeek(p.timeState, new Date('2036-04-18')); p.openDailyPlanTask(); assert.equal(modalArgs[3], undefined);
 p.timeState = time.selectMonth(p.timeState); p.openDailyPlanTask(); assert.equal(modalArgs[3], undefined);
});
test('overdue tasks stay on their logical day in Daily Plan', () => {
 const all = mixedTasks(); assert.equal(calendar.tasksOnDate(all, '2036-04-18').length, 3); assert.equal(calendar.tasksOnDate(all, '2036-04-20').length, 0);
});
