import { Component, ItemView, MarkdownRenderer, Menu, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type { App, ViewStateResult } from 'obsidian';
import type Dashboard from '../main';
import type { EmbeddedTask } from '../data/embeddedTasks';
import { TASK_DISPLAY_CATEGORIES, TASK_DISPLAY_LABELS, groupEmbeddedForDisplay, taskDisplayMarker, taskSourceSubtitle } from '../data/embeddedTasks';
import type { PlanWorkspaceCard, PlanWorkspaceMode, PlanCalendarMode } from '../data/planWorkspace';
import { dateKey, incompleteTaskCountOnDate, readPlanWorkspace, taskCalendarSourceLabel, tasksOnDate } from '../data/planWorkspace';
import { isoWeek, planInfo } from '../data/planning';
import { WorkbenchShell } from '../components/workbench/WorkbenchShell';
import { renderLifeCompass } from '../components/workbench/LifeCompass';
import { scanLearning } from '../data/learningVault';
import { scanProjects } from '../data/projectVault';
import { processes } from '../data/processes';
import { processContentTypeLabel, taskSourceTypeLabel } from '../data/processContentTypes';
import { journalCalendarEntry, journalDateFromPath, journalInfo } from '../data/journal';
import type { JournalCalendarEntry } from '../data/journal';
import { renderEmbeddedTaskCheckbox } from '../components/tasks/EmbeddedTaskCheckbox';
import { scanLongTermPlans, setProcessLongTermPlan, updateLongTermPlanMarkdown } from '../data/longTermPlanVault';
import { appendLongTermStage, assignLongTermProcessToStage, deleteLongTermStage, ensureLongTermStageIds, longTermPlanDetailMetadata, longTermPlansForMonth, longTermPlansForYear, moveLongTermStage, normalizeLongTermProcessRef, removeLongTermProcessFromStages, toggleLongTermStage, updateLongTermPlanDirections, updateLongTermStage } from '../data/longTermPlans';
import type { LongTermPlan } from '../data/longTermPlans';
import type { Process } from '../data/processes';
import { hasProcessSchedule } from '../data/processes';
import { ConfirmActionModal, LongTermStageModal, StageProcessPickerModal } from './LongTermPlanPickerModal';
import { renderTaskProgressPill } from './ProcessTaskProgress';
import { ProcessTasksModal } from './ProcessTasksModal';
import { renderProcessRow } from './ProcessRow';
import { NarrativeDisclosure, narrativeMarkdown, updateNarrativeMarkdown } from '../data/longTermNarrative';
import { LongTermNarrativeModal } from './LongTermNarrativeModal';
import { LongTermPlanDirectionModal } from './LongTermPlanDirectionModal';
import { renderLongTermPlanSummaryRow } from './LongTermPlanRow';
import { renderTimeTraceMiniCalendar } from '../components/timeTrace/TimeTraceMiniCalendar';
import { focusDate, focusLabel, focusMatchesWeek, focusMonth, hasTimeTraceMarker, initialTimeTraceState, parseDateKey, selectDay, selectMonth, selectToday, selectWeek, shiftVisibleMonth } from '../data/timeTrace';
import type { TimeFocus, TimeTraceState } from '../data/timeTrace';

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
function compactProcessDate(value?: string | null): string { return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value!.slice(5).replace('-', '.') : '—'; }

/** Reusable time-trace content. The legacy PlanView and the main workbench router
 * mount this same renderer, so the business UI has a single implementation. */
export class PlanWorkspaceRenderer extends Component {
	private timeState: TimeTraceState = initialTimeTraceState();
	private mode: PlanWorkspaceMode = 'board';
	private calendarMode: PlanCalendarMode = 'month';
	private sourceLabels = new Map<string, string>();
	private workspaceEl?: HTMLElement;
	private generation = 0;
	private active = false;
	private sectionDisposers: Array<() => void> = [];
	private miniCalendarDisposer?: () => void;
	private selectedLongTermPlanId = '';
	private expandedLongTermPlanId = '';
	private expandedLongTermStageIds = new Set<string>();
	private quickTasks?: ProcessTasksModal;
	private narrativeDisclosure = new NarrativeDisclosure();

	constructor(public readonly app: App, private plugin: Dashboard, private navigation?: { openProcess(process: Process): void; openGantt(process: Process): void; locateProcess?(process: Process): void }) { super(); }
	getState() { return { selectedYear: this.timeState.visible.year, selectedMonth: this.timeState.visible.month, mode: this.mode, calendarMode: this.calendarMode, selectedDate: dateKey(focusDate(this.timeState)), selectedLongTermPlanId: this.selectedLongTermPlanId }; }
	async setState(state: Record<string, unknown>): Promise<void> {
		const year = Number.isInteger(state.selectedYear) && Number(state.selectedYear) > 0 ? Number(state.selectedYear) : this.timeState.visible.year;
		const month = Number.isInteger(state.selectedMonth) && Number(state.selectedMonth) >= 1 && Number(state.selectedMonth) <= 12 ? Number(state.selectedMonth) : this.timeState.visible.month;
		this.timeState = { ...this.timeState, visible: { year, month } };
		if (state.mode === 'board' || state.mode === 'longTermPlan' || state.mode === 'calendar' || state.mode === 'review') this.mode = state.mode;
		if (typeof state.selectedLongTermPlanId === 'string') this.selectedLongTermPlanId = state.selectedLongTermPlanId;
		if (state.calendarMode === 'month' || state.calendarMode === 'week') this.calendarMode = state.calendarMode;
		if (typeof state.selectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.selectedDate)) {
			const selected = parseDateKey(state.selectedDate);
			if (selected) this.timeState = selectDay(this.timeState, selected);
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
		this.miniCalendarDisposer?.(); this.miniCalendarDisposer = undefined;
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

	private setTimeState(state: TimeTraceState): void {
		this.timeState = state;
		if (state.focus.kind === 'month') this.calendarMode = 'month';
		if (state.focus.kind === 'week') this.calendarMode = 'week';
		void this.renderPlanContent();
	}
	private setDayFocus(date: Date): void { this.setTimeState(selectDay(this.timeState, date)); }
	private calendarDate(): Date { return focusDate(this.timeState); }
	async openLongTermPlan(id: string): Promise<void> { this.mode = 'longTermPlan'; this.selectedLongTermPlanId = id; if (this.workspaceEl) await this.renderPlanContent(); }
	private wireDisclosure(primary: HTMLButtonElement, chevron: HTMLButtonElement, toggleExpanded: () => void, syncExpanded: () => void): void {
		const activate = (event: MouseEvent) => { event.stopPropagation(); toggleExpanded(); syncExpanded(); };
		primary.onclick = activate;
		chevron.onclick = activate;
		syncExpanded();
	}

	private async renderPlanContent(): Promise<void> {
		const container = this.workspaceEl;
		if (!container) return;
		this.miniCalendarDisposer?.(); this.miniCalendarDisposer = undefined;
		const token = ++this.generation;
		const { year, month } = this.timeState.visible;
		const snapshot = this.mode === 'board'
			? await readPlanWorkspace(this.planFiles(), year, month)
			: undefined;
		const longTermPlans = this.mode === 'longTermPlan' ? await scanLongTermPlans(this.app) : [];
		if (token !== this.generation || container !== this.workspaceEl) return;
		container.empty();
		this.renderSidebar(container);
		const main = container.createDiv({ cls: 'po-main' });
		if (this.mode === 'board' && snapshot) this.renderBoard(main, snapshot);
		else if (this.mode === 'longTermPlan') await this.renderLongTermPlans(main, longTermPlans);
		else if (this.mode === 'calendar') await this.renderCalendar(main, token);
		else this.renderReview(main);
	}

	private markerResolver(): (focus: TimeFocus) => boolean {
		const dailyDates = new Set(this.app.vault.getMarkdownFiles().map(file => journalDateFromPath(file.path)).filter((date): date is string => !!date));
		const exists = (path: string) => this.app.vault.getAbstractFileByPath(path) instanceof TFile;
		const mode = this.mode === 'board' ? 'cycle' : this.mode === 'longTermPlan' ? 'longTerm' : this.mode;
		return focus => hasTimeTraceMarker(mode, focus, {
			planExists: (period, date) => exists(planInfo(period, date).path),
			journalExists: (period, date) => exists(journalInfo(period, date).path),
			dailyJournalExists: date => dailyDates.has(date),
		});
	}

	private renderSidebar(container: HTMLElement): void {
		const side = container.createDiv({ cls: 'po-sidebar' });
		const list = side.createDiv({ cls: 'po-sidebar__list' });
		for (const [mode, label] of [['board', '周期计划'], ['longTermPlan', '长期计划'], ['calendar', '综合日历'], ['review', '日记回顾']] as const) {
			const item = list.createDiv({ cls: `po-sidebar__item${this.mode === mode ? ' is-active' : ''}`, text: label, attr: { role: 'button', tabindex: '0' } });
			const selectMode = () => { this.mode = mode; void this.renderPlanContent(); };
			item.addEventListener('click', selectMode);
			item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectMode(); } });
		}
		list.createDiv({ cls: 'mx-time-trace-divider', attr: { 'aria-hidden': 'true' } });
		this.miniCalendarDisposer = renderTimeTraceMiniCalendar(list, { state: this.timeState, hasMarker: this.markerResolver(), onChange: state => this.setTimeState(state) });
	}

	private renderPlanCard(column: HTMLElement, card: PlanWorkspaceCard, focused = false): void {
		column.toggleClass('is-time-focus', focused);
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
		const { year, month } = this.timeState.visible;
		const toolbar = main.createDiv({ cls: 'po-toolbar mx-plan-toolbar' });
		toolbar.createSpan({ cls: 'mx-plan-title', text: '周期计划' });
		toolbar.createSpan({ cls: 'mx-plan-context', text: `${monthTitle(year, month)} · Q${snapshot.quarter}` });
		const top = main.createDiv({ cls: 'po-kanban mx-plan-summary' });
		for (const card of [snapshot.annual, snapshot.quarterly, snapshot.monthly]) {
			const column = top.createDiv({ cls: 'po-kanban__col' }); this.renderPlanCard(column, card, card.period === this.timeState.focus.kind);
		}
		const weeks = main.createDiv({ cls: 'po-kanban mx-plan-weeks' });
		for (const week of snapshot.weeks) {
			const focusIso = this.timeState.focus.kind === 'day' ? isoWeek(focusDate(this.timeState)) : undefined;
			const focused = focusMatchesWeek(this.timeState.focus, week.isoYear, week.week) || (!!focusIso && focusIso.year === week.isoYear && focusIso.week === week.week);
			const column = weeks.createDiv({ cls: `po-kanban__col${focused ? ' is-time-focus' : ''}` });
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
		main.createDiv({ cls: 'po-empty mx-plan-empty', text: `已选择：${focusLabel(this.timeState.focus)}` });
	}

	private async renderLongTermPlans(main: HTMLElement, plans: LongTermPlan[]): Promise<void> {
		const selected = plans.find(plan => plan.id === this.selectedLongTermPlanId);
		if (selected) {
			if (selected.stages.some(stage => !stage.id)) { await updateLongTermPlanMarkdown(this.app, selected, content => ensureLongTermStageIds(content)); await this.renderPlanContent(); return; }
			this.renderLongTermDetail(main, selected, plans); return;
		}
		this.selectedLongTermPlanId = '';
		const focus = this.timeState.focus;
		const month = focusMonth(this.timeState);
		const toolbar = main.createDiv({ cls: 'po-toolbar mx-plan-toolbar' }); toolbar.createSpan({ cls: 'mx-plan-title', text: '长期计划' });
		toolbar.createSpan({ cls: 'mx-plan-context', text: focus.kind === 'year' ? `${focus.year} 年` : `${month.year} 年 ${month.month} 月` });
		const visible = focus.kind === 'year' ? longTermPlansForYear(plans, focus.year) : longTermPlansForMonth(plans, month.year, month.month);
		const list = main.createDiv({ cls: 'po-tasklist mx-long-term-list' });
		if (!visible.length) { list.createDiv({ cls: 'po-empty mx-plan-empty', text: focus.kind === 'year' ? `${focus.year} 年暂无长期计划` : `${month.year} 年 ${month.month} 月暂无长期计划` }); return; }
		for (const plan of visible) {
			renderLongTermPlanSummaryRow(list, plan, () => { this.selectedLongTermPlanId = plan.id; void this.renderPlanContent(); });
		}
	}

	private processForRef(allProcesses: Process[], ref: string): Process | undefined { const normalized = normalizeLongTermProcessRef(ref); return allProcesses.find(process => normalizeLongTermProcessRef(process.sourceFile) === normalized); }
	private async assignProcessToStage(plan: LongTermPlan, stageId: string, process: Process): Promise<void> {
		const assign = async () => { if (process.longTermPlanId !== plan.id) await setProcessLongTermPlan(this.app, process, plan.id); await updateLongTermPlanMarkdown(this.app, plan, content => assignLongTermProcessToStage(content, process.sourceFile, process.name, stageId)); await this.renderPlanContent(); };
		if (process.longTermPlanId && process.longTermPlanId !== plan.id) { new ConfirmActionModal(this.app, '更改长期计划', `“${process.name}”已关联其他长期计划，是否更改为“${plan.name}”？`, '更改长期计划', assign).open(); return; }
		await assign();
	}
	private renderStageProcess(parent: HTMLElement, process: Process, plan: LongTermPlan, stageId: string): void {
		const scheduled = hasProcessSchedule({ startDate: process.startDate ?? null, endDate: process.dueDate ?? null });
		renderProcessRow(parent, { key: process.sourceFile, name: process.name, layout: 'inline', open: () => this.navigation?.locateProcess?.(process), fields: [
			{ key: 'meta', render: cell => { cell.createSpan({ text: `${process.category === 'learning' ? '学习' : '创作'} · ${processContentTypeLabel(process.contentType, true)} · ${process.status}` }); } },
			{ key: 'date', render: cell => { cell.createSpan({ text: scheduled ? `${compactProcessDate(process.startDate)} → ${compactProcessDate(process.dueDate)}` : '未排期' }); } },
			...(scheduled ? [{ key: 'schedule', render: (cell: HTMLElement) => { const schedule = cell.createEl('button', { cls: 'mx-inline-action', text: '查看排期 →' }); schedule.onclick = () => this.navigation?.openGantt(process); } }] : []),
			...(process.taskTotal > 0 ? [{ key: 'progress', render: (cell: HTMLElement) => { renderTaskProgressPill(cell, process.name, process.sourceFile, process.taskTotal, process.taskCompleted, () => { this.quickTasks?.close(); this.quickTasks = new ProcessTasksModal(this.app, this.plugin.embeddedTasks, { name: process.name, processType: process.processType, sourceFile: process.sourceFile, category: process.category, contentType: process.contentType }, () => this.navigation?.openProcess(process)); this.quickTasks.open(); }); } }] : []),
			{ key: 'menu', render: cell => {
		const actions = cell.createEl('button', { cls: 'mx-inline-action mx-detail-menu', text: '···', attr: { 'aria-label': `管理 ${process.name}` } });
		actions.onclick = event => { const menu = new Menu(); menu.addItem(item => item.setTitle('打开详情').onClick(() => this.navigation?.openProcess(process))); menu.addSeparator(); menu.addItem(item => item.setTitle('移动阶段').setIsLabel(true)); for (const stage of plan.stages) if (stage.id !== stageId) menu.addItem(item => item.setTitle(stage.text).onClick(() => { void updateLongTermPlanMarkdown(this.app, plan, content => assignLongTermProcessToStage(content, process.sourceFile, process.name, stage.id)).then(() => this.renderPlanContent()); }));
			menu.addSeparator(); menu.addItem(item => item.setTitle('移出阶段').onClick(() => { void updateLongTermPlanMarkdown(this.app, plan, content => removeLongTermProcessFromStages(content, process.sourceFile)).then(() => this.renderPlanContent()); }));
			menu.addItem(item => item.setTitle('取消长期计划关联').onClick(() => { void updateLongTermPlanMarkdown(this.app, plan, content => removeLongTermProcessFromStages(content, process.sourceFile)).then(() => setProcessLongTermPlan(this.app, process)).then(() => this.renderPlanContent()); })); menu.showAtMouseEvent(event); };
			} },
		] });
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
		const toolbar = main.createDiv({ cls: 'po-topbar' }); const back = toolbar.createEl('button', { cls: 'po-cal__seg-btn', text: '← 返回长期计划列表' }); back.onclick = () => { this.selectedLongTermPlanId=''; void this.renderPlanContent(); }; const planMenu = toolbar.createEl('button', { cls: 'mx-inline-action mx-detail-menu mx-long-term-plan-menu', text: '···', attr: { 'aria-label': `管理长期计划 ${plan.name}` } }); planMenu.onclick = event => { const menu = new Menu(); menu.addItem(item => item.setTitle('编辑长期计划').onClick(() => new LongTermPlanDirectionModal(this.app, plan.directions, async directions => { await updateLongTermPlanMarkdown(this.app, plan, raw => updateLongTermPlanDirections(raw, directions)); await this.renderPlanContent(); }).open())); menu.showAtMouseEvent(event); };
		const summary = main.createDiv({ cls: 'ad-update-block mx-long-term-summary' }); summary.createEl('h1', { cls: 'ad-modal-title', text: plan.name });
		summary.createEl('p', { cls: 'ad-modal-hint', text: longTermPlanDetailMetadata(plan) });
		const detailContent = main.createDiv({ cls: 'mx-long-term-detail-content' });
		const narrative = detailContent.createDiv({ cls: 'wb-section mx-long-term-narrative' });
		this.narrativeDisclosure.selectPlan(plan.id);
		for (const [title, value] of [['为什么做', plan.why || plan.goal], ['希望达到的状态', plan.desiredState], ['完成标准', plan.completionCriteria]] as const) {
			const section = narrative.createDiv({ cls: 'mx-long-term-narrative__section' });
			const header = section.createDiv({ cls: 'mx-long-term-stage' });
			const label = header.createEl('button', { cls: 'mx-inline-action mx-narrative-title', text: title });
			const menuButton = header.createEl('button', { cls: 'mx-inline-action mx-detail-menu', text: '···', attr: { 'aria-label': `管理${title}` } });
			const toggle = header.createEl('button', { cls: 'mx-inline-action mx-long-term-stage-toggle', attr: { 'aria-label': `展开或收起${title}` } });
			const body = section.createDiv({ cls: 'mx-narrative-body' });
			const sync = () => { const expanded = this.narrativeDisclosure.isOpen(title); body.hidden = !expanded; toggle.textContent = expanded ? '⌄' : '›'; toggle.setAttribute('aria-expanded', String(expanded)); label.setAttribute('aria-expanded', String(expanded)); };
			this.wireDisclosure(label, toggle, () => this.narrativeDisclosure.toggle(title), sync);
			const file = this.app.vault.getAbstractFileByPath(plan.path);
			if (file instanceof TFile) void this.app.vault.cachedRead(file).then(raw => { if (body.isConnected) this.renderLongTermMarkdown(body, narrativeMarkdown(raw, title) || value, plan.path); });
			menuButton.onclick = event => { const menu = new Menu(); menu.addItem(item => item.setTitle('编辑内容').onClick(async () => {
				if (!(file instanceof TFile)) return;
				const original = narrativeMarkdown(await this.app.vault.read(file), title);
				new LongTermNarrativeModal(this.app, title, original, async next => { await updateLongTermPlanMarkdown(this.app, plan, raw => updateNarrativeMarkdown(raw, title, next, original)); await this.renderPlanContent(); }).open();
			})); menu.showAtMouseEvent(event); };
		}
		const stages=detailContent.createDiv({cls:'ad-update-block mx-long-term-stages'}); const stageHead=stages.createDiv({cls:'ad-card__head mx-detail-task-head'}); stageHead.createEl('h2',{cls:'ad-modal-title',text:'阶段推进'}); stageHead.createEl('button',{cls:'mx-inline-action',text:'＋ 添加阶段'}).onclick=()=>new LongTermStageModal(this.app,async(name,note)=>{const stageId=crypto.randomUUID();await updateLongTermPlanMarkdown(this.app,plan,content=>updateLongTermStage(appendLongTermStage(content,name,stageId),stageId,name,note));await this.renderPlanContent();}).open();
		if(!plan.stages.length) stages.createDiv({cls:'po-empty mx-plan-empty',text:'尚未添加阶段'});
		const assigned = new Set<string>();
		const currentStageId=plan.stages.find(stage=>!stage.completed)?.id;
		if(this.expandedLongTermPlanId!==plan.id){this.expandedLongTermPlanId=plan.id;this.expandedLongTermStageIds.clear();if(currentStageId)this.expandedLongTermStageIds.add(currentStageId);}
		for(const stage of plan.stages){
			const refs=stage.processRefs.map(ref=>this.processForRef(allProcesses,ref)).filter((process):process is Process=>!!process&&process.longTermPlanId===plan.id);for(const process of refs)assigned.add(normalizeLongTermProcessRef(process.sourceFile));
			const expanded=this.expandedLongTermStageIds.has(stage.id);const row=stages.createDiv({cls:`mx-long-term-stage-row${expanded?' is-expanded':''}`});const title=row.createDiv({cls:'mx-long-term-stage'});const main=title.createDiv({cls:'mx-long-term-stage-main'});const control=main.createEl('label',{cls:'mx-embedded-task-checkbox'});const check=control.createEl('input',{cls:'mx-embedded-task-check',attr:{type:'checkbox','aria-label':`${stage.completed?'取消完成':'完成'} ${stage.text}`}});check.checked=stage.completed;control.createSpan({cls:'po-check mx-embedded-task-check-visual',attr:{'aria-hidden':'true'}});control.onclick=event=>event.stopPropagation();const disclosure=main.createEl('button',{cls:'mx-inline-action mx-long-term-stage-disclosure',attr:{'aria-label':`展开或收起阶段 ${stage.text}`}});disclosure.createSpan({cls:'mx-long-term-stage__number',text:String(stage.index+1).padStart(2,'0')});disclosure.createSpan({cls:'mx-long-term-stage__title',text:stage.text});if(stage.id===currentStageId)disclosure.createSpan({cls:'po-chip mx-long-term-current',text:'当前'});check.onchange=()=>{check.disabled=true;void updateLongTermPlanMarkdown(this.app,plan,content=>toggleLongTermStage(content,stage.id,check.checked)).catch(error=>{check.checked=stage.completed;new Notice(String(error));}).finally(()=>{check.disabled=false;});};
			const actions=title.createDiv({cls:'mx-long-term-stage-actions'});const stageMenu=actions.createEl('button',{cls:'mx-inline-action mx-long-term-stage-menu',text:'···',attr:{'aria-label':`管理阶段 ${stage.text}`}});stageMenu.onclick=event=>{event.stopPropagation();const menu=new Menu();menu.addItem(item=>item.setTitle('编辑阶段').onClick(()=>new LongTermStageModal(this.app,async(name,note)=>{await updateLongTermPlanMarkdown(this.app,plan,content=>updateLongTermStage(content,stage.id,name,note));await this.renderPlanContent();},{name:stage.text,note:stage.note}).open()));menu.addSeparator();menu.addItem(item=>item.setTitle('调整顺序').setIsLabel(true));if(stage.index>0)menu.addItem(item=>item.setTitle('上移').onClick(()=>{void updateLongTermPlanMarkdown(this.app,plan,content=>moveLongTermStage(content,stage.id,-1)).then(()=>this.renderPlanContent());}));if(stage.index<plan.stages.length-1)menu.addItem(item=>item.setTitle('下移').onClick(()=>{void updateLongTermPlanMarkdown(this.app,plan,content=>moveLongTermStage(content,stage.id,1)).then(()=>this.renderPlanContent());}));menu.addSeparator();menu.addItem(item=>item.setTitle('删除阶段').setWarning(true).onClick(()=>{const remove=async()=>{await updateLongTermPlanMarkdown(this.app,plan,content=>deleteLongTermStage(content,stage.id));await this.renderPlanContent();};if(stage.processRefs.length)new ConfirmActionModal(this.app,'删除阶段',`该阶段包含 ${stage.processRefs.length} 个关联进程。删除后这些进程将移到“未分配”。`,'删除并移到未分配',remove).open();else void remove();}));menu.showAtMouseEvent(event);};
			const toggle=actions.createEl('button',{cls:'mx-inline-action mx-long-term-stage-toggle',attr:{'aria-label':`展开或收起阶段 ${stage.text}`}});
			const details=row.createDiv({cls:'mx-long-term-stage-details'});
			const sync=()=>{const next=this.expandedLongTermStageIds.has(stage.id);details.hidden=!next;row.toggleClass('is-expanded',next);toggle.textContent=next?'⌄':'›';toggle.setAttribute('aria-expanded',String(next));toggle.setAttribute('aria-label',`${next?'收起':'展开'}阶段 ${stage.text}`);disclosure.setAttribute('aria-expanded',String(next));};
			this.wireDisclosure(disclosure,toggle,()=>{if(this.expandedLongTermStageIds.has(stage.id))this.expandedLongTermStageIds.delete(stage.id);else this.expandedLongTermStageIds.add(stage.id);},sync);
			if(stage.note){const note=details.createDiv({cls:'mx-long-term-stage-note'});this.renderLongTermMarkdown(note,stage.note,plan.path);}
			const processPane=details.createDiv({cls:'mx-long-term-stage-processes'});for(const process of refs)this.renderStageProcess(processPane,process,plan,stage.id);const add=processPane.createEl('button',{cls:'mx-inline-action mx-long-term-process-add',text:'＋ 添加进程'});add.onclick=()=>{const candidates=allProcesses.filter(process=>process.longTermPlanId!==plan.id||!mappedPaths.has(normalizeLongTermProcessRef(process.sourceFile)));new StageProcessPickerModal(this.app,candidates,plans,plan.id,process=>this.assignProcessToStage(plan,stage.id,process)).open();};
		}
		const unassigned=linked.filter(process=>!assigned.has(normalizeLongTermProcessRef(process.sourceFile)));if(unassigned.length){const loose=detailContent.createDiv({cls:'ad-update-block mx-long-term-unassigned'});loose.createEl('h2',{cls:'ad-modal-title',text:'未分配'});for(const process of unassigned)this.renderUnassignedProcess(loose,process,plan);}
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
		const { year, month } = this.timeState.visible;
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
			btn.addEventListener('click', () => { this.calendarMode = mode; this.setTimeState(mode === 'month' ? selectMonth(this.timeState) : selectWeek(this.timeState, this.calendarDate())); });
		}
		bar.createSpan({ cls: 'po-cal__ttl', text: this.calendarMode === 'month' ? monthTitle(year, month) : this.weekTitle() });
		const nav = bar.createDiv({ cls: 'po-cal__nav' });
		const prev = nav.createEl('button', { cls: 'po-cal__btn', text: '‹' });
		const today = nav.createEl('button', { cls: 'po-cal__btn', text: '今天' });
		const next = nav.createEl('button', { cls: 'po-cal__btn', text: '›' });
		prev.addEventListener('click', () => this.moveCalendar(-1)); today.addEventListener('click', () => this.setTimeState(selectToday(this.timeState))); next.addEventListener('click', () => this.moveCalendar(1));
		if (this.calendarMode === 'month') this.renderCalendarMonth(root, journals, tasks); else this.renderCalendarWeek(root, journals);
		const selectedDate = this.calendarDate();
		this.renderDayDetail(root, selectedDate, journals.get(dateKey(selectedDate)));
	}

	private moveCalendar(direction: -1 | 1): void {
		if (this.calendarMode === 'month') {
			this.setTimeState(shiftVisibleMonth(this.timeState, direction));
		} else {
			const next = this.calendarDate(); next.setDate(next.getDate() + direction * 7); this.setTimeState(selectWeek({ ...this.timeState, visible: { year: next.getFullYear(), month: next.getMonth() + 1 } }, next));
		}
	}

	private weekDates(): Date[] {
		const start = this.calendarDate(); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
		return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
	}
	private weekTitle(): string { const dates = this.weekDates(); return `${dayLabel(dates[0]!)}–${dayLabel(dates[6]!)}`; }

	private renderCalendarMonth(root: HTMLElement, journals: Map<string, JournalCalendarEntry>, tasks: EmbeddedTask[]): void {
		const { year, month } = this.timeState.visible;
		const weekdays = root.createDiv({ cls: 'po-cal__weekdays' });
		for (const name of ['一', '二', '三', '四', '五', '六', '日']) weekdays.createSpan({ text: name });
		const days = root.createDiv({ cls: 'po-cal__days mx-plan-calendar-days' });
		const first = new Date(year, month - 1, 1, 12);
		const cursor = new Date(first); cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
		const today = new Date();
		for (let index = 0; index < 42; index++) {
			const date = new Date(cursor); date.setDate(cursor.getDate() + index);
			const key = dateKey(date); const journal = journals.get(key); const incompleteCount = incompleteTaskCountOnDate(tasks, key);
			let cls = 'po-cal__day';
			if (date.getFullYear() !== year || date.getMonth() !== month - 1) cls += ' is-out';
			if (date.getDay() === 0 || date.getDay() === 6) cls += ' is-weekend';
			if (sameDay(date, today)) cls += ' is-today';
			if (this.timeState.focus.kind === 'day' && this.timeState.focus.date === key) cls += ' is-sel';
			if (incompleteCount > 0) cls += ' has-incomplete-tasks';
			const day = days.createDiv({ cls }); day.createSpan({ cls: `po-cal__day-num${sameDay(date, today) ? ' is-today' : ''}`, text: String(date.getDate()) });
			const body = day.createDiv({ cls: 'po-cal__day-body mx-plan-calendar-day-body' }); body.createDiv({ cls: 'po-cal__slot' });
			if (journal) this.renderCalendarJournal(body, journal, 'month');
			if (incompleteCount > 0) day.createSpan({ cls: 'mx-plan-calendar-incomplete', text: `☐ ${incompleteCount}`, attr: { 'aria-label': `${incompleteCount} 项未完成任务` } });
			day.addEventListener('click', () => this.setDayFocus(date));
		}
	}

	private renderCalendarWeek(root: HTMLElement, journals: Map<string, JournalCalendarEntry>): void {
		const weekdays = root.createDiv({ cls: 'po-cal__weekdays' });
		for (const name of ['一', '二', '三', '四', '五', '六', '日']) weekdays.createSpan({ text: name });
		const cols = root.createDiv({ cls: 'po-cal__week' });
		const today = new Date();
		for (const date of this.weekDates()) {
			const key = dateKey(date); const tasks = tasksOnDate(this.plugin.embeddedTasks.all(), key); const journal = journals.get(key);
			const col = cols.createDiv({ cls: `po-cal__wcol${sameDay(date, today) ? ' is-today' : ''}${this.timeState.focus.kind === 'day' && this.timeState.focus.date === key ? ' is-sel' : ''}` });
			const head = col.createDiv({ cls: 'po-cal__wcol-hd' }); head.createSpan({ cls: 'po-cal__wcol-day', text: String(date.getDate()) }); head.createSpan({ cls: 'po-cal__wcol-name', text: `${date.getMonth() + 1}月` });
			if (journal) this.renderCalendarJournal(col, journal);
			for (const task of tasks) this.renderCalendarChip(col, task);
			col.addEventListener('click', () => this.setDayFocus(date));
		}
	}

	private renderDayDetail(root: HTMLElement, selectedDate: Date, journal?: JournalCalendarEntry): void {
		const detail = root.createDiv({ cls: 'po-cal__det' });
		const tasks = tasksOnDate(this.plugin.embeddedTasks.all(), dateKey(selectedDate));
		detail.createDiv({ cls: 'po-cal__det-ttl', text: `${selectedDate.getMonth() + 1} 月 ${selectedDate.getDate()} 日 · ${tasks.length} 项任务` });
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
		row.addEventListener('click', event => { event.stopPropagation(); const date = parseDateKey(journal.date); if (date) this.setDayFocus(date); });
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
		renderLifeCompass(page, name => { void this.plugin.openWorkbenchDirection(name, this.leaf); });
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
