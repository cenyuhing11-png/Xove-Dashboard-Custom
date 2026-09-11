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
import { JOURNAL_ROOT, journalCalendarEntry, journalDateFromPath, journalInfo, readJournalTitle } from '../data/journal';
import type { JournalCalendarEntry } from '../data/journal';
import { dayReviewSections, discoverReviewRecords, ensureReviewForFocus, journalReviewTarget, markdownReviewSections, pastTodayReference, pastTodayReviewRecords, randomReviewRecord, recentReviewRecords, recentReviewTimeLabel, recentReviewTitle, reviewRecordTimeLabel, searchReviewRecords, timeStateForReviewRecord } from '../data/journalReview';
import type { JournalReviewMode, JournalReviewViewMode, MarkdownReviewSection, ReviewRecord } from '../data/journalReview';
import { renderEmbeddedTaskCheckbox } from '../components/tasks/EmbeddedTaskCheckbox';
import { scanLongTermPlans, setProcessLongTermPlan, updateLongTermPlanMarkdown } from '../data/longTermPlanVault';
import { appendLongTermStage, assignLongTermProcessToStage, deleteLongTermStage, ensureLongTermStageIds, longTermPlanDetailMetadata, longTermPlansForMonth, longTermPlansForQuarter, longTermPlansForYear, moveLongTermStage, normalizeLongTermProcessRef, removeLongTermProcessFromStages, toggleLongTermStage, updateLongTermPlanDirections, updateLongTermStage } from '../data/longTermPlans';
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
import { focusDate, focusLabel, focusMatchesWeek, focusMonth, hasTimeTraceMarker, initialTimeTraceState, parseDateKey, selectDay } from '../data/timeTrace';
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
function sameTimeFocus(a: TimeFocus, b: TimeFocus): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'day' && b.kind === 'day') return a.date === b.date;
	if (a.kind === 'week' && b.kind === 'week') return a.isoYear === b.isoYear && a.isoWeek === b.isoWeek && a.anchorDate === b.anchorDate;
	if (a.kind === 'quarter' && b.kind === 'quarter') return a.year === b.year && a.quarter === b.quarter;
	if (a.kind === 'month' && b.kind === 'month') return a.year === b.year && a.month === b.month;
	return a.kind === 'year' && b.kind === 'year' && a.year === b.year;
}
function compactProcessDate(value?: string | null): string { return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value!.slice(5).replace('-', '.') : '—'; }

/** Reusable time-trace content. The legacy PlanView and the main workbench router
 * mount this same renderer, so the business UI has a single implementation. */
export class PlanWorkspaceRenderer extends Component {
	private timeState: TimeTraceState = initialTimeTraceState();
	private mode: PlanWorkspaceMode = 'board';
	private calendarMode: PlanCalendarMode = 'month';
	private reviewMode: JournalReviewMode = 'review';
	private reviewView: JournalReviewViewMode = 'record';
	private reviewSearchQuery = '';
	private reviewRecentLimit = 12;
	private reviewSearchTimer?: number;
	private reviewFocusTimer?: number;
	private reviewActionMessage = '';
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
	getState() { return { selectedYear: this.timeState.visible.year, selectedMonth: this.timeState.visible.month, mode: this.mode, calendarMode: this.calendarMode, reviewMode: this.reviewMode, reviewView: this.reviewView, selectedDate: dateKey(focusDate(this.timeState)), selectedLongTermPlanId: this.selectedLongTermPlanId }; }
	async setState(state: Record<string, unknown>): Promise<void> {
		const year = Number.isInteger(state.selectedYear) && Number(state.selectedYear) > 0 ? Number(state.selectedYear) : this.timeState.visible.year;
		const month = Number.isInteger(state.selectedMonth) && Number(state.selectedMonth) >= 1 && Number(state.selectedMonth) <= 12 ? Number(state.selectedMonth) : this.timeState.visible.month;
		this.timeState = { ...this.timeState, visible: { year, month } };
		if (state.mode === 'board' || state.mode === 'longTermPlan' || state.mode === 'calendar' || state.mode === 'review') this.mode = state.mode;
		if (typeof state.selectedLongTermPlanId === 'string') this.selectedLongTermPlanId = state.selectedLongTermPlanId;
		if (state.calendarMode === 'month' || state.calendarMode === 'week') this.calendarMode = state.calendarMode;
		if (state.reviewMode === 'review' || state.reviewMode === 'compare') this.reviewMode = state.reviewMode;
		if (state.reviewView === 'record' || state.reviewView === 'recent' || state.reviewView === 'search' || state.reviewView === 'pastToday') this.reviewView = state.reviewView;
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
		const modifyRef = this.app.vault.on('modify', file => { if (this.active && (file.path.startsWith('05-计划/') || ((this.mode === 'calendar' || this.mode === 'review') && file.path.startsWith(`${JOURNAL_ROOT}/`)))) void this.renderPlanContent(); });
		this.sectionDisposers.push(() => this.app.vault.offref(modifyRef));
		const metadataRef = this.app.metadataCache.on('changed', file => { if (this.active && (this.mode === 'calendar' || this.mode === 'review') && file.path.startsWith(`${JOURNAL_ROOT}/`)) void this.renderPlanContent(); });
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
	private clearReviewTimers(): void {
		if (this.reviewSearchTimer !== undefined) window.clearTimeout(this.reviewSearchTimer);
		if (this.reviewFocusTimer !== undefined) window.clearTimeout(this.reviewFocusTimer);
		this.reviewSearchTimer = undefined;
		this.reviewFocusTimer = undefined;
	}
	deactivate(): void {
		this.active = false;
		this.clearReviewTimers();
		this.miniCalendarDisposer?.(); this.miniCalendarDisposer = undefined;
		this.quickTasks?.close(); this.quickTasks = undefined;
		this.generation++;
		this.workspaceEl = undefined;
		for (const dispose of this.sectionDisposers.splice(0)) dispose();
	}
	onunload(): void { this.deactivate(); }

	private planFiles() {
		const vault = this.app.vault;
		return {
			kind: (path: string) => { const entry = vault.getAbstractFileByPath(path); return entry instanceof TFile ? 'file' as const : entry ? 'folder' as const : undefined; },
			read: async (path: string) => { const file = vault.getAbstractFileByPath(path); if (!(file instanceof TFile)) throw new Error('计划文件不存在'); return vault.cachedRead(file); },
			createFolder: (path: string) => vault.createFolder(path),
			create: (path: string, content: string) => vault.create(path, content),
		};
	}

	private async openExisting(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) { new Notice('尚未创建对应计划'); return; }
		await this.app.workspace.getLeaf('tab').openFile(file);
	}

	private setTimeState(state: TimeTraceState): void {
		this.timeState = state;
		if (this.mode === 'review') { this.clearReviewTimers(); this.reviewView = 'record'; this.reviewActionMessage = ''; }
		this.calendarMode = state.focus.kind === 'week' ? 'week' : 'month';
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
		const header = main.createDiv({ cls: 'po-toolbar mx-plan-toolbar mx-time-trace-section-header', attr: { 'data-time-trace-header': this.mode } });
		const body = main.createDiv({ cls: 'mx-time-trace-section-body', attr: { 'data-time-trace-body': this.mode } });
		if (this.mode === 'board' && snapshot) this.renderBoard(header, body, snapshot);
		else if (this.mode === 'longTermPlan') await this.renderLongTermPlans(header, body, longTermPlans);
		else if (this.mode === 'calendar') await this.renderCalendar(header, body, token);
		else await this.renderReview(header, body, token);
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

	private renderBoard(header: HTMLElement, main: HTMLElement, snapshot: Awaited<ReturnType<typeof readPlanWorkspace>>): void {
		const { year, month } = this.timeState.visible;
		header.createSpan({ cls: 'mx-plan-title', text: '周期计划' });
		const context = this.timeState.focus.kind === 'year' || this.timeState.focus.kind === 'quarter' || this.timeState.focus.kind === 'month'
			? focusLabel(this.timeState.focus)
			: `${monthTitle(year, month)} · Q${snapshot.quarter}`;
		header.createSpan({ cls: 'mx-plan-context', text: context });
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

	private existingFile(paths: readonly string[]): TFile | undefined {
		for (const path of paths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) return file;
		}
		return undefined;
	}

	private openSource(file: TFile): void {
		void this.app.workspace.getLeaf('tab').openFile(file);
	}

	private async renderReviewSections(parent: HTMLElement, file: TFile, sections: MarkdownReviewSection[]): Promise<void> {
		for (const section of sections) {
			const block = parent.createDiv({ cls: 'mx-journal-review-section' });
			block.createEl('h3', { cls: 'ad-modal-title', text: section.title });
			if (!section.markdown) {
				block.createDiv({ cls: 'ad-modal-hint', text: '暂无内容' });
				continue;
			}
			const content = block.createDiv({ cls: 'mx-long-term-markdown mx-journal-review-markdown markdown-rendered' });
			await MarkdownRenderer.render(this.app, section.markdown, content, file.path, this);
		}
	}

	private async renderReviewDocument(parent: HTMLElement, label: string, file: TFile | undefined, emptyText: string, dayOnly = false, showHeader = true, renderMissing?: (parent: HTMLElement) => void): Promise<void> {
		if (showHeader) {
			const head = parent.createDiv({ cls: 'mx-journal-review-document-head' });
			head.createEl('h2', { cls: 'ad-modal-title', text: label });
			if (file) {
				const open = head.createEl('button', { cls: 'mx-inline-action', text: '打开原文 →', attr: { type: 'button' } });
				open.onclick = () => this.openSource(file);
			}
		}
		if (!file) { if (renderMissing) renderMissing(parent); else parent.createDiv({ cls: 'po-empty mx-journal-review-empty', text: emptyText }); return; }
		try {
			const markdown = await this.app.vault.cachedRead(file);
			const sections = dayOnly ? dayReviewSections(markdown) : markdownReviewSections(markdown);
			if (!sections.length) { parent.createDiv({ cls: 'po-empty mx-journal-review-empty', text: '暂无可显示内容' }); return; }
			await this.renderReviewSections(parent, file, sections);
		} catch {
			parent.createDiv({ cls: 'po-empty mx-journal-review-empty', text: '暂时无法读取原文' });
		}
	}

	private openReviewRecord(record: ReviewRecord): void {
		this.clearReviewTimers();
		this.timeState = timeStateForReviewRecord(this.timeState, record);
		this.reviewView = 'record';
		this.reviewActionMessage = '';
		void this.renderPlanContent();
	}

	private renderReviewResultRow(parent: HTMLElement, record: ReviewRecord, snippet = '', options?: { compactDay?: boolean; timeLabel?: string; title?: string; showType?: boolean }): void {
		const row = parent.createDiv({ cls: 'mx-journal-review-result', attr: { role: 'button', tabindex: '0' } });
		row.createDiv({ cls: 'mx-journal-review-result-time', text: options?.timeLabel ?? reviewRecordTimeLabel(record, options?.compactDay) });
		const body = row.createDiv({ cls: 'mx-journal-review-result-body' });
		body.createDiv({ cls: 'mx-journal-review-result-title', text: options?.title ?? record.title });
		if (options?.showType !== false) body.createDiv({ cls: 'ad-modal-hint mx-journal-review-result-type', text: record.label });
		if (snippet) body.createDiv({ cls: 'mx-journal-review-result-snippet', text: snippet });
		const open = () => this.openReviewRecord(record);
		row.onclick = open;
		row.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
	}

	private renderRecentReviews(content: HTMLElement, records: ReviewRecord[]): void {
		content.createEl('h1', { cls: 'ad-modal-title mx-journal-review-tool-title', text: '最近记录' });
		const list = content.createDiv({ cls: 'mx-journal-review-results is-recent' });
		const visible = recentReviewRecords(records, this.reviewRecentLimit);
		if (!visible.length) { list.createDiv({ cls: 'po-empty mx-journal-review-tool-empty', text: '暂无记录' }); return; }
		for (const record of visible) this.renderReviewResultRow(list, record, '', { timeLabel: recentReviewTimeLabel(record), title: recentReviewTitle(record), showType: false });
		if (records.length > visible.length) {
			const more = content.createEl('button', { cls: 'mx-inline-action mx-journal-review-more', text: '显示更多', attr: { type: 'button' } });
			more.onclick = () => { this.reviewRecentLimit += 12; void this.renderPlanContent(); };
		}
	}

	private renderSearchResults(parent: HTMLElement, records: ReviewRecord[], query: string): void {
		parent.empty();
		if (!query.trim()) return;
		const results = searchReviewRecords(records, query);
		if (!results.length) { parent.createDiv({ cls: 'po-empty mx-journal-review-tool-empty', text: '没有找到相关记录' }); return; }
		for (const result of results) this.renderReviewResultRow(parent, result.record, result.snippet);
	}

	private renderReviewSearch(content: HTMLElement, records: ReviewRecord[]): void {
		content.createEl('h1', { cls: 'ad-modal-title mx-journal-review-tool-title', text: '搜索日记与复盘' });
		const input = content.createEl('input', { cls: 'ad-modal-input mx-journal-review-search', attr: { type: 'search', placeholder: '搜索过去写过的内容……', 'aria-label': '搜索日记与复盘' } });
		input.value = this.reviewSearchQuery;
		const results = content.createDiv({ cls: 'mx-journal-review-results' });
		const update = (query: string) => this.renderSearchResults(results, records, query);
		update(this.reviewSearchQuery);
		input.oninput = () => {
			if (this.reviewSearchTimer !== undefined) window.clearTimeout(this.reviewSearchTimer);
			this.reviewSearchTimer = window.setTimeout(() => {
				this.reviewSearchTimer = undefined;
				this.reviewSearchQuery = input.value;
				update(this.reviewSearchQuery);
			}, 200);
		};
		if (this.reviewFocusTimer !== undefined) window.clearTimeout(this.reviewFocusTimer);
		this.reviewFocusTimer = window.setTimeout(() => { this.reviewFocusTimer = undefined; if (input.isConnected) input.focus(); }, 0);
	}

	private renderPastTodayReviews(content: HTMLElement, records: ReviewRecord[]): void {
		const reference = pastTodayReference(this.timeState.focus, new Date());
		content.createEl('h1', { cls: 'ad-modal-title mx-journal-review-tool-title', text: '过去的今天' });
		content.createDiv({ cls: 'ad-modal-hint mx-journal-review-tool-context', text: `${reference.getMonth() + 1} 月 ${reference.getDate()} 日` });
		const list = content.createDiv({ cls: 'mx-journal-review-results' });
		const recordsForDay = pastTodayReviewRecords(records, reference);
		if (!recordsForDay.length) { list.createDiv({ cls: 'po-empty mx-journal-review-tool-empty', text: '过去的这一天暂无记录' }); return; }
		for (const record of recordsForDay) this.renderReviewResultRow(list, record, record.previewText, { timeLabel: `${record.period.slice(0, 4)} 年` });
	}

	private renderMissingReview(parent: HTMLElement, target: ReturnType<typeof journalReviewTarget>): void {
		const copy = {
			day: ['这一天尚未创建日记', '创建这天日记 →'],
			week: ['本周尚未创建周复盘', '创建本周复盘 →'],
			month: ['本月尚未创建月复盘', '创建本月复盘 →'],
			year: ['本年度尚未创建年复盘', '创建本年复盘 →'],
			quarter: ['本季尚未创建季复盘', ''],
		}[target.kind];
		const empty = parent.createDiv({ cls: 'mx-journal-review-missing-day' });
		empty.createDiv({ cls: 'ad-modal-hint', text: copy[0] });
		if (target.kind === 'quarter') return;
		const create = empty.createEl('button', { cls: 'mx-inline-action mx-journal-review-create', text: copy[1], attr: { type: 'button' } });
		create.onclick = async () => {
			const focus = this.timeState.focus;
			if (focus.kind !== target.kind) return;
			const reviewMode = this.reviewMode;
			create.disabled = true;
			try {
				await ensureReviewForFocus(this.planFiles(), focus);
				if (this.mode === 'review' && this.reviewView === 'record' && this.reviewMode === reviewMode && sameTimeFocus(this.timeState.focus, focus)) await this.renderPlanContent();
			} catch (error) {
				create.disabled = false;
				new Notice(`无法创建${target.reviewLabel}：${error instanceof Error ? error.message : '请检查目录权限'}`);
			}
		};
	}

	private renderReviewToolbar(toolbar: HTMLElement, records: ReviewRecord[]): void {
		toolbar.createSpan({ cls: 'mx-plan-title', text: '日记回顾' });
		const tools = toolbar.createDiv({ cls: 'mx-journal-review-tools' });
		for (const [mode, label] of [['recent', '最近记录'], ['search', '搜索'], ['pastToday', '过去的今天']] as const) {
			const button = tools.createEl('button', { cls: `mx-journal-review-tool${this.reviewView === mode ? ' is-active' : ''}`, text: label, attr: { type: 'button', 'aria-pressed': String(this.reviewView === mode) } });
			button.onclick = () => {
				this.clearReviewTimers();
				this.reviewView = mode;
				this.reviewActionMessage = '';
				if (mode === 'recent') this.reviewRecentLimit = 12;
				void this.renderPlanContent();
			};
			if (mode === 'search') {
				const random = tools.createEl('button', { cls: 'mx-journal-review-tool', text: '随机回顾', attr: { type: 'button' } });
				random.onclick = () => {
					const record = randomReviewRecord(records);
					if (record) this.openReviewRecord(record);
					else { this.reviewView = 'record'; this.reviewActionMessage = '暂无可随机回顾的记录'; void this.renderPlanContent(); }
				};
			}
		}
	}

	private async renderReview(header: HTMLElement, main: HTMLElement, token: number): Promise<void> {
		const records = await discoverReviewRecords(this.app);
		if (token !== this.generation || !main.isConnected) return;
		header.addClass('mx-journal-review-toolbar');
		this.renderReviewToolbar(header, records);
		const content = main.createDiv({ cls: 'mx-journal-review-content' });
		if (this.reviewView === 'recent') { this.renderRecentReviews(content, records); return; }
		if (this.reviewView === 'search') { this.renderReviewSearch(content, records); return; }
		if (this.reviewView === 'pastToday') { this.renderPastTodayReviews(content, records); return; }

		const target = journalReviewTarget(this.timeState.focus);
		const reviewFile = this.existingFile(target.reviewPaths);
		const planFile = target.planPath ? this.existingFile([target.planPath]) : undefined;
		if (this.reviewActionMessage) content.createDiv({ cls: 'ad-modal-hint mx-journal-review-action-message', text: this.reviewActionMessage });
		const record = content.createDiv({ cls: 'mx-journal-review-record-head' });
		record.createEl('h1', { cls: 'ad-modal-title', text: target.primary });
		const dayTitle = target.kind === 'day' && reviewFile ? readJournalTitle(this.app, reviewFile) : '';
		if (dayTitle) record.createDiv({ cls: 'mx-journal-review-record-title', text: dayTitle });
		if (target.secondary) record.createDiv({ cls: 'ad-modal-hint', text: target.secondary });
		const controls = content.createDiv({ cls: 'mx-journal-review-record-controls' });
		if (target.kind !== 'day' && target.kind !== 'quarter') {
			const modes = controls.createDiv({ cls: 'mx-journal-review-modes', attr: { role: 'tablist', 'aria-label': '阅读模式' } });
			for (const [mode, label] of [['review', '复盘'], ['compare', '计划 ↔ 复盘']] as const) {
				const button = modes.createEl('button', { cls: `mx-journal-review-mode${this.reviewMode === mode ? ' is-active' : ''}`, text: label, attr: { type: 'button', role: 'tab', 'aria-selected': String(this.reviewMode === mode) } });
				button.onclick = () => { this.reviewMode = mode; void this.renderPlanContent(); };
			}
		}
		if (reviewFile) {
			const edit = controls.createEl('button', { cls: 'mx-inline-action mx-journal-review-edit', text: '编辑原文', attr: { type: 'button' } });
			edit.onclick = () => this.openSource(reviewFile);
		}
		if (token !== this.generation || !main.isConnected) return;
		if (target.kind === 'quarter') { this.renderMissingReview(content, target); return; }
		if (!reviewFile && (target.kind === 'day' || this.reviewMode === 'review')) { this.renderMissingReview(content, target); return; }

		if (target.kind !== 'day' && this.reviewMode === 'compare') {
			const compare = content.createDiv({ cls: 'mx-journal-review-compare' });
			await this.renderReviewDocument(compare.createDiv({ cls: 'mx-journal-review-pane is-plan' }), target.planLabel ?? '计划', planFile, `尚未创建${target.planLabel ?? '对应计划'}`);
			await this.renderReviewDocument(compare.createDiv({ cls: 'mx-journal-review-pane is-review' }), target.reviewLabel, reviewFile, `尚未创建${target.reviewLabel}`, false, true, parent => this.renderMissingReview(parent, target));
			return;
		}
		await this.renderReviewDocument(content.createDiv({ cls: 'mx-journal-review-pane is-reading' }), target.reviewLabel, reviewFile, `尚未创建${target.reviewLabel}`, target.kind === 'day', false);
	}

	private async renderLongTermPlans(header: HTMLElement, main: HTMLElement, plans: LongTermPlan[]): Promise<void> {
		const focus = this.timeState.focus;
		const month = focusMonth(this.timeState);
		header.createSpan({ cls: 'mx-plan-title', text: '长期计划' });
		header.createSpan({ cls: 'mx-plan-context', text: focus.kind === 'year' || focus.kind === 'quarter' ? focusLabel(focus) : `${month.year} 年 ${month.month} 月` });
		const selected = plans.find(plan => plan.id === this.selectedLongTermPlanId);
		if (selected) {
			if (selected.stages.some(stage => !stage.id)) { await updateLongTermPlanMarkdown(this.app, selected, content => ensureLongTermStageIds(content)); await this.renderPlanContent(); return; }
			this.renderLongTermDetail(main, selected, plans); return;
		}
		this.selectedLongTermPlanId = '';
		const visible = focus.kind === 'year' ? longTermPlansForYear(plans, focus.year) : focus.kind === 'quarter' ? longTermPlansForQuarter(plans, focus.year, focus.quarter) : longTermPlansForMonth(plans, month.year, month.month);
		const list = main.createDiv({ cls: 'po-tasklist mx-long-term-list' });
		if (!visible.length) { list.createDiv({ cls: 'po-empty mx-plan-empty', text: focus.kind === 'year' ? `${focus.year} 年暂无长期计划` : focus.kind === 'quarter' ? `${focus.year} Q${focus.quarter} 暂无长期计划` : `${month.year} 年 ${month.month} 月暂无长期计划` }); return; }
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

	private async renderCalendar(header: HTMLElement, main: HTMLElement, token: number): Promise<void> {
		const { year, month } = this.timeState.visible;
		this.calendarMode = this.timeState.focus.kind === 'week' ? 'week' : 'month';
		header.createSpan({ cls: 'mx-plan-title', text: '综合日历' });
		header.createSpan({ cls: 'mx-plan-context', text: this.calendarMode === 'month' ? monthTitle(year, month) : this.weekTitle() });
		const tasks = this.plugin.embeddedTasks.all();
		this.sourceLabels = new Map(processes(scanLearning(this.app), scanProjects(this.app), tasks).map(process => [process.sourceFile, taskSourceTypeLabel(process.contentType)]));
		const journals = await this.readCalendarJournals();
		if (token !== this.generation || !main.isConnected) return;
		const root = main.createDiv({ cls: 'po-cal' }); root.tabIndex = 0;
		if (this.calendarMode === 'month') this.renderCalendarMonth(root, journals, tasks); else this.renderCalendarWeek(root, journals, tasks);
		const selectedDate = this.calendarDate();
		this.renderDayDetail(root, selectedDate, journals.get(dateKey(selectedDate)));
	}

	private weekDates(): Date[] {
		const start = this.calendarDate(); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
		return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
	}
	private weekTitle(): string {
		const dates = this.weekDates();
		const focused = this.timeState.focus.kind === 'week' ? this.timeState.focus : undefined;
		const fallback = isoWeek(dates[0]!);
		return `${focused?.isoYear ?? fallback.year}-W${String(focused?.isoWeek ?? fallback.week).padStart(2, '0')} · ${dayLabel(dates[0]!)} — ${dayLabel(dates[6]!)}`;
	}

	private renderCalendarIncomplete(parent: HTMLElement, tasks: EmbeddedTask[], key: string): number {
		const count = incompleteTaskCountOnDate(tasks, key);
		if (!count) return 0;
		parent.addClass('has-incomplete-tasks');
		parent.createSpan({ cls: 'mx-plan-calendar-incomplete', text: `☐ ${count}`, attr: { 'aria-label': `${count} 项未完成任务` } });
		return count;
	}

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
			const key = dateKey(date); const journal = journals.get(key);
			let cls = 'po-cal__day';
			if (date.getFullYear() !== year || date.getMonth() !== month - 1) cls += ' is-out';
			if (date.getDay() === 0 || date.getDay() === 6) cls += ' is-weekend';
			if (sameDay(date, today)) cls += ' is-today';
			if (this.timeState.focus.kind === 'day' && this.timeState.focus.date === key) cls += ' is-sel';
			const day = days.createDiv({ cls }); day.createSpan({ cls: `po-cal__day-num${sameDay(date, today) ? ' is-today' : ''}`, text: String(date.getDate()) });
			const body = day.createDiv({ cls: 'po-cal__day-body mx-plan-calendar-day-body' }); body.createDiv({ cls: 'po-cal__slot' });
			if (journal) this.renderCalendarJournal(body, journal, 'month');
			this.renderCalendarIncomplete(day, tasks, key);
			day.addEventListener('click', () => this.setDayFocus(date));
		}
	}

	private renderCalendarWeek(root: HTMLElement, journals: Map<string, JournalCalendarEntry>, allTasks: EmbeddedTask[]): void {
		const weekdays = root.createDiv({ cls: 'po-cal__weekdays' });
		for (const name of ['一', '二', '三', '四', '五', '六', '日']) weekdays.createSpan({ text: name });
		const cols = root.createDiv({ cls: 'po-cal__week' });
		const today = new Date();
		for (const date of this.weekDates()) {
			const key = dateKey(date); const tasks = tasksOnDate(allTasks, key); const journal = journals.get(key);
			const col = cols.createDiv({ cls: `po-cal__wcol${sameDay(date, today) ? ' is-today' : ''}${this.timeState.focus.kind === 'day' && this.timeState.focus.date === key ? ' is-sel' : ''}` });
			const head = col.createDiv({ cls: 'po-cal__wcol-hd' }); head.createSpan({ cls: 'po-cal__wcol-day', text: String(date.getDate()) }); head.createSpan({ cls: 'po-cal__wcol-name', text: `${date.getMonth() + 1}月` });
			if (journal) this.renderCalendarJournal(col, journal);
			for (const task of tasks) this.renderCalendarChip(col, task);
			this.renderCalendarIncomplete(col, allTasks, key);
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
