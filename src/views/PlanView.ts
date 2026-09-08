import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type { App, ViewStateResult } from 'obsidian';
import type Dashboard from '../main';
import type { EmbeddedTask } from '../data/embeddedTasks';
import { TASK_DISPLAY_CATEGORIES, TASK_DISPLAY_LABELS, groupEmbeddedForDisplay, taskDisplayMarker } from '../data/embeddedTasks';
import type { PlanWorkspaceCard, PlanWorkspaceMode, PlanCalendarMode } from '../data/planWorkspace';
import { dateKey, localPlanSelection, readPlanWorkspace, taskCalendarCategory, taskCalendarSourceLabel, tasksOnDate } from '../data/planWorkspace';
import { planInfo } from '../data/planning';
import { WorkbenchShell } from '../components/workbench/WorkbenchShell';
import { renderLifeCompass } from '../components/workbench/LifeCompass';
import { openDirection } from './DirectionView';
import { scanLearning } from '../data/learningVault';
import { scanProjects } from '../data/projectVault';
import { processes } from '../data/processes';
import { taskSourceTypeLabel } from '../data/processContentTypes';

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

export class PlanView extends ItemView {
	private selectedYear = localPlanSelection().year;
	private selectedMonth = localPlanSelection().month;
	private mode: PlanWorkspaceMode = 'board';
	private calendarMode: PlanCalendarMode = 'month';
	private selectedDate = new Date(this.selectedYear, this.selectedMonth - 1, new Date().getDate(), 12);
	private sourceLabels = new Map<string, string>();
	private shell?: WorkbenchShell;
	private workspaceEl?: HTMLElement;
	private generation = 0;

	constructor(leaf: WorkspaceLeaf, private plugin: Dashboard) { super(leaf); }
	getViewType(): string { return PLAN_VIEW; }
	getDisplayText(): string { return '时迹'; }
	getIcon(): string { return 'calendar-range'; }
	getState() { return { selectedYear: this.selectedYear, selectedMonth: this.selectedMonth, mode: this.mode, calendarMode: this.calendarMode, selectedDate: dateKey(this.selectedDate) }; }
	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		if (Number.isInteger(state.selectedYear) && Number(state.selectedYear) > 0) this.selectedYear = Number(state.selectedYear);
		if (Number.isInteger(state.selectedMonth) && Number(state.selectedMonth) >= 1 && Number(state.selectedMonth) <= 12) this.selectedMonth = Number(state.selectedMonth);
		if (state.mode === 'board' || state.mode === 'calendar' || state.mode === 'review') this.mode = state.mode;
		if (state.calendarMode === 'month' || state.calendarMode === 'week') this.calendarMode = state.calendarMode;
		if (typeof state.selectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.selectedDate)) {
			const [year, month, day] = state.selectedDate.split('-').map(Number);
			this.selectedDate = new Date(year!, month! - 1, day, 12);
		}
		if (this.workspaceEl) await this.renderPlanContent();
		else await this.mountView();
		await super.setState(state, result);
	}
	async onOpen(): Promise<void> {
		this.registerEvent(this.app.workspace.on('css-change', () => { void this.renderPlanContent(); }));
		this.registerEvent(this.app.vault.on('create', () => { void this.renderPlanContent(); }));
		this.registerEvent(this.app.vault.on('delete', () => { void this.renderPlanContent(); }));
		this.registerEvent(this.app.vault.on('rename', () => { void this.renderPlanContent(); }));
		this.registerEvent(this.app.vault.on('modify', file => { if (file.path.startsWith('05-计划/')) void this.renderPlanContent(); }));
		this.register(this.plugin.embeddedTasks.subscribe(() => { if (this.mode === 'calendar') void this.renderPlanContent(); }));
		await this.plugin.embeddedTasks.ready;
		await this.mountView();
	}
	async onClose(): Promise<void> {
		this.generation++;
		if (this.shell) this.removeChild(this.shell);
		this.shell = undefined;
		this.workspaceEl = undefined;
	}

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

	private async mountView(): Promise<void> {
		const root = this.contentEl;
		if (this.shell) this.removeChild(this.shell);
		root.empty(); root.removeClass('ad-modal'); root.addClass('mx-plan-workspace-view');
		const page = root.createDiv({ cls: 'dashboard-plugin mx-plan-workspace' });
		renderLifeCompass(page, name => { void openDirection(this.app, name); });
		this.shell = new WorkbenchShell(this.plugin, page, action => this.plugin.navigateWorkbench(action), 'plan');
		this.addChild(this.shell);
		this.workspaceEl = page.createDiv({ cls: 'po-container mx-plan-container' });
		await this.renderPlanContent();
	}

	private async renderPlanContent(): Promise<void> {
		const container = this.workspaceEl;
		if (!container) return;
		const token = ++this.generation;
		const snapshot = this.mode === 'board'
			? await readPlanWorkspace(this.planFiles(), this.selectedYear, this.selectedMonth)
			: undefined;
		if (token !== this.generation || container !== this.workspaceEl) return;
		container.empty();
		this.renderSidebar(container, snapshot?.monthly.exists ?? false);
		const main = container.createDiv({ cls: 'po-main' });
		if (this.mode === 'board' && snapshot) this.renderBoard(main, snapshot);
		else if (this.mode === 'calendar') this.renderCalendar(main);
		else this.renderReview(main);
	}

	private renderSidebar(container: HTMLElement, _selectedMonthExists: boolean): void {
		const side = container.createDiv({ cls: 'po-sidebar' });
		const list = side.createDiv({ cls: 'po-sidebar__list' });
		list.createDiv({ cls: 'po-toolbar__label mx-time-trace-title', text: '时迹' });
		for (const [mode, label] of [['board', '计划表'], ['calendar', '日历'], ['review', '日记回顾']] as const) {
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
		toolbar.createSpan({ cls: 'mx-plan-title', text: '时迹' });
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

	private renderCalendar(main: HTMLElement): void {
		const tasks = this.plugin.embeddedTasks.all();
		this.sourceLabels = new Map(processes(scanLearning(this.app), scanProjects(this.app), tasks).map(process => [process.sourceFile, taskSourceTypeLabel(process.contentType)]));
		const root = main.createDiv({ cls: 'po-cal' }); root.tabIndex = 0;
		const bar = root.createDiv({ cls: 'po-cal__bar' });
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
		if (this.calendarMode === 'month') this.renderCalendarMonth(root); else this.renderCalendarWeek(root);
		this.renderDayDetail(root);
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

	private renderCalendarMonth(root: HTMLElement): void {
		const weekdays = root.createDiv({ cls: 'po-cal__weekdays' });
		for (const name of ['一', '二', '三', '四', '五', '六', '日']) weekdays.createSpan({ text: name });
		const days = root.createDiv({ cls: 'po-cal__days mx-plan-calendar-days' });
		const first = new Date(this.selectedYear, this.selectedMonth - 1, 1, 12);
		const cursor = new Date(first); cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
		const today = new Date();
		for (let index = 0; index < 42; index++) {
			const date = new Date(cursor); date.setDate(cursor.getDate() + index);
			const key = dateKey(date); const tasks = tasksOnDate(this.plugin.embeddedTasks.all(), key);
			let cls = 'po-cal__day';
			if (date.getMonth() !== this.selectedMonth - 1) cls += ' is-out';
			if (date.getDay() === 0 || date.getDay() === 6) cls += ' is-weekend';
			if (sameDay(date, today)) cls += ' is-today';
			if (sameDay(date, this.selectedDate)) cls += ' is-sel';
			const day = days.createDiv({ cls }); day.createSpan({ cls: `po-cal__day-num${sameDay(date, today) ? ' is-today' : ''}`, text: String(date.getDate()) });
			const body = day.createDiv({ cls: 'po-cal__day-body' }); body.createDiv({ cls: 'po-cal__slot' });
			for (const task of tasks.slice(0, 3)) this.renderCalendarChip(body, task);
			if (tasks.length > 3) day.createDiv({ cls: 'po-cal__day-more', text: `+${tasks.length - 3}` });
			day.addEventListener('click', () => { this.setSelection(date.getFullYear(), date.getMonth() + 1, date.getDate()); });
		}
	}

	private renderCalendarWeek(root: HTMLElement): void {
		const weekdays = root.createDiv({ cls: 'po-cal__weekdays' });
		for (const name of ['一', '二', '三', '四', '五', '六', '日']) weekdays.createSpan({ text: name });
		const cols = root.createDiv({ cls: 'po-cal__week' });
		const today = new Date();
		for (const date of this.weekDates()) {
			const key = dateKey(date); const tasks = tasksOnDate(this.plugin.embeddedTasks.all(), key);
			const col = cols.createDiv({ cls: `po-cal__wcol${sameDay(date, today) ? ' is-today' : ''}${sameDay(date, this.selectedDate) ? ' is-sel' : ''}` });
			const head = col.createDiv({ cls: 'po-cal__wcol-hd' }); head.createSpan({ cls: 'po-cal__wcol-day', text: String(date.getDate()) }); head.createSpan({ cls: 'po-cal__wcol-name', text: `${date.getMonth() + 1}月` });
			for (const task of tasks) this.renderCalendarChip(col, task);
			col.addEventListener('click', () => { this.setSelection(date.getFullYear(), date.getMonth() + 1, date.getDate()); });
		}
	}

	private renderDayDetail(root: HTMLElement): void {
		const detail = root.createDiv({ cls: 'po-cal__det' });
		const tasks = tasksOnDate(this.plugin.embeddedTasks.all(), dateKey(this.selectedDate));
		detail.createDiv({ cls: 'po-cal__det-ttl', text: `${this.selectedDate.getMonth() + 1} 月 ${this.selectedDate.getDate()} 日 · ${tasks.length} 项任务` });
		if (!tasks.length) { detail.createDiv({ cls: 'po-cal__det-empty', text: '当日暂无任务' }); return; }
		const groups = groupEmbeddedForDisplay(tasks);
		for (const category of TASK_DISPLAY_CATEGORIES) {
			if (!groups[category].length) continue;
			const section = detail.createDiv({ cls: 'mx-day-task-section' });
			section.createDiv({ cls: 'mx-day-task-section__title', text: TASK_DISPLAY_LABELS[category] });
			for (const task of groups[category]) this.renderTaskRow(section, task);
		}
	}

	private renderCalendarChip(parent: HTMLElement, task: EmbeddedTask): void {
		const chip = parent.createDiv({ cls: `po-cal__chip mx-calendar-task-chip mx-plan-task-${taskCalendarCategory(task)}${task.completed ? ' is-done' : ''}`, attr: { title: task.text } });
		chip.createSpan({ cls: 'mx-calendar-task-marker', text: taskDisplayMarker(task.sourceType) });
		chip.createSpan({ cls: 'mx-calendar-task-text', text: task.text });
	}

	private renderTaskRow(parent: HTMLElement, task: EmbeddedTask): void {
		const row = parent.createDiv({ cls: 'po-cal__task' });
		const check = row.createSpan({ cls: `po-check${task.completed ? ' is-done' : ''}`, attr: { role: 'checkbox', 'aria-checked': String(task.completed), 'aria-label': `${task.completed ? '取消完成' : '完成'} ${task.text}` } });
		check.addEventListener('click', event => { event.stopPropagation(); void this.plugin.embeddedTasks.complete(task, !task.completed).catch(error => new Notice(`任务更新失败：${String(error)}`)); });
		const body = row.createDiv({ cls: 'mx-day-task-body' });
		body.createSpan({ cls: 'po-cal__task-name', text: task.text });
		body.createSpan({ cls: 'mx-day-task-source', text: `${task.sourceDisplayName} · ${this.sourceLabels.get(task.sourceFile) ?? taskCalendarSourceLabel(task)}` });
		row.addEventListener('click', () => { const file = this.app.vault.getAbstractFileByPath(task.sourceFile); if (file instanceof TFile) void this.app.workspace.getLeaf('tab').openFile(file); });
	}
}
