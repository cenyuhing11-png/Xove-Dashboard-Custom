import { App, ItemView, Modal, Notice, WorkspaceLeaf } from 'obsidian';
import type { ViewStateResult } from 'obsidian';
import { createMengxuProject, PROJECT_STATUSES, projectDirections, projectSummary } from '../data/projects';
import type { MengxuProject, NewProject, ProjectStatus } from '../data/projects';
import { scanProjects } from '../data/projectVault';
import { learningFiles, openLearningFile } from '../data/learningVault';
import { todayStr } from '../data/taskLogic';
import type { EmbeddedTaskStore } from '../data/embeddedTaskVault';
import { NewEmbeddedTaskModal, renderEmbeddedRows } from './EmbeddedTaskModal';
import { parseEmbeddedTasks } from '../data/embeddedTasks';
import { projectBoardItems } from '../data/projectBoardAdapter';
import { ProjectBoard } from './ProjectBoard';

export const PROJECT_VIEW = 'xove-dashboard-custom-projects';
export async function openProjects(app: App, project?: Pick<MengxuProject, 'id' | 'path'>): Promise<void> {
	try {
		const leaf = app.workspace.getLeavesOfType(PROJECT_VIEW)[0] ?? app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: PROJECT_VIEW, active: true, state: { projectId: project?.id || '', path: project?.path || '' } });
		await app.workspace.revealLeaf(leaf);
	} catch (e) { new Notice(`无法打开项目：${String(e)}`); }
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
	private generation = 0;
	constructor(leaf: WorkspaceLeaf, private tasks: EmbeddedTaskStore, private theme: () => 'light' | 'dark' | 'auto' = () => 'auto') { super(leaf); }
	getViewType(): string { return PROJECT_VIEW; }
	getDisplayText(): string { return this.path ? this.path.split('/').pop()!.replace(/\.md$/, '') : '全部项目'; }
	getIcon(): string { return 'folder-kanban'; }
	getState() { return { projectId: this.projectId, path: this.path }; }
	async setState(state: { projectId?: string; path?: string }, result: ViewStateResult): Promise<void> {
		this.projectId = typeof state.projectId === 'string' ? state.projectId : '';
		this.path = typeof state.path === 'string' ? state.path : '';
		await this.render(); await super.setState(state, result);
	}
	async onOpen(): Promise<void> {
		const update = () => { void this.render(); };
		this.registerEvent(this.app.workspace.on('css-change', update));
		this.registerEvent(this.app.metadataCache.on('changed', update));
		this.registerEvent(this.app.metadataCache.on('resolved', update));
		this.registerEvent(this.app.vault.on('delete', update));
		this.registerEvent(this.app.vault.on('rename', update));
		this.register(this.tasks.subscribe(update));
		await this.render();
	}
	async onClose(): Promise<void> { this.generation++; this.overview?.dispose(); }
	private async render(): Promise<void> {
		const token = ++this.generation;
		const projects = scanProjects(this.app);
		const el = this.contentEl;
		if (!this.projectId && !this.path) {
			el.removeClass('mx-project-view');
			if (!this.overview || !this.overviewEl) {
				el.empty();
				this.overviewEl = el.createDiv({ cls: 'dashboard-plugin mx-project-overview' });
				const boardEl = this.overviewEl.createDiv({ cls: 'po-board' });
				this.overview = new ProjectBoard({ kind: 'mengxu', app: this.app, boardEl, tasks: this.tasks,
					items: () => projectBoardItems(scanProjects(this.app), this.tasks.all()),
					open: item => { void openProjects(this.app, item.project); },
					create: () => new NewProjectModal(this.app).open(),
				});
			}
			if (this.overviewEl.parentElement !== el) { el.empty(); el.appendChild(this.overviewEl); }
			const theme = this.theme();
			this.overviewEl.setAttribute('data-theme', theme === 'auto' ? (document.body.classList.contains('theme-light') ? 'light' : 'dark') : theme);
			await this.overview.show();
			return;
		}
		this.overview?.dispose();
		el.addClass('mx-project-view');
		const matches = projects.filter(p => this.projectId ? p.id === this.projectId : p.path === this.path);
		if (matches.length !== 1) {
			el.empty(); el.createEl('p', { text: matches.length > 1 ? '项目 ID 重复，请在原笔记中修正后重试。' : '项目不存在、正在索引或 Properties 无效。' });
			el.createEl('button', { text: '全部项目 →' }).onclick = () => { void openProjects(this.app); }; return;
		}
		const project = matches[0]!;
		try {
			const content = await learningFiles(this.app).read(project.path);
			if (token !== this.generation) return;
			this.path = project.path;
			const summary = projectSummary(project, content);
			el.empty();
			el.createEl('button', { text: '全部项目 →' }).onclick = () => { void openProjects(this.app); };
			el.createEl('h1', { text: project.name });
			el.createEl('p', { text: `${project.status} · 方向：${project.direction || '未关联'}` });
			el.createEl('p', { text: `开始日期：${project.startDate || '未设置'} · 截止日期：${project.dueDate || '未设置'}` });
			el.createEl('h2', { text: '项目目标' }); el.createEl('p', { text: summary.goal || '尚未填写项目目标' });
			el.createEl('h2', { text: '项目任务' });
			el.createEl('p', { text: `总数 ${summary.total} · 已完成 ${summary.done} · 未完成 ${summary.total - summary.done}` });
			el.createEl('button', { text: '添加项目任务' }).onclick = () => new NewEmbeddedTaskModal(this.app, this.tasks, project.path).open();
			// Keep counts and rows on the same Markdown snapshot during metadata/index refreshes.
			renderEmbeddedRows(el, parseEmbeddedTasks(project.path, content), this.app, this.tasks);
			for (const [heading, text] of [['项目资料', summary.materials], ['过程记录', summary.progress], ['最终成果', summary.outcome]]) {
				el.createEl('h2', { text: heading }); el.createEl('p', { text: text || '尚未填写，详情见项目笔记' });
			}
			el.createEl('button', { text: '编辑项目笔记 →' }).onclick = () => { void openLearningFile(this.app, project.path).catch(e => new Notice(String(e))); };
		} catch { if (token === this.generation) { el.empty(); el.createEl('p', { text: '项目笔记无法读取，请检查是否已移动或删除。' }); } }
	}
}
