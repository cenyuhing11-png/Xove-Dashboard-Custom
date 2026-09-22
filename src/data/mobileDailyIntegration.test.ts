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
import { journalPlanningReviewHeaderTime } from './journalReview.ts';
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
	async fire(k: string) { if (k === 'click') await this.onclick?.({ stopPropagation() {} }); for (const fn of this.listeners.get(k) ?? []) await fn(); }
	appendChild(e: El) { if (e.parent) e.parent.children = e.parent.children.filter(c => c !== e); e.parent = this; this.children.push(e); }
	all(): El[] { return this.children.flatMap(c => [c, ...c.all()]); }
	querySelectorAll(s: string) { return this.all().filter(e => e.classes.has(s.slice(1))); }
	querySelector(s: string) { return this.querySelectorAll(s)[0]; }
	remove() { if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this); }
	contains(e:El) { return e===this||this.all().includes(e); }
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
		document: { addEventListener() {}, removeEventListener() {}, body: { classList: { contains: (c: string) => phone.has(c) } } }, window: { visualViewport: viewport, innerHeight: 800 },
	});
	return exports;
}
const mini = load('../components/timeTrace/TimeTraceMiniCalendar.ts', { '../../data/planWorkspace': calendar, '../../data/timeTrace': time, '../../data/quarters': quarters });
const monthShell = load('../components/timeTrace/MonthCalendar.ts', { '../../data/planWorkspace': calendar, '../../data/timeTrace': time });
const checkbox = load('../components/tasks/EmbeddedTaskCheckbox.ts');
let discoveryCalls = 0;
const plan = load('../views/PlanView.ts', {
 '../data/journalReview': { journalPlanningReviewHeaderTime, discoverReviewRecords: async () => { discoveryCalls++; return [{ path: 'MXPOL fixture' }]; }, randomReviewRecord: (records: unknown[]) => records[0] },
 '../components/timeTrace/TimeTraceMiniCalendar': mini,
 '../components/timeTrace/MonthCalendar': monthShell,
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
  assert.deepEqual(root.querySelectorAll('.mx-time-trace-nav-item').map(e => e.textContent), ['日记·计划·复盘','每日执行','长期计划']);
  assert.equal(root.querySelectorAll('.mx-time-trace-nav-item').filter(e => e.classes.has('is-active'))[0]!.textContent, '日记·计划·复盘');
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

test('legacy board route maps to nested plan overview and keeps its focus while browsing',async()=>{
 const p=await renderer(fixture());p.inlineTransition=Promise.resolve();await p.setState({mode:'board'});assert.equal(p.mode,'review');assert.equal(p.reviewView,'plans');
 const root=new El();p.renderReviewToolbar(root,[]);assert.deepEqual(root.querySelectorAll('.mx-journal-review-tool').map(e=>e.textContent),['日记一览','计划一览','最近记录','搜索','随机回顾','过去的今天']);
 p.setTimeState(time.selectMonth(p.timeState,5));await p.inlineTransition;assert.equal(p.reviewView,'plans');
 p.openPlanFocus({kind:'month',year:2038,month:5});await p.inlineTransition;assert.equal(p.reviewView,'record');assert.equal(p.timeState.focus.month,5);
});
for(const period of ['week','month','quarter','year'] as const)test(`nested plan overview ${period} markers remain separate from Review`,async()=>{
 const f=fixture();const p=await renderer(f);const date=new Date('2038-06-18T12:00:00');const pp=planning.planPaths(period,date)[0]!;const jp=journal.journalPaths(period,date)[0]!;
 const exists=new Set([pp]);p.app.vault.getAbstractFileByPath=(path:string)=>exists.has(path)?new File():undefined;
 p.mode='review';p.reviewView='plans';const focus:time.TimeFocus=period==='week'?{kind:'week',isoYear:2038,isoWeek:24,anchorDate:'2038-06-14'}:period==='quarter'?{kind:'quarter',year:2038,quarter:2}:period==='month'?{kind:'month',year:2038,month:6}:{kind:'year',year:2038};
 assert.equal(p.markerResolver()(focus),true);p.reviewView='record';assert.equal(p.markerResolver()(focus),false);exists.clear();exists.add(jp);assert.equal(p.markerResolver()(focus),true);p.reviewView='plans';assert.equal(p.markerResolver()(focus),false);
});

test('plan overview random action loads review candidates on demand instead of using an empty list',async()=>{
 const p=await renderer(fixture());p.mode='review';p.reviewView='plans';const root=new El();let chosen:any;p.openReviewRecord=(record:any)=>{chosen=record;};const before=discoveryCalls;p.renderReviewToolbar(root,[]);assert.equal(discoveryCalls,before);await root.querySelectorAll('.mx-journal-review-tool').find(e=>e.textContent==='随机回顾')!.onclick!({});assert.equal(discoveryCalls,before+1);assert.equal(chosen.path,'MXPOL fixture');
});


test('review entry whole-row click returns to overview once and month arrows preserve it', async () => {
 const p = await renderer(fixture()); Object.assign(p, { mode:'review', reviewView:'record', inlineTransition:Promise.resolve() });
 let renders=0; p.renderPlanContent=async()=>{renders++;}; const root=new El(); p.renderSidebar(root);
 const entry=root.querySelectorAll('.mx-time-trace-nav-item')[0]!;
 await entry.fire('click'); await p.inlineTransition; assert.equal(p.reviewView,'overview'); assert.equal(renders,1);
 await entry.fire('click'); await p.inlineTransition; assert.equal(renders,1);
 p.setTimeState(time.shiftVisibleMonth(p.timeState,1)); await p.inlineTransition; assert.equal(p.reviewView,'overview'); assert.equal(p.timeState.visible.month,10);
 p.setDayFocus(new Date('2026-09-22T12:00:00')); await p.inlineTransition; assert.equal(p.reviewView,'record');
});

test('quarter button is the first weekday cell and still selects its visible quarter', () => {
 const root=new El(); let selected:any; mini.renderTimeTraceMiniCalendar(root,{state:time.initialTimeTraceState(new Date('2026-09-22T12:00:00')),hasMarker:()=>false,onChange:(state:any)=>selected=state});
 const button=root.querySelector('.mx-mini-calendar-quarter')!; assert.equal(button.parent!.classes.has('mx-mini-calendar-weekdays'),true);assert.equal(button.parent!.children[0],button);
 button.onclick!({}); assert.equal(selected.focus.kind,'quarter');assert.equal(selected.focus.quarter,3);
});

for(const journal of [true,false])test(`shared month shell ${journal?'Journal':'execution'} keeps today and selection disjoint`,()=>{
 const root=new El(); let chosen=''; monthShell.renderMonthCalendar(root,{year:2026,month:9,selected:'2026-09-22',today:new Date('2026-09-22T12:00:00'),journal,onSelect:(date:Date)=>chosen=calendar.dateKey(date),content:()=>{}});
 const cells=root.querySelectorAll('.mx-month-day');assert.equal(cells.length,42);assert.equal(root.querySelector('.mx-month-weekdays')!.children.length,7);
 const today=cells.find(e=>e.attrs['data-date']==='2026-09-22')!;assert.ok(today.classes.has('is-today'));assert.equal(today.classes.has('is-sel'),false);assert.equal(today.attrs['aria-current'],'date');today.onclick!({});assert.equal(chosen,'2026-09-22');
 const other=new El();monthShell.renderMonthCalendar(other,{year:2026,month:9,selected:'2026-09-23',today:new Date('2026-09-22T12:00:00'),journal,onSelect:()=>{},content:()=>{}});assert.ok(other.querySelectorAll('.mx-month-day').find(e=>e.attrs['data-date']==='2026-09-23')!.classes.has('is-sel'));
});

for(const journal of [true,false])test(`shared ${journal?'Journal':'task'} cells reserve date row before content`,()=>{
 const root=new El();monthShell.renderMonthCalendar(root,{year:2026,month:9,today:new Date('2026-09-22T12:00:00'),selected:'2026-09-22',journal,onSelect:()=>{},content:(body:El)=>body.createSpan({text:journal?'很长的中文日记标题，应该从日期行下方开始':'☐ 3'})});
 for(const cell of root.querySelectorAll('.mx-month-day')){assert.equal(cell.children[0]!.classes.has('mx-month-date-row'),true);assert.equal(cell.children[1]!.classes.has('mx-month-cell-content'),true);assert.ok(cell.children[0]!.querySelector('.mx-month-date'));assert.equal(cell.children[1]!.children.length,1);}
 const today=root.querySelectorAll('.mx-month-day').find(e=>e.classes.has('is-today'))!;assert.equal(today.classes.has('is-sel'),false);
});

test('overview scroll sync updates header and Mini Calendar without a navigation jump or selected-day change',async()=>{
 const p=await renderer(fixture());const root=new El();(root as any).prepend=(e:El)=>{root.children=root.children.filter(c=>c!==e);root.children.unshift(e);};
 const header=root.createDiv({cls:'mx-journal-review-time'});p.workspaceEl=root;p.mode='review';p.reviewView='overview';let jumps=0;let miniMonth=0;p.renderSidebar=(parent:El)=>{miniMonth=p.timeState.visible.month;parent.createDiv({cls:'mx-time-trace-sidebar'});};
 // DOM remove is needed for repeated sidebar synchronization.
 (El.prototype as any).remove=function(){if(this.parent)this.parent.children=this.parent.children.filter((c:El)=>c!==this);};
 p.overviewFlow={jump:()=>{jumps++;}};const selected=p.timeState.focus;
 p.syncOverviewMonth({year:2026,month:10});assert.equal(header.textContent,'2026 年 10 月');assert.equal(miniMonth,10);assert.equal(jumps,0);assert.equal(p.timeState.focus,selected);
 p.setTimeState({...p.timeState,visible:{year:2027,month:1}});assert.equal(jumps,1);assert.equal(miniMonth,1);assert.equal(p.reviewView,'overview');
});

test('overview creates exactly one weekday strip between header and scrolling body',async()=>{
 const p=await renderer(fixture());Object.assign(p,{mode:'review',reviewView:'overview',workspaceEl:new El(),generation:0});p.renderReview=async()=>{};
 await p.renderPlanContent();const root=p.workspaceEl as El,main=root.querySelector('.po-main')!;
 assert.deepEqual(main.children.map(e=>[...e.classes].filter(c=>['mx-time-trace-section-header','mx-overview-weekdays','mx-time-trace-section-body'].includes(c))[0]),['mx-time-trace-section-header','mx-overview-weekdays','mx-time-trace-section-body']);
 assert.equal(root.querySelectorAll('.mx-month-weekdays').length,1);assert.deepEqual(root.querySelector('.mx-month-weekdays')!.children.map(e=>e.textContent),['一','二','三','四','五','六','日']);assert.equal(root.querySelector('.mx-time-trace-section-body')!.querySelector('.mx-month-weekdays'),undefined);
});
test('continuous month shell omits weekdays while ordinary execution month retains them',()=>{
 const stream=new El(),execution=new El();const options={year:2026,month:9,onSelect:()=>{},content:()=>{}};
 monthShell.renderMonthCalendar(stream,{...options,journal:true,hideWeekdays:true});monthShell.renderMonthCalendar(execution,options);
 assert.equal(stream.querySelectorAll('.mx-month-weekdays').length,0);assert.equal(execution.querySelectorAll('.mx-month-weekdays').length,1);assert.equal(stream.querySelectorAll('.mx-month-day').length,42);assert.ok(stream.querySelectorAll('.mx-month-day').some(e=>e.classes.has('is-out')));
});


for(const isPhone of [false,true])test(`Mini labels and arrows are independent on ${isPhone?'phone':'desktop'}`,()=>{
 if(!isPhone)phone.clear();try{
 const root=new El(),focuses:any[]=[],changes:any[]=[];const close=mini.renderTimeTraceMiniCalendar(root,{state:time.initialTimeTraceState(new Date('2026-09-22T12:00:00')),hasMarker:()=>false,onFocus:(s:any)=>focuses.push(s),onChange:(s:any)=>changes.push(s)});
 for(const kind of ['year','month']){const label=root.all().find(e=>e.attrs['data-scope-label']===kind)!,arrow=root.all().find(e=>e.attrs['data-scope-arrow']===kind)!;assert.notEqual(label,arrow);assert.equal(label.children.includes(arrow),false);let stopped=0,prevented=0;const event={stopPropagation(){stopped++;},preventDefault(){prevented++;}};
 label.onclick!(event);assert.equal(focuses.at(-1).focus.kind,kind);assert.equal(root.querySelector('.mx-mini-calendar-picker'),undefined);const before=focuses.length;arrow.onclick!(event);assert.ok(root.querySelector('.mx-mini-calendar-picker'));assert.equal(focuses.length,before);assert.equal(changes.length,0);assert.equal(stopped,2);assert.equal(prevented,2);close();}
 for(const [cls,kind]of [['.mx-mini-calendar-quarter','quarter'],['.mx-mini-calendar-week','week'],['.mx-mini-calendar-day','day']] as const){root.querySelector(cls)!.onclick!({});assert.equal(focuses.at(-1).focus.kind,kind);}close();
 }finally{phone.add('is-mobile');phone.add('is-phone');}
});
for(const kind of ['day','week','month','quarter','year'] as const)test(`Mini ${kind} focus leaves overview for the inline record`,async()=>{
 const p=await renderer(fixture());Object.assign(p,{mode:'review',reviewView:'overview',inlineTransition:Promise.resolve()});let renders=0;p.renderPlanContent=async()=>{renders++;};const state=kind==='day'?time.selectDay(p.timeState,new Date('2026-09-22T12:00:00')):kind==='week'?time.selectWeek(p.timeState,new Date('2026-09-21')):kind==='month'?time.selectMonth(p.timeState,9):kind==='quarter'?time.selectQuarter(p.timeState):time.selectYear(p.timeState,2026);
 p.enterTimeFocus(state);await p.inlineTransition;assert.equal(p.reviewView,'record');assert.equal(p.timeState.focus.kind,kind);assert.equal(renders,1);
});
for(const mode of ['calendar','longTermPlan','review'])test(`top TimeTrace home from ${mode} lands in overview and retains month`,async()=>{
 const p=await renderer(fixture());Object.assign(p,{mode,reviewView:'record',inlineTransition:Promise.resolve()});p.timeState.visible={year:2027,month:2};p.renderPlanContent=async()=>{};
 const {DashboardView}=load('../views/DashboardView.ts');const v=Object.create(DashboardView.prototype);let section='';v.planRenderer=p;v.setSection=async(s:string)=>{section=s;};await v.navigateWorkbench('plan');assert.equal(section,'timeTrace');assert.equal(p.mode,'review');assert.equal(p.reviewView,'overview');assert.equal(p.timeState.visible.year,2027);assert.equal(p.timeState.visible.month,2);
});
test('top TimeTrace home refuses navigation when an inline save conflicts',async()=>{
 const p=await renderer(fixture());Object.assign(p,{mode:'review',reviewView:'record',inlineTransition:Promise.resolve(),inlineEditor:{flush:async()=>false}});p.renderPlanContent=async()=>{throw Error('Unexpected render');};
 const {DashboardView}=load('../views/DashboardView.ts');const v=Object.create(DashboardView.prototype);v.planRenderer=p;v.setSection=async()=>{throw Error('Unexpected navigation');};await v.navigateWorkbench('plan');assert.equal(p.reviewView,'record');
});
