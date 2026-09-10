import { App, ItemView, MarkdownRenderer, Menu, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type { Component, ViewStateResult } from 'obsidian';
import { directionInfo } from '../data/compass';
import { directionOverviewModel } from '../data/directionOverview';
import { learningFiles, openLearningFile, scanLearning } from '../data/learningVault';
import { scanLongTermPlans } from '../data/longTermPlanVault';
import type { Process } from '../data/processes';
import { hasProcessSchedule, processes } from '../data/processes';
import { processContentTypeLabel } from '../data/processContentTypes';
import { scanProjects } from '../data/projectVault';
import type { EmbeddedTaskStore } from '../data/embeddedTaskVault';
import type Dashboard from '../main';
import { DirectionAbilityModal, EditDirectionAbilityModal } from './DirectionAbilityModal';
import { renderLongTermPlanSummaryRow } from './LongTermPlanRow';
import { openProcess } from './ProjectView';
import { renderProcessRow } from './ProcessRow';
import { renderTaskProgressPill } from './ProcessTaskProgress';
import { ProcessTasksModal } from './ProcessTasksModal';

export const DIRECTION_VIEW = 'xove-dashboard-custom-direction';

export interface DirectionDetailActions {
	component: Component;
	tasks?: EmbeddedTaskStore;
	back?(): void | Promise<void>;
	openLongTermPlan?(id: string): void | Promise<void>;
	locateProcess?(process: Process): void | Promise<void>;
}

function compactDate(value?: string): string { return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value!.slice(5).replace('-', '.') : '—'; }

/** Shared direction overview renderer. DashboardView mounts it inside the unified
 * workbench; DirectionView keeps the same UI only for restored legacy tabs. */
export class DirectionDetailRenderer {
	private generation = 0;
	private narrativeExpanded = new Set<string>();
	private quickTasks?: ProcessTasksModal;
	constructor(private app: App, private actions: DirectionDetailActions) {}
	cancel(): void { this.generation++; this.quickTasks?.close(); this.quickTasks = undefined; }
	private openSource(path: string): void { void openLearningFile(this.app, path).catch(() => new Notice('方向笔记不存在或已移动')); }
	private renderMarkdown(parent: HTMLElement, markdown: string, path: string, emptyText: string): void {
		if (!markdown.trim()) { parent.createDiv({ cls: 'ad-modal-hint', text: emptyText }); return; }
		const content = parent.createDiv({ cls: 'mx-long-term-markdown markdown-rendered' });
		void MarkdownRenderer.render(this.app, markdown, content, path, this.actions.component);
	}
	private renderProcess(parent: HTMLElement, process: Process): void {
		const scheduled = hasProcessSchedule({ startDate: process.startDate ?? null, endDate: process.dueDate ?? null });
		renderProcessRow(parent, { key: process.sourceFile, name: process.name, layout: 'inline', open: () => { if (this.actions.locateProcess) void this.actions.locateProcess(process); else void openProcess(this.app, process); }, fields: [
			{ key: 'meta', render: cell => cell.createSpan({ text: `${process.category === 'learning' ? '学习' : '创作'} · ${processContentTypeLabel(process.contentType, true)} · ${process.status}` }) },
			...(scheduled ? [{ key: 'date', render: (cell: HTMLElement) => cell.createSpan({ text: `${compactDate(process.startDate)} → ${compactDate(process.dueDate)}` }) }] : []),
			...(process.taskTotal > 0 && this.actions.tasks ? [{ key: 'progress', render: (cell: HTMLElement) => renderTaskProgressPill(cell, process.name, process.sourceFile, process.taskTotal, process.taskCompleted, () => {
				this.quickTasks?.close(); this.quickTasks = new ProcessTasksModal(this.app, this.actions.tasks!, { name: process.name, processType: process.processType, sourceFile: process.sourceFile, category: process.category, contentType: process.contentType }, () => { if (this.actions.locateProcess) void this.actions.locateProcess(process); else void openProcess(this.app, process); }); this.quickTasks.open();
			}) }] : []),
			{ key: 'menu', render: cell => { const button = cell.createEl('button', { cls: 'mx-inline-action mx-detail-menu', text: '···', attr: { 'aria-label': `管理 ${process.name}` } }); button.onclick = event => { event.stopPropagation(); const menu = new Menu(); menu.addItem(item => item.setTitle('打开详情').onClick(() => { void openProcess(this.app, process); })); menu.showAtMouseEvent(event); }; } },
		] });
	}
	async render(el: HTMLElement, direction: string): Promise<void> {
		const token = ++this.generation;
		if (!direction) return;
		try {
			const info = directionInfo(direction);
			const [markdown, longTermPlans] = await Promise.all([learningFiles(this.app).read(info.path), scanLongTermPlans(this.app)]);
			const allProcesses = processes(scanLearning(this.app), scanProjects(this.app), this.actions.tasks?.all() ?? []);
			const overview = directionOverviewModel(info.name, markdown, longTermPlans, allProcesses, path => {
				const file = this.app.vault.getAbstractFileByPath(path);
				return file instanceof TFile ? file.stat.mtime : 0;
			});
			if (token !== this.generation) return;
			el.empty();
			const toolbar = el.createDiv({ cls: 'po-topbar mx-direction-toolbar' }); const back = toolbar.createEl('button', { cls: 'po-cal__seg-btn', text: '← 返回首页' }); back.onclick = () => { if (this.actions.back) void this.actions.back(); };
			const directionMenu = toolbar.createEl('button', { cls: 'mx-inline-action mx-detail-menu mx-long-term-plan-menu', text: '···', attr: { 'aria-label': `管理方向 ${overview.direction}` } }); directionMenu.onclick = event => { event.stopPropagation(); const menu = new Menu(); menu.addItem(item => item.setTitle('编辑方向笔记').onClick(() => this.openSource(info.path))); menu.showAtMouseEvent(event); };
			const summary = el.createDiv({ cls: 'ad-update-block mx-long-term-summary mx-direction-summary' }); summary.createEl('h1', { cls: 'ad-modal-title', text: overview.direction }); summary.createEl('p', { cls: 'ad-modal-hint', text: [overview.tier, `长期能力 ${overview.abilities.length}`, `长期计划 ${overview.longTermPlans.length}`, `当前进程 ${overview.activeProcesses.length}`, `学习积累 ${overview.learningHistory.length}`].join(' · ') });
			const content = el.createDiv({ cls: 'mx-long-term-detail-content mx-direction-detail-content' });
			const narrative = content.createDiv({ cls: 'wb-section mx-long-term-narrative' }); const narrativeSection = narrative.createDiv({ cls: 'mx-long-term-narrative__section' }); const narrativeHead = narrativeSection.createDiv({ cls: 'mx-long-term-stage' }); const narrativeTitle = narrativeHead.createEl('button', { cls: 'mx-inline-action mx-narrative-title', text: '这条方向对我意味着什么' }); const narrativeMenu = narrativeHead.createEl('button', { cls: 'mx-inline-action mx-detail-menu', text: '···', attr: { 'aria-label': '管理方向说明' } }); const narrativeToggle = narrativeHead.createEl('button', { cls: 'mx-inline-action mx-long-term-stage-toggle', attr: { 'aria-label': '展开或收起方向说明' } }); const narrativeBody = narrativeSection.createDiv({ cls: 'mx-narrative-body' }); this.renderMarkdown(narrativeBody, overview.narrative, info.path, '尚未填写方向说明');
			const syncNarrative = () => { const expanded = this.narrativeExpanded.has(overview.direction); narrativeBody.hidden = !expanded; narrativeToggle.textContent = expanded ? '⌄' : '›'; narrativeToggle.setAttribute('aria-expanded', String(expanded)); narrativeTitle.setAttribute('aria-expanded', String(expanded)); }; const toggleNarrative = (event: MouseEvent) => { event.stopPropagation(); if (this.narrativeExpanded.has(overview.direction)) this.narrativeExpanded.delete(overview.direction); else this.narrativeExpanded.add(overview.direction); syncNarrative(); }; narrativeTitle.onclick = toggleNarrative; narrativeToggle.onclick = toggleNarrative; syncNarrative(); narrativeMenu.onclick = event => { event.stopPropagation(); const menu = new Menu(); menu.addItem(item => item.setTitle('编辑方向笔记').onClick(() => this.openSource(info.path))); menu.showAtMouseEvent(event); };
			const abilities = content.createDiv({ cls: 'ad-update-block mx-long-term-stages mx-direction-abilities' }); const abilityHead = abilities.createDiv({ cls: 'ad-card__head mx-detail-task-head' }); abilityHead.createEl('h2', { cls: 'ad-modal-title', text: '长期能力' }); abilityHead.createEl('button', { cls: 'mx-inline-action', text: '＋ 添加能力' }).onclick = () => new DirectionAbilityModal(this.app, overview.direction, async () => { await this.render(el, overview.direction); }).open();
			if (!overview.abilities.length) abilities.createDiv({ cls: 'po-empty mx-plan-empty mx-direction-empty', text: '尚未填写长期能力' });
			for (const [index, ability] of overview.abilities.entries()) { const row = abilities.createDiv({ cls: 'mx-long-term-stage-row mx-direction-ability-row' }); const rowHead = row.createDiv({ cls: 'mx-long-term-stage' }); const main = rowHead.createDiv({ cls: 'mx-long-term-stage-main' }); main.createSpan({ cls: 'mx-long-term-stage__number', text: String(index + 1).padStart(2, '0') }); main.createSpan({ cls: 'mx-long-term-stage__title', text: ability }); const actions = rowHead.createDiv({ cls: 'mx-long-term-stage-actions' }); const edit = () => new EditDirectionAbilityModal(this.app, overview.direction, ability, async () => { await this.render(el, overview.direction); }).open(); const menuButton = actions.createEl('button', { cls: 'mx-inline-action mx-long-term-stage-menu', text: '···', attr: { 'aria-label': `管理能力 ${ability}` } }); menuButton.onclick = event => { event.stopPropagation(); const menu = new Menu(); menu.addItem(item => item.setTitle('编辑能力').onClick(edit)); menu.showAtMouseEvent(event); }; const arrow = actions.createEl('button', { cls: 'mx-inline-action mx-long-term-stage-toggle', text: '›', attr: { 'aria-label': `编辑能力 ${ability}` } }); arrow.onclick = edit; }
			const planSection = content.createDiv({ cls: 'ad-update-block mx-direction-section mx-direction-long-term' }); const planHead = planSection.createDiv({ cls: 'ad-card__head mx-detail-task-head' }); planHead.createEl('h2', { cls: 'ad-modal-title', text: '长期计划' }); if (!overview.longTermPlans.length) planSection.createDiv({ cls: 'po-empty mx-plan-empty mx-direction-empty', text: '暂无长期计划' }); for (const plan of overview.longTermPlans) renderLongTermPlanSummaryRow(planSection, plan, () => { if (this.actions.openLongTermPlan) void this.actions.openLongTermPlan(plan.id); });
			const processSection = content.createDiv({ cls: 'ad-update-block mx-direction-section mx-direction-processes' }); const processHead = processSection.createDiv({ cls: 'ad-card__head mx-detail-task-head' }); processHead.createEl('h2', { cls: 'ad-modal-title', text: '当前进程' }); if (!overview.activeProcesses.length) processSection.createDiv({ cls: 'po-empty mx-plan-empty mx-direction-empty', text: '暂无当前进程' }); for (const process of overview.activeProcesses) this.renderProcess(processSection, process);
			const historySection = content.createDiv({ cls: 'ad-update-block mx-direction-section mx-direction-history' }); const historyHead = historySection.createDiv({ cls: 'ad-card__head mx-detail-task-head' }); historyHead.createEl('h2', { cls: 'ad-modal-title', text: '学习积累' }); historyHead.createSpan({ cls: 'ad-modal-hint mx-direction-section-count', text: `${overview.learningHistory.length} 条` }); if (!overview.learningHistory.length) historySection.createDiv({ cls: 'po-empty mx-plan-empty mx-direction-empty', text: '暂无学习积累' });
			for (const process of overview.recentLearningHistory) { const row = historySection.createDiv({ cls: 'wb-entry wb-entry--button mx-direction-history-row', attr: { role: 'button', tabindex: '0' } }); const body = row.createDiv({ cls: 'mx-long-term-row__body' }); body.createDiv({ cls: 'wb-entry__label', text: process.name }); body.createDiv({ cls: 'ad-modal-hint', text: `${processContentTypeLabel(process.contentType, true)} · ${process.status}` }); const open = () => { void openProcess(this.app, process); }; row.onclick = open; row.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }; }
		} catch {
			if (token === this.generation) { el.empty(); el.createEl('p', { text: '方向详情无法读取，请检查相关笔记是否已移动或删除。' }); }
		}
	}
}

export class DirectionView extends ItemView {
	private direction = '';
	private renderer: DirectionDetailRenderer;
	constructor(leaf: WorkspaceLeaf, private plugin?: Dashboard) {
		super(leaf);
		this.renderer = new DirectionDetailRenderer(this.app, {
			component: this,
			tasks: plugin?.embeddedTasks,
			back: () => plugin?.navigateWorkbench('home', this.leaf),
			openLongTermPlan: id => plugin?.openLongTermPlan(id),
			locateProcess: process => plugin?.locateWorkbenchProcess(process, this.leaf),
		});
	}
	getViewType(): string { return DIRECTION_VIEW; }
	getDisplayText(): string { return this.direction || '人生方向'; }
	getIcon(): string { return 'compass'; }
	getState() { return { direction: this.direction }; }
	async setState(state: { direction?: string }, result: ViewStateResult): Promise<void> {
		this.direction = typeof state.direction === 'string' ? state.direction : '';
		await this.render();
		await super.setState(state, result);
	}
	async onOpen(): Promise<void> {
		const update = () => { void this.render(); };
		this.registerEvent(this.app.metadataCache.on('changed', update));
		this.registerEvent(this.app.metadataCache.on('resolved', update));
		this.registerEvent(this.app.vault.on('modify', update));
		this.registerEvent(this.app.vault.on('delete', update));
		this.registerEvent(this.app.vault.on('rename', update));
		this.contentEl.addClass('mx-direction');
		this.contentEl.addClass('ad-modal');
		await this.render();
	}
	async onClose(): Promise<void> { this.renderer.cancel(); }
	private async render(): Promise<void> {
		await this.renderer.render(this.contentEl, this.direction);
	}
}
