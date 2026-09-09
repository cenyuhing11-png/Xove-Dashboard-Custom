import { Component, ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type { App, ViewStateResult } from 'obsidian';
import type Dashboard from '../main';
import type { EmbeddedTask } from '../data/embeddedTasks';
import { TASK_DISPLAY_CATEGORIES, TASK_DISPLAY_LABELS, groupEmbeddedForDisplay, taskDisplayMarker, taskSourceSubtitle } from '../data/embeddedTasks';
import type { PlanWorkspaceCard, PlanWorkspaceMode, PlanCalendarMode } from '../data/planWorkspace';
import { dateKey, localPlanSelection, readPlanWorkspace, taskCalendarSourceLabel, tasksOnDate } from '../data/planWorkspace';
import { planInfo } from '../data/planning';
import { WorkbenchShell } from '../components/workbench/WorkbenchShell';
import { renderLifeCompass } from '../components/workbench/LifeCompass';
import { openDirection } from './DirectionView';
import { scanLearning } from '../data/learningVault';
import { scanProjects } from '../data/projectVault';
import { processes } from '../data/processes';
import { taskSourceTypeLabel } from '../data/processContentTypes';
import { journalCalendarEntry, journalDateFromPath } from '../data/journal';
import type { JournalCalendarEntry } from '../data/journal';
import { renderEmbeddedTaskCheckbox } from '../components/tasks/EmbeddedTaskCheckbox';
import { scanLongTermPlans, scanLinkedPeriodPlans, setProcessLongTermPlan } from '../data/longTermPlanVault';
import { currentLongTermStage, longTermMonths, longTermPlansForMonth, longTermStageProgress, toggleLongTermStage } from '../data/longTermPlans';
import type { LongTermPlan } from '../data/longTermPlans';
import type { Process } from '../data/processes';
import { hasProcessSchedule } from '../data/processes';
import { ProcessAssociationModal } from './LongTermPlanPickerModal';
import { renderTaskProgressPill } from './ProcessTaskProgress';
import { ProcessTasksModal } from './ProcessTasksModal';

export const PLAN_VIEW = 'xove-dashboard-custom-plan-workspace';

export async function openPlanWorkspace(app: App): Promise<void> {
	try {
		const leaf = app.workspace.getLeavesOfType(PLAN_VIEW)[0] ?? app.workspace.getLeaf('tab');
		if (leaf.view.getViewType() !== PLAN_VIEW) await leaf.setViewState({ type: PLAN_VIEW, active: true });
		await app.workspace.revealLeaf(leaf);
		app.workspace.setActiveLeaf(leaf, { focus: true });
	} catch (error) { new Notice(`无法打开时迹：${String(error)}`); }
}

function dayLabel(date: Date): string { return `${date.getMonth() + 1}/${date.getDate()}`; }
function monthTitle(year: number, month: number): string { return `${year} 年 ${month} 月`; }
function sameDay(a: Date, b: Date): boolean { return dateKey(a) === dateKey(b); }

/** Reusable time-trace content. The legacy PlanView and the main workbench router
 * mount this same renderer, so the business UI has a single implementation. */
export class PlanWorkspaceRenderer extends Component {
	private selectedYear = localPlanSelection().year;
	private selectedMonth = localPlanSelection().month;
	private mode: PlanWorkspaceMode = 'board';
	private calendarMode: PlanCalendarMode = 'month';
	private selectedDate = new Date(this.selectedYear, this.selectedMonth - 1, new Date().getDate(), 12);
	private sourceLabels = new Map<string, string>();
	private workspaceEl?: HTMLElement;
	private generation = 0;
	private active = false;
	private sectionDisposers: Array<() => void> = [];
	private selectedLongTermPlanId = '';
	private quickTasks?: ProcessTasksModal;

	constructor(public readonly app: App, private plugin: Dashboard, private navigation?: { openProcess(process: Process): void; openGantt(process: Process): void }) { super(); }
	getState() { return { selectedYear: this.selectedYear, selectedMonth: this.selectedMonth, mode: this.mode, calendarMode: this.calendarMode, selectedDate: dateKey(this.selectedDate), selectedLongTermPlanId: this.selectedLongTermPlanId }; }
	async setState(state: Record<string, unknown>): Promise<void> {
		if (Number.isInteger(state.selectedYear) && Number(state.selectedYear) > 0) this.selectedYear = Number(state.selectedYear);
		if (Number.isInteger(state.selectedMonth) && Number(state.selectedMonth) >= 1 && Number(state.selectedMonth) <= 12) this.selectedMonth = Number(state.selectedMonth);
		if (state.mode === 'board' || state.mode === 'longTermPlan' || state.mode === 'calendar' || state.mode === 'review') this.mode = state.mode;
		if (typeof state.selectedLongTermPlanId === 'string') this.selectedLongTermPlanId = state.selectedLongTermPlanId;
		if (state.calendarMode === 'month' || state.calendarMode === 'week') this.calendarMode = state.calendarMode;
		if (typeof state.selectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.selectedDate)) {
			const [year, month, day] = state.selectedDate.split('-').map(Number);
			this.selectedDate = new Date(year!, month! - 1, day, 12);
		}
		if (this.workspaceEl) await this.renderPlanContent();
	}
	private attachSectionListeners(): void {
		if (this.sectionDisposers.length) return;
		const refresh = () => { if (this.active) void this.renderPlanContent(); };
		const workspaceRef = this.app.workspace.on('css-change', refresh);
		this.sectionDisposers.push(() => this.app.workspace.offref(workspaceRef));
		const createRef = this.app.vault.on('create', refresh);
		const deleteRef = this.app.vault.on('delete', refresh);
		const renameRef = this.app.vault.on('rename', refresh);
		this.sectionDisposers.push(() => this.app.vault.offref(createRef));
		this.sectionDisposers.push(() => this.app.vault.offref(deleteRef));
		this.sectionDisposers.push(() => this.app.vault.offref(renameRef));
		const modifyRef = this.app.vault.on('modify', file => { if (this.active && (file.path.startsWith('05-计划/') || (this.mode === 'calendar' && !!journalDateFromPath(file.path)))) void this.renderPlanContent(); });
		this.sectionDisposers.push(() => this.app.vault.offref(modifyRef));
		const metadataRef = this.app.metadataCache.on('changed', file => { if (this.active && this.mode === 'calendar' && !!journalDateFromPath(file.path)) void this.renderPlanContent(); });
		this.sectionDisposers.push(() => this.app.metadataCache.offref(metadataRef));
		this.sectionDisposers.push(this.plugin.embeddedTasks.subscribe(() => { if (this.active && this.mode === 'calendar') void this.renderPlanContent(); }));
	}
	async activate(workspaceEl: HTMLElement): Promise<void> {
		this.active = true;
		this.workspaceEl = workspaceEl;
		this.attachSectionListeners();
		await this.plugin.embeddedTasks.ready;
		await this.renderPlanContent();
	}
	deactivate(): void {
		this.active = false;
		this.quickTasks?.close(); this.quickTasks = undefined;
		this.generation++;
		this.workspaceEl = undefined;
		for (const dispose of this.sectionDisposers.splice(0)) dispose();
	}
	onunload(): void { this.deactivate(); }

	private planFiles() {
		return {
			kind: (path: string) => { const entry = this.app.vault.getAbstractFileByPath(path); return entry instanceof TFile ? 'file' as const : entry ? 'folder' as const : undefined; },
			read: async (path: string) => { const file = this.app.vault.getAbstractFileByPath(path); if (!(file instanceof TFile)) throw new Error('计划文件不存在'); return this.app.vault.cachedRead(file); },
		};
	}

	private async openExisting(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) { new Notice('尚未创建对应计划'); return; }
		await this.app.workspace.getLeaf('tab').openFile(file);
	}

	private setSelection(year: number, month: number, day = 1): void {
		this.selectedYear = year; this.selectedMonth = month;
		this.selectedDate = new Date(year, month - 1, Math.min(day, new Date(year, month, 0).getDate()), 12);
		void this.renderPlanContent();
	}
	async openLongTermPlan(id: string): Promise<void> { this.mode = 'longTermPlan'; this.selectedLongTermPlanId = id; if (this.workspaceEl) await this.renderPlanContent(); }

	private async renderPlanContent(): Promise<void> {
		const container = this.workspaceEl;
		if (!container) return;
		const token = ++this.generation;
		const snapshot = this.mode === 'board'
			? await readPlanWorkspace(this.planFiles(), this.selectedYear, this.selectedMonth)
			: undefined;
		const longTermPlans = this.mode === 'longTermPlan' ? await scanLongTermPlans(this.app) : [];
		if (token !== this.generation || container !== this.workspaceEl) return;
		container.empty();
		this.renderSidebar(container, snapshot?.monthly.exists ?? false);
		const main = container.createDiv({ cls: 'po-main' });
		if (this.mode === 'board' && snapshot) this.renderBoard(main, snapshot);
		else if (this.mode === 'longTermPlan') this.renderLongTermPlans(main, longTermPlans);
		else if (this.mode === 'calendar') await this.renderCalendar(main, token);
		else this.renderReview(main);
	}

	private renderSidebar(container: HTMLElement, _selectedMonthExists: boolean): void {
		const side = container.createDiv({ cls: 'po-sidebar' });
		const list = side.createDiv({ cls: 'po-sidebar__list' });
		for (const [mode, label] of [['board', '周期计划'], ['longTermPlan', '长期计划'], ['calendar', '综合日历'], ['review', '日记回顾']] as const) {
			const item = list.createDiv({ cls: `po-sidebar__item${this.mode === mode ? ' is-active' : ''}`, text: label, attr: { role: 'button', tabindex: '0' } });
			const selectMode = () => { this.mode = mode; void this.renderPlanContent(); };
			item.addEventListener('click', selectMode);
			item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectMode(); } });
		}
		list.createDiv({ cls: 'mx-time-trace-divider', attr: { 'aria-hidden': 'true' } });

		const now = localPlanSelection();
		const current = list.createDiv({ cls: 'po-sidebar__item mx-time-trace-today', text: '今天', attr: { role: 'button', tabindex: '0' } });
		const selectCurrent = () => this.setSelection(now.year, now.month, new Date().getDate());
		current.addEventListener('click', selectCurrent);
		current.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCurrent(); } });
		const yearBar = list.createDiv({ cls: 'mx-plan-year' });
		const prev = yearBar.createEl('button', { cls: 'po-cal__btn', text: '‹', attr: { 'aria-label': '上一年' } });
		yearBar.createSpan({ text: `${this.selectedYear}` });
		const next = yearBar.createEl('button', { cls: 'po-cal__btn', text: '›', attr: { 'aria-label': '下一年' } });
		prev.addEventListener('click', () => this.setSelection(this.selectedYear - 1, this.selectedMonth));
		next.addEventListener('click', () => this.setSelection(this.selectedYear + 1, this.selectedMonth));

		const grid = list.createDiv({ cls: 'mx-plan-months' });
		for (let month = 1; month <= 12; month++) {
			const exists = !!this.app.vault.getAbstractFileByPath(planInfo('month', new Date(this.selectedYear, month - 1, 1, 12)).path);
			const button = grid.createEl('button', { cls: `po-chip${month === this.selectedMonth ? ' is-active' : ''}`, attr: { 'aria-label': `${month} 月${exists ? '，已有月度计划' : ''}` } });
			button.createSpan({ text: `${month}月` });
			if (exists) button.createSpan({ cls: 'mx-plan-month-dot' });
			button.addEventListener('click', () => this.setSelection(this.selectedYear, month));
		}
	}

	private renderPlanCard(column: HTMLElement, card: PlanWorkspaceCard): void {
		const head = column.createDiv({ cls: 'po-kanban__hd' });
		head.createSpan({ text: card.title });
		head.createSpan({ cls: 'po-kanban__count', text: String(card.entries.length) });
		if (card.error) { column.createDiv({ cls: 'po-empty mx-plan-empty', text: card.error }); return; }
		if (!card.exists || !card.entries.length) { column.createDiv({ cls: 'po-empty mx-plan-empty', text: '暂无计划' }); return; }
		for (const entry of card.entries) {
			const item = column.createDiv({ cls: 'po-kanban__card', text: entry });
			item.addEventListener('click', () => { void this.openExisting(card.path); });
		}
	}

	private renderBoard(main: HTMLElement, snapshot: Awaited<ReturnType<typeof readPlanWorkspace>>): void {
		const toolbar = main.createDiv({ cls: 'po-toolbar mx-plan-toolbar' });
		toolbar.createSpan({ cls: 'mx-plan-title', text: '周期计划' });
		toolbar.createSpan({ cls: 'mx-plan-context', text: `${monthTitle(this.selectedYear, this.selectedMonth)} · Q${snapshot.quarter}` });
		const top = main.createDiv({ cls: 'po-kanban mx-plan-summary' });
		for (const card of [snapshot.annual, snapshot.quarterly, snapshot.monthly]) {
			const column = top.createDiv({ cls: 'po-kanban__col' }); this.renderPlanCard(column, card);
		}
		const weeks = main.createDiv({ cls: 'po-kanban mx-plan-weeks' });
		for (const week of snapshot.weeks) {
			const column = weeks.createDiv({ cls: 'po-kanban__col' });
			const head = column.createDiv({ cls: 'po-kanban__hd' });
			head.createSpan({ text: week.title });
			head.createSpan({ cls: 'po-kanban__count', text: `${dayLabel(week.start)}–${dayLabel(week.end)}` });
			if (week.error) column.createDiv({ cls: 'po-empty mx-plan-empty', text: week.error });
			else if (!week.exists || !week.entries.length) column.createDiv({ cls: 'po-empty mx-plan-empty', text: '暂无周计划' });
			else for (const entry of week.entries) {
				const item = column.createDiv({ cls: 'po-kanban__card', text: entry });
				item.addEventListener('click', () => { void this.openExisting(week.path); });
			}
		}
	}

	private renderReview(main: HTMLElement): void {
		const toolbar = main.createDiv({ cls: 'po-toolbar mx-plan-toolbar' });
		toolbar.createSpan({ cls: 'mx-plan-title', text: '日记回顾' });
		main.createDiv({ cls: 'po-empty mx-plan-empty', text: '暂无回顾内容' });
	}

	private renderLongTermPlans(main: HTMLElement, plans: LongTermPlan[]): void {
		const selected = plans.find(plan => plan.id === this.selectedLongTermPlanId);
		if (selected) { this.renderLongTermDetail(main, selected); return; }
		this.selectedLongTermPlanId = '';
		const toolbar = main.createDiv({ cls: 'po-toolbar mx-plan-toolbar' }); toolbar.createSpan({ cls: 'mx-plan-title', text: '长期计划' });
		toolbar.createSpan({ cls: 'mx-plan-context', text: `${this.selectedYear} 年 ${this.selectedMonth} 月` });
		const visible = longTermPlansForMonth(plans, this.selectedYear, this.selectedMonth);
		const list = main.createDiv({ cls: 'po-tasklist mx-long-term-list' });
		if (!visible.length) { list.createDiv({ cls: 'po-empty mx-plan-empty', text: '该月份暂无长期计划' }); return; }
		for (const plan of visible) {
			const progress = longTermStageProgress(plan.stages); const row = list.createDiv({ cls: 'wb-entry wb-entry--button', attr: { role: 'button', tabindex: '0' } });
			const body = row.createDiv({ cls: 'mx-long-term-row__body' }); body.createDiv({ cls: 'wb-entry__label', text: plan.name });
			body.createDiv({ cls: 'ad-modal-hint', text: `${plan.startMonth.replace('-', '.')} — ${plan.endMonth.replace('-', '.')} · ${longTermMonths(plan.startMonth, plan.endMonth)}个月 · ${plan.status}` });
			row.createSpan({ cls: 'wb-entry__detail', text: `阶段 ${progress.completed} / ${progress.total}` }); row.createSpan({ cls: 'wb-entry__arrow', text: '→' });
			const open = () => { this.selectedLongTermPlanId = plan.id; void this.renderPlanContent(); }; row.onclick = open; row.onkeydown = event => { if(event.key==='Enter'||event.key===' '){event.preventDefault();open();} };
		}
	}

	private renderLongTermDetail(main: HTMLElement, plan: LongTermPlan): void {
		const allProcesses = processes(scanLearning(this.app), scanProjects(this.app), this.plugin.embeddedTasks.all());
		const linked = allProcesses.filter(process => process.longTermPlanId === plan.id); const linkedPlans = scanLinkedPeriodPlans(this.app).filter(item => item.longTermPlanIds.includes(plan.id));
		const toolbar = main.createDiv({ cls: 'po-topbar' }); const back = toolbar.createEl('button', { cls: 'po-cal__seg-btn', text: '← 返回长期计划列表' }); back.onclick = () => { this.selectedLongTermPlanId=''; void this.renderPlanContent(); };
		const summary = main.createDiv({ cls: 'ad-update-block mx-long-term-summary' }); summary.createEl('h1', { cls: 'ad-modal-title', text: plan.name });
		const progress = longTermStageProgress(plan.stages); summary.createEl('p', { cls: 'ad-modal-hint', text: `${plan.startMonth.replace('-','.')} — ${plan.endMonth.replace('-','.')} · 预计 ${longTermMonths(plan.startMonth,plan.endMonth)} 个月 · ${plan.status} · 阶段进度 ${progress.completed} / ${progress.total}` });
		const directions=[...new Set(linked.map(process=>process.direction).filter(Boolean))]; if(directions.length) summary.createEl('p',{cls:'ad-modal-hint',text:`涉及：${directions.join(' · ')}`});
		summary.createEl('p',{cls:'ad-modal-desc mx-long-term-goal',text:plan.goal||'尚未填写长期目标'});
		const layout=main.createDiv({cls:'mx-long-term-detail'}); const stages=layout.createDiv({cls:'ad-update-block mx-long-term-stages'}); stages.createEl('h2',{cls:'ad-modal-title',text:'阶段安排'});
		if(!plan.stages.length) stages.createDiv({cls:'po-empty mx-plan-empty',text:'尚未添加阶段'});
		for(const stage of plan.stages){const row=stages.createDiv({cls:'mx-long-term-stage'});const control=row.createEl('label',{cls:'mx-embedded-task-checkbox'});const check=control.createEl('input',{cls:'mx-embedded-task-check',attr:{type:'checkbox','aria-label':`${stage.completed?'取消完成':'完成'} ${stage.text}`}});check.checked=stage.completed;control.createSpan({cls:'po-check mx-embedded-task-check-visual',attr:{'aria-hidden':'true'}});row.createSpan({text:stage.text});check.onchange=()=>{const file=this.app.vault.getAbstractFileByPath(plan.path);if(!(file instanceof TFile))return;check.disabled=true;void this.app.vault.process(file,content=>toggleLongTermStage(content,stage.index,check.checked)).catch(error=>{check.checked=stage.completed;new Notice(String(error));}).finally(()=>{check.disabled=false;});};}
		const right=layout.createDiv({cls:'mx-long-term-related'}); const processBlock=right.createDiv({cls:'ad-update-block'}); const processHead=processBlock.createDiv({cls:'ad-card__head mx-detail-task-head'}); processHead.createEl('h2',{cls:'ad-modal-title',text:'关联进程'}); processHead.createEl('button',{cls:'po-cal__seg-btn',text:'＋ 添加'}).onclick=()=>new ProcessAssociationModal(this.app,allProcesses,plan,async selected=>{const chosen=new Set(selected.map(item=>item.sourceFile));await Promise.all(allProcesses.filter(item=>item.longTermPlanId===plan.id||chosen.has(item.sourceFile)).map(item=>setProcessLongTermPlan(this.app,item,chosen.has(item.sourceFile)?plan.id:undefined)));await this.renderPlanContent();}).open();
		if(!linked.length) processBlock.createDiv({cls:'po-empty mx-plan-empty',text:'暂无关联进程'});
		for(const process of linked){const row=processBlock.createDiv({cls:'wb-entry'});const name=row.createEl('button',{cls:'mx-inline-action wb-entry__label',text:process.name});name.onclick=()=>this.navigation?.openProcess(process);row.createSpan({cls:'ad-modal-hint',text:`${process.category==='learning'?'学习':'创作'} · ${process.status}${process.startDate||process.dueDate?` · ${process.startDate||'未设置'} → ${process.dueDate||'未设置'}`:''}`});renderTaskProgressPill(row,process.name,process.sourceFile,process.taskTotal,process.taskCompleted,()=>{this.quickTasks?.close();this.quickTasks=new ProcessTasksModal(this.app,this.plugin.embeddedTasks,{name:process.name,processType:process.processType,sourceFile:process.sourceFile,category:process.category,contentType:process.contentType},()=>this.navigation?.openProcess(process));this.quickTasks.open();});if(hasProcessSchedule({startDate:process.startDate??null,endDate:process.dueDate??null})){const schedule=row.createEl('button',{cls:'mx-inline-action',text:'查看排期 →'});schedule.onclick=()=>this.navigation?.openGantt(process);}else row.createSpan({cls:'ad-modal-hint',text:'未排期'});}
		const periodBlock=right.createDiv({cls:'ad-update-block'});periodBlock.createEl('h2',{cls:'ad-modal-title',text:'关联计划'});if(!linkedPlans.length)periodBlock.createDiv({cls:'po-empty mx-plan-empty',text:'暂无关联周期计划'});for(const item of linkedPlans){const row=periodBlock.createDiv({cls:'wb-entry wb-entry--button'});row.createSpan({cls:'wb-entry__label',text:item.name});row.createSpan({cls:'wb-entry__detail',text:item.period});row.onclick=()=>void this.openExisting(item.path);}
		const current=main.createEl('p',{cls:'ad-modal-hint',text:`当前阶段：${currentLongTermStage(plan.stages)}`});current.title='由第一条未完成阶段自动推导';
	}

	private async readCalendarJournals(): Promise<Map<string, JournalCalendarEntry>> {
		const files = this.app.vault.getMarkdownFiles().filter(file => journalDateFromPath(file.path))
			.sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path, 'zh-CN'));
		const entries = await Promise.all(files.map(async file => {
			try { return journalCalendarEntry(file.path, await this.app.vault.cachedRead(file), this.app.metadataCache.getFileCache(file)?.frontmatter); }
			catch { return null; }
		}));
		const journals = new Map<string, JournalCalendarEntry>();
		for (const entry of entries) if (entry && !journals.has(entry.date)) journals.set(entry.date, entry);
		return journals;
	}

	private async renderCalendar(main: HTMLElement, token: number): Promise<void> {
		const tasks = this.plugin.embeddedTasks.all();
		this.sourceLabels = new Map(processes(scanLearning(this.app), scanProjects(this.app), tasks).map(process => [process.sourceFile, taskSourceTypeLabel(process.contentType)]));
		const journals = await this.readCalendarJournals();
		if (token !== this.generation || !main.isConnected) return;
		const root = main.createDiv({ cls: 'po-cal' }); root.tabIndex = 0;
		const bar = root.createDiv({ cls: 'po-cal__bar' });
		bar.createSpan({ cls: 'mx-plan-title', text: '综合日历' });
		const seg = bar.createDiv({ cls: 'po-cal__seg' });
		for (const [mode, label] of [['month', '月'], ['week', '周']] as const) {
			const btn = seg.createEl('button', { cls: `po-cal__seg-btn${this.calendarMode === mode ? ' is-active' : ''}`, text: label });
			btn.addEventListener('click', () => { this.calendarMode = mode; void this.renderPlanContent(); });
		}
		bar.createSpan({ cls: 'po-cal__ttl', text: this.calendarMode === 'month' ? monthTitle(this.selectedYear, this.selectedMonth) : this.weekTitle() });
		const nav = bar.createDiv({ cls: 'po-cal__nav' });
		const prev = nav.createEl('button', { cls: 'po-cal__btn', text: '‹' });
		const today = nav.createEl('button', { cls: 'po-cal__btn', text: '今天' });
		const next = nav.createEl('button', { cls: 'po-cal__btn', text: '›' });
		prev.addEventListener('click', () => this.moveCalendar(-1)); today.addEventListener('click', () => { const n = new Date(); this.setSelection(n.getFullYear(), n.getMonth() + 1, n.getDate()); }); next.addEventListener('click', () => this.moveCalendar(1));
		if (this.calendarMode === 'month') this.renderCalendarMonth(root, journals); else this.renderCalendarWeek(root, journals);
		this.renderDayDetail(root, journals.get(dateKey(this.selectedDate)));
	}

	private moveCalendar(direction: -1 | 1): void {
		if (this.calendarMode === 'month') {
			const next = new Date(this.selectedYear, this.selectedMonth - 1 + direction, 1, 12); this.setSelection(next.getFullYear(), next.getMonth() + 1);
		} else {
			const next = new Date(this.selectedDate); next.setDate(next.getDate() + direction * 7); this.setSelection(next.getFullYear(), next.getMonth() + 1, next.getDate());
		}
	}

	private weekDates(): Date[] {
		const start = new Date(this.selectedDate); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
		return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
	}
	private weekTitle(): string { const dates = this.weekDates(); return `${dayLabel(dates[0]!)}–${dayLabel(dates[6]!)}`; }

	private renderCalendarMonth(root: HTMLElement, journals: Map<string, JournalCalendarEntry>): void {
		const weekdays = root.createDiv({ cls: 'po-cal__weekdays' });
		for (const name of ['一', '二', '三', '四', '五', '六', '日']) weekdays.createSpan({ text: name });
		const days = root.createDiv({ cls: 'po-cal__days mx-plan-calendar-days' });
		const first = new Date(this.selectedYear, this.selectedMonth - 1, 1, 12);
		const cursor = new Date(first); cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
		const today = new Date();
		for (let index = 0; index < 42; index++) {
			const date = new Date(cursor); date.setDate(cursor.getDate() + index);
			const key = dateKey(date); const journal = journals.get(key);
			let cls = 'po-cal__day';
			if (date.getMonth() !== this.selectedMonth - 1) cls += ' is-out';
			if (date.getDay() === 0 || date.getDay() === 6) cls += ' is-weekend';
			if (sameDay(date, today)) cls += ' is-today';
			if (sameDay(date, this.selectedDate)) cls += ' is-sel';
			const day = days.createDiv({ cls }); day.createSpan({ cls: `po-cal__day-num${sameDay(date, today) ? ' is-today' : ''}`, text: String(date.getDate()) });
			const body = day.createDiv({ cls: 'po-cal__day-body mx-plan-calendar-day-body' }); body.createDiv({ cls: 'po-cal__slot' });
			if (journal) this.renderCalendarJournal(body, journal, 'month');
			day.addEventListener('click', () => { this.setSelection(date.getFullYear(), date.getMonth() + 1, date.getDate()); });
		}
	}

	private renderCalendarWeek(root: HTMLElement, journals: Map<string, JournalCalendarEntry>): void {
		const weekdays = root.createDiv({ cls: 'po-cal__weekdays' });
		for (const name of ['一', '二', '三', '四', '五', '六', '日']) weekdays.createSpan({ text: name });
		const cols = root.createDiv({ cls: 'po-cal__week' });
		const today = new Date();
		for (const date of this.weekDates()) {
			const key = dateKey(date); const tasks = tasksOnDate(this.plugin.embeddedTasks.all(), key); const journal = journals.get(key);
			const col = cols.createDiv({ cls: `po-cal__wcol${sameDay(date, today) ? ' is-today' : ''}${sameDay(date, this.selectedDate) ? ' is-sel' : ''}` });
			const head = col.createDiv({ cls: 'po-cal__wcol-hd' }); head.createSpan({ cls: 'po-cal__wcol-day', text: String(date.getDate()) }); head.createSpan({ cls: 'po-cal__wcol-name', text: `${date.getMonth() + 1}月` });
			if (journal) this.renderCalendarJournal(col, journal);
			for (const task of tasks) this.renderCalendarChip(col, task);
			col.addEventListener('click', () => { this.setSelection(date.getFullYear(), date.getMonth() + 1, date.getDate()); });
		}
	}

	private renderDayDetail(root: HTMLElement, journal?: JournalCalendarEntry): void {
		const detail = root.createDiv({ cls: 'po-cal__det' });
		const tasks = tasksOnDate(this.plugin.embeddedTasks.all(), dateKey(this.selectedDate));
		detail.createDiv({ cls: 'po-cal__det-ttl', text: `${this.selectedDate.getMonth() + 1} 月 ${this.selectedDate.getDate()} 日 · ${tasks.length} 项任务` });
		if (!tasks.length && !journal) { detail.createDiv({ cls: 'po-cal__det-empty', text: '当日暂无任务或日记' }); return; }
		const layout = detail.createDiv({ cls: `mx-day-detail-layout${tasks.length && journal ? ' is-split' : ''}` });
		if (tasks.length) {
			const taskPane = layout.createDiv({ cls: 'mx-day-detail-task-pane' });
			const groups = groupEmbeddedForDisplay(tasks);
			for (const category of TASK_DISPLAY_CATEGORIES) {
				if (!groups[category].length) continue;
				const section = taskPane.createDiv({ cls: 'mx-day-task-section' });
				section.createDiv({ cls: 'mx-day-task-section__title', text: TASK_DISPLAY_LABELS[category] });
				for (const task of groups[category]) this.renderTaskRow(section, task);
			}
		}
		if (journal) this.renderJournalDetail(layout.createDiv({ cls: 'mx-day-detail-journal-pane' }), journal);
	}

	private renderCalendarJournal(parent: HTMLElement, journal: JournalCalendarEntry, mode: 'month' | 'week' = 'week'): void {
		const row = parent.createDiv({
			cls: `po-cal__chip mx-calendar-journal-row${mode === 'month' ? ' is-month' : ''}${journal.titleSource === 'quick-note' ? ' is-quick-note' : ''}`,
			text: journal.title,
			attr: { title: journal.title },
		});
		if (mode === 'month' && journal.titleSource !== 'quick-note') this.fitMonthJournalTitle(row);
		row.addEventListener('click', event => { event.stopPropagation(); const [year, month, day] = journal.date.split('-').map(Number); this.setSelection(year!, month!, day!); });
	}

	private fitMonthJournalTitle(row: HTMLElement): void {
		requestAnimationFrame(() => {
			if (!row.isConnected) return;
			const lineHeight = Number.parseFloat(getComputedStyle(row).lineHeight) || 15;
			const availableLines = Math.max(1, Math.floor(row.clientHeight / lineHeight));
			row.style.setProperty('--mx-calendar-journal-lines', String(availableLines));
		});
	}

	private renderCalendarChip(parent: HTMLElement, task: EmbeddedTask): void {
		const chip = parent.createDiv({ cls: `po-cal__chip mx-calendar-task-chip${task.completed ? ' is-done' : ''}`, attr: { title: task.text } });
		chip.createSpan({ cls: 'mx-calendar-task-marker', text: taskDisplayMarker(task.sourceType) });
		chip.createSpan({ cls: 'mx-calendar-task-text', text: task.text });
	}

	private renderJournalDetail(parent: HTMLElement, journal: JournalCalendarEntry): void {
		const section = parent.createDiv({ cls: 'mx-day-journal-section' });
		section.createDiv({ cls: 'mx-day-task-section__title', text: '日记' });
		section.createDiv({ cls: 'mx-day-journal-title', text: journal.title });
		if (journal.quickNoteCount && journal.titleSource !== 'quick-note') section.createDiv({ cls: 'mx-day-journal-meta', text: `随时记 · ${journal.quickNoteCount}条` });
		if (journal.summary) section.createDiv({ cls: 'mx-day-journal-summary', text: journal.summary });
		const open = section.createEl('button', { cls: 'mx-inline-action mx-day-journal-open', text: '打开日记 →', attr: { type: 'button' } });
		open.addEventListener('click', () => { const file = this.app.vault.getAbstractFileByPath(journal.path); if (file instanceof TFile) void this.app.workspace.getLeaf('tab').openFile(file); });
	}

	private renderTaskRow(parent: HTMLElement, task: EmbeddedTask): void {
		const row = parent.createDiv({ cls: 'po-cal__task' });
		renderEmbeddedTaskCheckbox(row, task, this.plugin.embeddedTasks);
		const body = row.createDiv({ cls: 'mx-day-task-body' });
		body.createSpan({ cls: 'po-cal__task-name', text: task.text });
		const subtitle = taskSourceSubtitle(task, this.sourceLabels.get(task.sourceFile) ?? taskCalendarSourceLabel(task));
		if (subtitle) body.createSpan({ cls: 'mx-day-task-source', text: subtitle });
		row.addEventListener('click', () => { const file = this.app.vault.getAbstractFileByPath(task.sourceFile); if (file instanceof TFile) void this.app.workspace.getLeaf('tab').openFile(file); });
	}
}

/** Legacy compatibility wrapper for restored workspaces and old commands. */
export class PlanView extends ItemView {
	private shell?: WorkbenchShell;
	private renderer: PlanWorkspaceRenderer;
	constructor(leaf: WorkspaceLeaf, private plugin: Dashboard) {
		super(leaf);
		this.renderer = new PlanWorkspaceRenderer(this.app, plugin);
	}
	getViewType(): string { return PLAN_VIEW; }
	getDisplayText(): string { return '时迹'; }
	getIcon(): string { return 'calendar-range'; }
	getState() { return this.renderer.getState(); }
	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		await this.renderer.setState(state);
		await super.setState(state, result);
	}
	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty(); root.removeClass('ad-modal'); root.addClass('mx-plan-workspace-view');
		const page = root.createDiv({ cls: 'dashboard-plugin mx-plan-workspace' });
		renderLifeCompass(page, name => { void openDirection(this.app, name); });
		this.shell = new WorkbenchShell(this.plugin, page, action => this.plugin.navigateWorkbench(action, this.leaf), 'plan');
		this.addChild(this.shell);
		this.addChild(this.renderer);
		await this.renderer.activate(page.createDiv({ cls: 'po-container mx-plan-container' }));
	}
	async onClose(): Promise<void> {
		this.renderer.deactivate();
		this.removeChild(this.renderer);
		if (this.shell) this.removeChild(this.shell);
		this.shell = undefined;
	}
}
