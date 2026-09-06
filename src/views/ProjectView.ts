import { App, ItemView, Modal, Notice, Setting, WorkspaceLeaf } from 'obsidian';
import type { ViewStateResult } from 'obsidian';
import { createMengxuProject, filterProjects, PROJECT_STATUSES, projectDirections, projectSummary } from '../data/projects';
import type { MengxuProject, NewProject, ProjectStatus } from '../data/projects';
import { scanProjects } from '../data/projectVault';
import { learningFiles, openLearningFile } from '../data/learningVault';
import { todayStr } from '../data/taskLogic';
import type { EmbeddedTaskStore } from '../data/embeddedTaskVault';
import { NewEmbeddedTaskModal, renderEmbeddedRows } from './EmbeddedTaskModal';
import { parseEmbeddedTasks } from '../data/embeddedTasks';

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
		this.titleEl.setText('新建项目');
		const input: NewProject = { name: '', status: '计划中' };
		new Setting(this.contentEl).setName('项目名称').addText(t => t.onChange(v => input.name = v));
		new Setting(this.contentEl).setName('方向（可选）').addDropdown(d => { d.addOption('', '未关联'); for (const name of projectDirections()) d.addOption(name, name); d.onChange(v => input.direction = v); });
		new Setting(this.contentEl).setName('状态').addDropdown(d => { for (const s of PROJECT_STATUSES) d.addOption(s, s); d.onChange(v => input.status = v as ProjectStatus); });
		for (const [key, label] of [['startDate', '开始日期（可选）'], ['dueDate', '截止日期（可选）']] as const) {
			new Setting(this.contentEl).setName(label).addText(t => { t.inputEl.type = 'date'; t.onChange(v => input[key] = v); });
		}
		new Setting(this.contentEl).setName('项目目标（可选）').addTextArea(t => t.onChange(v => input.goal = v));
		new Setting(this.contentEl).addButton(b => b.setButtonText('创建项目').setCta().onClick(async () => {
			b.setDisabled(true);
			try {
				const id = crypto.randomUUID();
				const path = await createMengxuProject(learningFiles(this.app), input, id, todayStr());
				this.close();
				// MetadataCache catches up asynchronously; the registered view listens for it.
				await openProjects(this.app, { id, path });
			} catch (e) { new Notice(String(e)); b.setDisabled(false); }
		}));
	}
	onClose(): void { this.contentEl.empty(); }
}
export class ProjectView extends ItemView {
	private projectId = '';
	private path = '';
	private filter: ProjectStatus | '全部' = '全部';
	private generation = 0;
	constructor(leaf: WorkspaceLeaf, private tasks: EmbeddedTaskStore) { super(leaf); }
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
		this.contentEl.addClass('mx-project-view');
		const update = () => { void this.render(); };
		this.registerEvent(this.app.metadataCache.on('changed', update));
		this.registerEvent(this.app.metadataCache.on('resolved', update));
		this.registerEvent(this.app.vault.on('delete', update));
		this.registerEvent(this.app.vault.on('rename', update));
		this.register(this.tasks.subscribe(update));
		await this.render();
	}
	async onClose(): Promise<void> { this.generation++; }
	private async render(): Promise<void> {
		const token = ++this.generation;
		const projects = scanProjects(this.app);
		const el = this.contentEl;
		if (!this.projectId && !this.path) {
			el.empty(); el.createEl('h1', { text: '全部项目' });
			el.createEl('button', { text: '新建项目' }).onclick = () => new NewProjectModal(this.app).open();
			new Setting(el).setName('状态筛选').addDropdown(d => {
				d.addOption('全部', '全部'); for (const s of PROJECT_STATUSES) d.addOption(s, s);
				d.setValue(this.filter).onChange(v => { this.filter = v as ProjectStatus | '全部'; void this.render(); });
			});
			const shown = filterProjects(projects, this.filter);
			if (!shown.length) el.createEl('p', { text: '暂无项目' });
			for (const p of shown) {
				const card = el.createDiv({ cls: 'mx-project-card' });
				card.createEl('button', { text: p.name }).onclick = () => { void openProjects(this.app, p); };
				const tasks = this.tasks.bySource(p.path);
				card.createEl('p', { text: `${p.status} · 方向：${p.direction || '未关联'} · 开始：${p.startDate || '未设置'} · 截止：${p.dueDate || '未设置'} · 任务 ${tasks.filter(t => t.completed).length} / ${tasks.length}` });
			}
			return;
		}
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
