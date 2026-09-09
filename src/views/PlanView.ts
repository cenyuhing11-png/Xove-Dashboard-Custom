import { Component, ItemView, MarkdownRenderer, Menu, Notice, TFile, WorkspaceLeaf } from 'obsidian';
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
import { processContentTypeLabel, taskSourceTypeLabel } from '../data/processContentTypes';
import { journalCalendarEntry, journalDateFromPath } from '../data/journal';
import type { JournalCalendarEntry } from '../data/journal';
import { renderEmbeddedTaskCheckbox } from '../components/tasks/EmbeddedTaskCheckbox';
import { scanLongTermPlans, setProcessLongTermPlan, updateLongTermPlanMarkdown } from '../data/longTermPlanVault';
import { appendLongTermStage, assignLongTermProcessToStage, deleteLongTermStage, ensureLongTermStageIds, longTermMonths, longTermPlansForMonth, longTermStageProgress, moveLongTermStage, normalizeLongTermProcessRef, removeLongTermProcessFromStages, toggleLongTermStage, updateLongTermStage } from '../data/longTermPlans';
import type { LongTermPlan } from '../data/longTermPlans';
import type { Process } from '../data/processes';
import { hasProcessSchedule } from '../data/processes';
import { ConfirmActionModal, LongTermStageModal, StageProcessPickerModal } from './LongTermPlanPickerModal';
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
		else if (this.mode === 'longTermPlan') await this.renderLongTermPlans(main, longTermPlans);
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

	private async renderLongTermPlans(main: HTMLElement, plans: LongTermPlan[]): Promise<void> {
		const selected = plans.find(plan => plan.id === this.selectedLongTermPlanId);
		if (selected) {
			if (selected.stages.some(stage => !stage.id)) { await updateLongTermPlanMarkdown(this.app, selected, content => ensureLongTermStageIds(content)); await this.renderPlanContent(); return; }
			this.renderLongTermDetail(main, selected, plans); return;
		}
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

	private processForRef(allProcesses: Process[], ref: string): Process | undefined { const normalized = normalizeLongTermProcessRef(ref); return allProcesses.find(process => normalizeLongTermProcessRef(process.sourceFile) === normalized); }
	private async assignProcessToStage(plan: LongTermPlan, stageId: string, process: Process): Promise<void> {
		const assign = async () => { if (process.longTermPlanId !== plan.id) await setProcessLongTermPlan(this.app, process, plan.id); await updateLongTermPlanMarkdown(this.app, plan, content => assignLongTermProcessToStage(content, process.sourceFile, process.name, stageId)); await this.renderPlanContent(); };
		if (process.longTermPlanId && process.longTermPlanId !== plan.id) { new ConfirmActionModal(this.app, '更改长期计划', `“${process.name}”已关联其他长期计划，是否更改为“${plan.name}”？`, '更改长期计划', assign).open(); return; }
		await assign();
	}
	private renderStageProcess(parent: HTMLElement, process: Process, plan: LongTermPlan, stageId: string): void {
		const row = parent.createDiv({ cls: 'wb-entry mx-long-term-process' }); const body = row.createDiv({ cls: 'mx-long-term-process__body' });
		const name = body.createEl('button', { cls: 'mx-inline-action wb-entry__label', text: process.name }); name.onclick = () => this.navigation?.openProcess(process);
		body.createDiv({ cls: 'ad-modal-hint', text: `${process.category === 'learning' ? '学习' : '创作'} · ${processContentTypeLabel(process.contentType, true)} · ${process.status}` });
		body.createDiv({ cls: 'ad-modal-hint', text: process.startDate || process.dueDate ? `${process.startDate || '未设置'} — ${process.dueDate || '未设置'}` : '未排期' });
		renderTaskProgressPill(row, process.name, process.sourceFile, process.taskTotal, process.taskCompleted, () => { this.quickTasks?.close(); this.quickTasks = new ProcessTasksModal(this.app, this.plugin.embeddedTasks, { name: process.name, processType: process.processType, sourceFile: process.sourceFile, category: process.category, contentType: process.contentType }, () => this.navigation?.openProcess(process)); this.quickTasks.open(); });
		const actions = row.createEl('button', { cls: 'mx-inline-action', text: '···', attr: { 'aria-label': `管理 ${process.name}` } });
		actions.onclick = event => { const menu = new Menu(); menu.addItem(item => item.setTitle('移动阶段').setIsLabel(true)); for (const stage of plan.stages) if (stage.id !== stageId) menu.addItem(item => item.setTitle(stage.text).onClick(() => { void updateLongTermPlanMarkdown(this.app, plan, content => assignLongTermProcessToStage(content, process.sourceFile, process.name, stage.id)).then(() => this.renderPlanContent()); }));
			menu.addSeparator(); menu.addItem(item => item.setTitle('移出阶段').onClick(() => { void updateLongTermPlanMarkdown(this.app, plan, content => removeLongTermProcessFromStages(content, process.sourceFile)).then(() => this.renderPlanContent()); }));
			menu.addItem(item => item.setTitle('取消长期计划关联').onClick(() => { void updateLongTermPlanMarkdown(this.app, plan, content => removeLongTermProcessFromStages(content, process.sourceFile)).then(() => setProcessLongTermPlan(this.app, process)).then(() => this.renderPlanContent()); })); menu.showAtMouseEvent(event); };
		if (hasProcessSchedule({ startDate: process.startDate ?? null, endDate: process.dueDate ?? null })) { const schedule = body.createEl('button', { cls: 'mx-inline-action', text: '查看排期 →' }); schedule.onclick = () => this.navigation?.openGantt(process); }
	}
	private renderUnassignedProcess(parent: HTMLElement, process: Process, plan: LongTermPlan): void {
		const row = parent.createDiv({ cls: 'wb-entry mx-long-term-process' }); const body = row.createDiv({ cls: 'mx-long-term-process__body' }); const name = body.createEl('button', { cls: 'mx-inline-action wb-entry__label', text: process.name }); name.onclick = () => this.navigation?.openProcess(process); body.createDiv({ cls: 'ad-modal-hint', text: `${process.category === 'learning' ? '学习' : '创作'} · ${processContentTypeLabel(process.contentType, true)} · ${process.status} · ${process.taskCompleted} / ${process.taskTotal}` });
		const assign = row.createEl('button', { cls: 'mx-inline-action', text: '移入阶段 ▾' }); assign.onclick = event => { const menu = new Menu(); for (const stage of plan.stages) menu.addItem(item => item.setTitle(stage.text).onClick(() => { void updateLongTermPlanMarkdown(this.app, plan, content => assignLongTermProcessToStage(content, process.sourceFile, process.name, stage.id)).then(() => this.renderPlanContent()); })); menu.showAtMouseEvent(event); };
		const unlink = row.createEl('button', { cls: 'mx-inline-action', text: '取消关联' }); unlink.onclick = () => { void updateLongTermPlanMarkdown(this.app, plan, content => removeLongTermProcessFromStages(content, process.sourceFile)).then(() => setProcessLongTermPlan(this.app, process)).then(() => this.renderPlanContent()); };
	}
	private renderLongTermMarkdown(parent: HTMLElement, markdown: string, sourcePath: string, emptyText = ''): void {
		if (!markdown.trim()) { if (emptyText) parent.createDiv({ cls: 'ad-modal-hint', text: emptyText }); return; }
		const content = parent.createDiv({ cls: 'mx-long-term-markdown markdown-rendered' });
		void MarkdownRenderer.render(this.app, markdown, content, sourcePath, this);
	}
	private renderLongTermDetail(main: HTMLElement, plan: LongTermPlan, plans: LongTermPlan[]): void {
		const allProcesses = processes(scanLearning(this.app), scanProjects(this.app), this.plugin.embeddedTasks.all());
		const linked = allProcesses.filter(process => process.longTermPlanId === plan.id);
		const mapped = plan.stages.flatMap(stage => stage.processRefs.map(ref => this.processForRef(allProcesses, ref))).filter((process): process is Process => !!process && process.longTermPlanId === plan.id);
		const mappedPaths = new Set(mapped.map(process => normalizeLongTermProcessRef(process.sourceFile)));
		const toolbar = main.createDiv({ cls: 'po-topbar' }); const back = toolbar.createEl('button', { cls: 'po-cal__seg-btn', text: '← 返回长期计划列表' }); back.onclick = () => { this.selectedLongTermPlanId=''; void this.renderPlanContent(); };
		const summary = main.createDiv({ cls: 'ad-update-block mx-long-term-summary' }); summary.createEl('h1', { cls: 'ad-modal-title', text: plan.name });
		const progress = longTermStageProgress(plan.stages); summary.createEl('p', { cls: 'ad-modal-hint', text: `${plan.startMonth.replace('-','.')} — ${plan.endMonth.replace('-','.')} · 预计 ${longTermMonths(plan.startMonth,plan.endMonth)} 个月 · ${plan.status} · 阶段进度 ${progress.completed} / ${progress.total}` });
		const directions=[...new Set(mapped.map(process=>process.direction).filter(Boolean))]; if(directions.length) summary.createEl('p',{cls:'ad-modal-hint',text:`涉及：${directions.join(' · ')}`});
		const narrative = main.createDiv({ cls: 'wb-section mx-long-term-narrative' });
		for (const [title, value] of [['为什么做', plan.why || plan.goal], ['希望达到的状态', plan.desiredState], ['完成标准', plan.completionCriteria]] as const) {
			const section = narrative.createDiv({ cls: 'mx-long-term-narrative__section' }); section.createEl('h2', { cls: 'ad-modal-title', text: title });
			this.renderLongTermMarkdown(section, value, plan.path, '尚未填写');
		}
		const stages=main.createDiv({cls:'ad-update-block mx-long-term-stages'}); const stageHead=stages.createDiv({cls:'ad-card__head mx-detail-task-head'}); stageHead.createEl('h2',{cls:'ad-modal-title',text:'阶段推进'}); stageHead.createEl('button',{cls:'mx-inline-action',text:'＋ 添加阶段'}).onclick=()=>new LongTermStageModal(this.app,async(name,note)=>{const stageId=crypto.randomUUID();await updateLongTermPlanMarkdown(this.app,plan,content=>updateLongTermStage(appendLongTermStage(content,name,stageId),stageId,name,note));await this.renderPlanContent();}).open();
		if(!plan.stages.length) stages.createDiv({cls:'po-empty mx-plan-empty',text:'尚未添加阶段'});
		const assigned = new Set<string>();
		const currentStageId=plan.stages.find(stage=>!stage.completed)?.id;
		for(const stage of plan.stages){const row=stages.createDiv({cls:'mx-long-term-stage-row'});const stagePane=row.createDiv({cls:'mx-long-term-stage-pane'});const title=stagePane.createDiv({cls:'mx-long-term-stage'});const control=title.createEl('label',{cls:'mx-embedded-task-checkbox'});const check=control.createEl('input',{cls:'mx-embedded-task-check',attr:{type:'checkbox','aria-label':`${stage.completed?'取消完成':'完成'} ${stage.text}`}});check.checked=stage.completed;control.createSpan({cls:'po-check mx-embedded-task-check-visual',attr:{'aria-hidden':'true'}});title.createSpan({cls:'mx-long-term-stage__title',text:`${String(stage.index+1).padStart(2,'0')}  ${stage.text}`});if(stage.id===currentStageId)title.createSpan({cls:'po-chip mx-long-term-current',text:'当前'});check.onchange=()=>{check.disabled=true;void updateLongTermPlanMarkdown(this.app,plan,content=>toggleLongTermStage(content,stage.id,check.checked)).catch(error=>{check.checked=stage.completed;new Notice(String(error));}).finally(()=>{check.disabled=false;});};
			const stageMenu=title.createEl('button',{cls:'mx-inline-action mx-long-term-stage-menu',text:'···',attr:{'aria-label':`管理阶段 ${stage.text}`}});stageMenu.onclick=event=>{const menu=new Menu();menu.addItem(item=>item.setTitle('编辑阶段').onClick(()=>new LongTermStageModal(this.app,async(name,note)=>{await updateLongTermPlanMarkdown(this.app,plan,content=>updateLongTermStage(content,stage.id,name,note));await this.renderPlanContent();},{name:stage.text,note:stage.note}).open()));menu.addSeparator();menu.addItem(item=>item.setTitle('调整顺序').setIsLabel(true));if(stage.index>0)menu.addItem(item=>item.setTitle('上移').onClick(()=>{void updateLongTermPlanMarkdown(this.app,plan,content=>moveLongTermStage(content,stage.id,-1)).then(()=>this.renderPlanContent());}));if(stage.index<plan.stages.length-1)menu.addItem(item=>item.setTitle('下移').onClick(()=>{void updateLongTermPlanMarkdown(this.app,plan,content=>moveLongTermStage(content,stage.id,1)).then(()=>this.renderPlanContent());}));menu.addSeparator();menu.addItem(item=>item.setTitle('删除阶段').setWarning(true).onClick(()=>{const remove=async()=>{await updateLongTermPlanMarkdown(this.app,plan,content=>deleteLongTermStage(content,stage.id));await this.renderPlanContent();};if(stage.processRefs.length)new ConfirmActionModal(this.app,'删除阶段',`该阶段包含 ${stage.processRefs.length} 个关联进程。删除后这些进程将移到“未分配”。`,'删除并移到未分配',remove).open();else void remove();}));menu.showAtMouseEvent(event);};
			if(stage.note){const note=stagePane.createDiv({cls:'mx-long-term-stage-note'});this.renderLongTermMarkdown(note,stage.note,plan.path);}
			const refs=stage.processRefs.map(ref=>this.processForRef(allProcesses,ref)).filter((process):process is Process=>!!process&&process.longTermPlanId===plan.id); for(const process of refs)assigned.add(normalizeLongTermProcessRef(process.sourceFile));
			const processPane=row.createDiv({cls:'mx-long-term-stage-processes'});const processHead=processPane.createDiv({cls:'mx-long-term-process-head'});processHead.createSpan({cls:'ad-modal-label',text:'关联进程'});const add=processHead.createEl('button',{cls:'mx-inline-action',text:'＋ 添加进程'});add.onclick=()=>{const candidates=allProcesses.filter(process=>process.longTermPlanId!==plan.id||!mappedPaths.has(normalizeLongTermProcessRef(process.sourceFile)));new StageProcessPickerModal(this.app,candidates,plans,plan.id,process=>this.assignProcessToStage(plan,stage.id,process)).open();};if(!refs.length)processPane.createDiv({cls:'wb-empty mx-long-term-stage-empty',text:'暂无进程'});for(const process of refs)this.renderStageProcess(processPane,process,plan,stage.id);}
		const unassigned=linked.filter(process=>!assigned.has(normalizeLongTermProcessRef(process.sourceFile)));if(unassigned.length){const loose=main.createDiv({cls:'ad-update-block mx-long-term-unassigned'});loose.createEl('h2',{cls:'ad-modal-title',text:'未分配'});for(const process of unassigned)this.renderUnassignedProcess(loose,process,plan);}
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
