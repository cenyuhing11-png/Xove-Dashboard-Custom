import { App, ItemView, Modal, Notice, WorkspaceLeaf } from 'obsidian';
import type { ViewStateResult } from 'obsidian';
import { createMengxuProject, PROJECT_STATUSES, projectDirections, projectSummary } from '../data/projects';
import type { MengxuProject, NewProject, ProjectStatus } from '../data/projects';
import { scanProjects } from '../data/projectVault';
import { learningFiles, openLearningFile, scanLearning } from '../data/learningVault';
import { LEARNING_ROOT } from '../data/learning';
import { todayStr } from '../data/taskLogic';
import type { EmbeddedTaskStore } from '../data/embeddedTaskVault';
import { NewEmbeddedTaskModal, renderEmbeddedRows } from './EmbeddedTaskModal';
import { parseEmbeddedTasks } from '../data/embeddedTasks';
import { processes, processBoardItems } from '../data/processes';
import type { Process } from '../data/processes';
import { NewLearningModal } from './LearningModals';
import { renderLearningProcessDetail } from './LearningProcessDetail';
import { ProjectBoard } from './ProjectBoard';
import { WorkbenchShell } from '../components/workbench/WorkbenchShell';
import { renderLifeCompass } from '../components/workbench/LifeCompass';
import { openDirection } from './DirectionView';
import type Dashboard from '../main';

export const PROJECT_VIEW = 'xove-dashboard-custom-projects';
export async function openProjects(app: App, project?: Pick<MengxuProject, 'id' | 'path'>, timeline?: 'calendar' | 'gantt'): Promise<void> {
	try {
		const leaf = app.workspace.getLeavesOfType(PROJECT_VIEW)[0] ?? app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: PROJECT_VIEW, active: true, state: { projectId: project?.id || '', path: project?.path || '', timeline } });
		await app.workspace.revealLeaf(leaf);
		app.workspace.setActiveLeaf(leaf, { focus: true });
	} catch (e) { new Notice(`无法打开进程：${String(e)}`); }
}
export function openProcess(app: App, process: Process): Promise<void> {
	return openProjects(app, { id: process.processType === 'project' && process.id !== `project:${process.sourceFile}` ? process.id : '', path: process.sourceFile });
}
export class NewProjectModal extends Modal {
	onOpen(): void {
		const { contentEl } = this;
		// Reuse ProjectModal's original shell without restoring its legacy data model.
		contentEl.addClass('ad-task-modal');
		this.containerEl.closest('.modal-container')?.addClass('dashboard-modal');
		contentEl.createEl('h3', { cls: 'ad-modal-title', text: '新建项目' });
		const input: NewProject = { name: '', status: '计划中' };
		contentEl.createEl('label', { cls: 'ad-modal-label', text: '项目名称' });
		const nameInput = contentEl.createEl('input', { cls: 'ad-modal-input ad-input-name', attr: { type: 'text', 'aria-label': '项目名称' } });
		nameInput.oninput = () => { input.name = nameInput.value; };
		contentEl.createEl('label', { cls: 'ad-modal-label', text: '方向（可选）' });
		const directionRow = contentEl.createDiv({ cls: 'ad-modal-row' });
		const direction = directionRow.createEl('select', { cls: 'ad-modal-input', attr: { 'aria-label': '方向（可选）' } });
		direction.createEl('option', { value: '', text: '未关联' });
		for (const name of projectDirections()) direction.createEl('option', { value: name, text: name });
		direction.onchange = () => { input.direction = direction.value; };
		const dates = contentEl.createDiv({ cls: 'ad-modal-row' });
		for (const [key, label] of [['startDate', '开始日期（可选）'], ['dueDate', '截止日期（可选）']] as const) {
			const col = dates.createDiv({ cls: 'ad-modal-col' });
			col.createEl('label', { cls: 'ad-modal-label', text: label });
			const date = col.createEl('input', { cls: 'ad-modal-input', attr: { type: 'date', 'aria-label': label } });
			date.oninput = () => { input[key] = date.value; };
		}
		contentEl.createEl('label', { cls: 'ad-modal-label', text: '项目目标（可选）' });
		const goal = contentEl.createEl('textarea', { cls: 'ad-modal-input', attr: { rows: '3', 'aria-label': '项目目标（可选）' } });
		goal.oninput = () => { input.goal = goal.value; };
		const statusField = contentEl.createDiv({ cls: 'ad-modal-field' });
		statusField.createEl('label', { cls: 'ad-modal-label', text: '状态' });
		const statusRow = statusField.createDiv({ cls: 'ad-modal-row' });
		const status = statusRow.createEl('select', { cls: 'ad-modal-input', attr: { 'aria-label': '状态' } });
		for (const s of PROJECT_STATUSES) status.createEl('option', { value: s, text: s });
		status.value = input.status;
		status.onchange = () => { input.status = status.value as ProjectStatus; };
		const btns = contentEl.createDiv({ cls: 'ad-modal-btns' });
		btns.createEl('button', { cls: 'ad-modal-btn', text: '取消' }).onclick = () => this.close();
		const create = btns.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '创建项目' });
		create.onclick = async () => {
			create.disabled = true;
			try {
				const id = crypto.randomUUID();
				const path = await createMengxuProject(learningFiles(this.app), input, id, todayStr());
				this.close();
				// MetadataCache catches up asynchronously; the registered view listens for it.
				await openProjects(this.app, { id, path });
			} catch (e) { new Notice(String(e)); create.disabled = false; }
		};
		nameInput.focus();
	}
	onClose(): void { this.containerEl.closest('.modal-container')?.removeClass('dashboard-modal'); this.contentEl.empty(); }
}
export class ProjectView extends ItemView {
	private projectId = '';
	private path = '';
	private overview?: ProjectBoard;
	private overviewEl?: HTMLElement;
	private shell?: WorkbenchShell;
	private generation = 0;
	private timeline?: 'calendar' | 'gantt';
	constructor(leaf: WorkspaceLeaf, private tasks: EmbeddedTaskStore, private theme: () => 'light' | 'dark' | 'auto' = () => 'auto', private plugin?: Dashboard) { super(leaf); }
	getViewType(): string { return PROJECT_VIEW; }
	getDisplayText(): string { return this.path ? this.path.split('/').pop()!.replace(/\.md$/, '') : '全部进程'; }
	getIcon(): string { return 'folder-kanban'; }
	getState() { return { projectId: this.projectId, path: this.path }; }
	async setState(state: { projectId?: string; path?: string; timeline?: string }, result: ViewStateResult): Promise<void> {
		this.projectId = typeof state.projectId === 'string' ? state.projectId : '';
		this.path = typeof state.path === 'string' ? state.path : '';
		this.timeline = state.timeline === 'calendar' || state.timeline === 'gantt' ? state.timeline : undefined;
		await this.render(); await super.setState(state, result);
	}
	async onOpen(): Promise<void> {
		const update = () => { void this.render(); };
		this.registerEvent(this.app.workspace.on('css-change', update));
		this.registerEvent(this.app.metadataCache.on('changed', update));
		this.registerEvent(this.app.metadataCache.on('resolved', update));
		this.registerEvent(this.app.vault.on('delete', update));
		this.registerEvent(this.app.vault.on('rename', update));
		this.register(this.tasks.subscribe(() => {
			if (!this.projectId && !this.path && this.overview) this.overview.refreshTaskProgress();
			else update();
		}));
		await this.render();
	}
	async onClose(): Promise<void> { this.generation++; this.overview?.closeTaskPreview(); this.overview?.dispose(); if (this.shell) this.removeChild(this.shell); this.shell = undefined; }
	private async render(): Promise<void> {
		const token = ++this.generation;
		const projects = scanProjects(this.app);
		const el = this.contentEl;
		if (!this.projectId && !this.path) {
			el.removeClass('mx-project-view');
			el.removeClass('ad-modal');
			if (!this.overview || !this.overviewEl) {
				el.empty();
				this.overviewEl = el.createDiv({ cls: 'dashboard-plugin mx-project-overview' });
				renderLifeCompass(this.overviewEl, name => { void openDirection(this.app, name); });
				const boardEl = this.overviewEl.createDiv({ cls: 'po-board' });
				this.overview = new ProjectBoard({ kind: 'mengxu', app: this.app, boardEl, tasks: this.tasks,
					items: () => processBoardItems(processes(scanLearning(this.app), scanProjects(this.app), this.tasks.all())),
					open: item => { if ('process' in item) void openProcess(this.app, item.process); else void openProjects(this.app, item.project); },
					create: () => new NewProjectModal(this.app).open(),
					createLearning: () => new NewLearningModal(this.app, '学习主题').open(),
				});
			}
			if (this.overviewEl.parentElement !== el) { el.empty(); el.appendChild(this.overviewEl); }
			if (!this.shell && this.plugin) {
				this.shell = new WorkbenchShell(this.plugin, this.overviewEl, action => this.plugin!.navigateWorkbench(action), 'all');
				this.addChild(this.shell);
			}
			const theme = this.theme();
			this.overviewEl.setAttribute('data-theme', theme === 'auto' ? (document.body.classList.contains('theme-light') ? 'light' : 'dark') : theme);
			if (this.timeline) { const timeline = this.timeline; this.timeline = undefined; await this.overview.openView(timeline); }
			else await this.overview.show();
			return;
		}
		this.overview?.dispose();
		if (this.shell) { this.removeChild(this.shell); this.shell = undefined; }
		el.addClass('mx-project-view');
		el.addClass('ad-modal');
		if (!this.projectId && this.path.startsWith(`${LEARNING_ROOT}/`)) {
			const notes = scanLearning(this.app);
			const note = notes.find(n => n.kind === '学习主题' && n.path === this.path);
			try {
				if (!note) throw new Error('学习主题不存在、正在索引或 Properties 无效');
				const content = await learningFiles(this.app).read(note.path);
				if (token === this.generation) renderLearningProcessDetail(el, this.app, this.tasks, note, notes, content, () => { void openProjects(this.app); });
			} catch { if (token === this.generation) { el.empty(); el.createEl('p', { cls: 'po-empty', text: '学习主题无法读取，请检查是否已移动或删除。' }); el.createEl('button', { cls: 'ad-modal-btn', text: '全部进程 →' }).onclick = () => { void openProjects(this.app); }; } }
			return;
		}
		const matches = projects.filter(p => this.projectId ? p.id === this.projectId : p.path === this.path);
		if (matches.length !== 1) {
			el.empty(); el.createEl('p', { cls: 'po-empty', text: matches.length > 1 ? '项目 ID 重复，请在原笔记中修正后重试。' : '项目不存在、正在索引或 Properties 无效。' });
			el.createEl('button', { cls: 'ad-modal-btn', text: '全部进程 →' }).onclick = () => { void openProjects(this.app); }; return;
		}
		const project = matches[0]!;
		try {
			const content = await learningFiles(this.app).read(project.path);
			if (token !== this.generation) return;
			this.path = project.path;
			const summary = projectSummary(project, content);
			el.empty();
			el.createDiv({ cls: 'po-topbar' }).createEl('button', { cls: 'ad-modal-btn', text: '全部进程 →' }).onclick = () => { void openProjects(this.app); };
			el.createEl('h1', { cls: 'ad-modal-title', text: project.name });
			el.createEl('p', { cls: 'ad-modal-hint', text: `${project.status} · 方向：${project.direction || '未关联'}` });
			el.createEl('p', { cls: 'ad-modal-hint', text: `开始日期：${project.startDate || '未设置'} · 截止日期：${project.dueDate || '未设置'}` });
			const goal = el.createDiv({ cls: 'ad-update-block' });
			goal.createEl('h2', { cls: 'ad-modal-title', text: '项目目标' }); goal.createEl('p', { cls: 'ad-modal-desc', text: summary.goal || '尚未填写项目目标' });
			const tasks = el.createDiv({ cls: 'ad-update-block' });
			tasks.createEl('h2', { cls: 'ad-modal-title', text: '项目任务' });
			tasks.createEl('p', { cls: 'ad-modal-hint', text: `总数 ${summary.total} · 已完成 ${summary.done} · 未完成 ${summary.total - summary.done}` });
			tasks.createEl('button', { cls: 'ad-modal-btn', text: '添加项目任务' }).onclick = () => new NewEmbeddedTaskModal(this.app, this.tasks, project.path).open();
			// Keep counts and rows on the same Markdown snapshot during metadata/index refreshes.
			renderEmbeddedRows(tasks, parseEmbeddedTasks(project.path, content), this.app, this.tasks);
			for (const [heading, text] of [['项目资料', summary.materials], ['过程记录', summary.progress], ['最终成果', summary.outcome]]) {
				const section = el.createDiv({ cls: 'ad-update-block' });
				section.createEl('h2', { cls: 'ad-modal-title', text: heading }); section.createEl('p', { cls: 'ad-modal-desc', text: text || '尚未填写，详情见项目笔记' });
			}
			el.createEl('button', { cls: 'ad-modal-btn', text: '编辑项目笔记 →' }).onclick = () => { void openLearningFile(this.app, project.path).catch(e => new Notice(String(e))); };
		} catch { if (token === this.generation) { el.empty(); el.createEl('p', { text: '项目笔记无法读取，请检查是否已移动或删除。' }); } }
	}
}
