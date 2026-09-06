import { App, Modal, Notice, TFile } from 'obsidian';
import { DAILY_TASK_FILE, embeddedSource, groupEmbedded } from '../data/embeddedTasks';
import type { EmbeddedTask, EmbeddedSourceType } from '../data/embeddedTasks';
import type { EmbeddedTaskStore } from '../data/embeddedTaskVault';
import { scanProjects } from '../data/projectVault';
import { beginListModal, closeListModal } from './viewPrimitives';

const LABELS = { project: '项目', learning: '学习', daily: '日常' };
export function openEmbeddedSource(app: App, task: EmbeddedTask): void {
	const file = app.vault.getAbstractFileByPath(task.sourceFile);
	if (!(file instanceof TFile)) { new Notice('来源笔记不存在或已移动'); return; }
	void app.workspace.getLeaf('tab').openFile(file).catch(e => new Notice(String(e)));
}
export function renderEmbeddedRows(parent: HTMLElement, tasks: EmbeddedTask[], app: App, store: EmbeddedTaskStore, onOpen?: () => void): void {
	if (!tasks.length) parent.createEl('p', { text: '暂无任务', cls: 'wb-empty' });
	for (const task of tasks) {
		const row = parent.createDiv({ cls: 'mx-task-row' });
		const check = row.createEl('input', { type: 'checkbox', attr: { 'aria-label': `完成任务：${task.text}` } });
		check.checked = task.completed;
		check.onchange = () => {
			check.disabled = true;
			void store.complete(task, check.checked).catch(e => { check.checked = task.completed; new Notice(String(e)); }).finally(() => { check.disabled = false; });
		};
		const body = row.createDiv({ cls: 'mx-task-body' });
		const title = body.createEl('button', { text: task.text, cls: 'mx-task-link' });
		if (task.completed) title.addClass('is-complete');
		const open = () => { openEmbeddedSource(app, task); onOpen?.(); };
		title.onclick = open;
		const meta = body.createDiv({ cls: 'mx-task-meta' });
		if (task.date) meta.createSpan({ text: `📅 ${task.date} · ` });
		meta.createEl('button', { text: `↳ ${task.sourceDisplayName}`, cls: 'mx-task-link', attr: { title: task.sourceFile } }).onclick = open;
	}
}
export class NewEmbeddedTaskModal extends Modal {
	constructor(app: App, private store: EmbeddedTaskStore, private presetPath?: string) { super(app); }
	onOpen(): void {
		const { contentEl } = this;
		// Keep the original TaskModal shell; only its fields and save target differ.
		contentEl.addClass('ad-task-modal');
		this.containerEl.closest('.modal-container')?.addClass('dashboard-modal');
		contentEl.createEl('h3', { cls: 'ad-modal-title', text: '新建任务' });
		let type: EmbeddedSourceType = (this.presetPath && embeddedSource(this.presetPath)) || 'daily'; let path = this.presetPath ?? DAILY_TASK_FILE;
		const titleField = contentEl.createDiv({ cls: 'ad-modal-field' });
		titleField.createEl('label', { cls: 'ad-modal-label', text: '任务内容' });
		const textInput = titleField.createEl('input', { cls: 'ad-modal-input ad-input-title', attr: { type: 'text', placeholder: '一次可以完成的具体行动', 'aria-label': '任务内容' } });
		const row = contentEl.createDiv({ cls: 'ad-modal-row' });
		const sources = row.createDiv({ cls: 'ad-modal-col' });
		sources.createEl('label', { cls: 'ad-modal-label', text: '归属' });
		const sourceSelect = sources.createEl('select', { cls: 'ad-modal-input', attr: { 'aria-label': '归属' } });
		for (const value of ['daily', 'project', 'learning'] as const) sourceSelect.createEl('option', { value, text: LABELS[value] });
		sourceSelect.value = type;
		const dateCol = row.createDiv({ cls: 'ad-modal-col' });
		dateCol.createEl('label', { cls: 'ad-modal-label', text: '日期（可选）' });
		const dateInput = dateCol.createEl('input', { cls: 'ad-modal-input', attr: { type: 'date', 'aria-label': '日期（可选）' } });
		const picker = contentEl.createDiv({ cls: 'ad-modal-field' });
		const renderPicker = () => {
			picker.empty();
			if (type === 'daily') { path = DAILY_TASK_FILE; picker.createEl('div', { cls: 'ad-modal-hint', text: '保存到：日常任务 → 日常待办' }); return; }
			const projectPaths = new Set(scanProjects(this.app).map(p => p.path));
			const files = this.app.vault.getMarkdownFiles().filter(f => embeddedSource(f.path) === type && (type !== 'project' || projectPaths.has(f.path))).sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
			// Scope + explicit selection determines project source; never scan unrelated folders.
			if (!files.some(f => f.path === path)) path = files[0]?.path ?? '';
			const label = type === 'project' ? '项目笔记' : '学习笔记 / 学习资源';
			picker.createEl('label', { cls: 'ad-modal-label', text: label });
			const select = picker.createEl('select', { cls: 'ad-modal-input', attr: { 'aria-label': label } });
			for (const file of files) select.createEl('option', { value: file.path, text: file.path });
			select.value = path;
			select.onchange = () => { path = select.value; };
			if (!files.length) picker.createEl('div', { cls: 'ad-modal-hint', text: `暂无${LABELS[type]}笔记，请先在${type === 'project' ? '03-项目与作品' : '01-学习与资料'}中新建笔记。` });
		};
		sourceSelect.onchange = () => { type = sourceSelect.value as EmbeddedSourceType; renderPicker(); };
		renderPicker();
		contentEl.createEl('div', { cls: 'ad-modal-hint', text: 'v1：计划执行 / 截止日期；不填则不进入今日执行' });
		const btns = contentEl.createDiv({ cls: 'ad-modal-btns' });
		btns.createEl('button', { cls: 'ad-modal-btn', text: '取消' }).onclick = () => this.close();
		const create = btns.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '创建任务' });
		create.onclick = async () => {
			create.disabled = true;
			try { if (!path) throw new Error('请先选择来源笔记'); await this.store.add(path, textInput.value, dateInput.value || undefined); this.close(); new Notice('任务已写入来源笔记'); }
			catch (e) { new Notice(String(e)); create.disabled = false; }
		};
		textInput.focus();
	}
	onClose(): void { this.containerEl.closest('.modal-container')?.removeClass('dashboard-modal'); this.contentEl.empty(); }
}
export class EmbeddedTaskListModal extends Modal {
	private unsubscribe?: () => void;
	constructor(app: App, private store: EmbeddedTaskStore, private path?: string) { super(app); }
	onOpen(): void {
		this.unsubscribe = this.store.subscribe(() => this.render());
		this.render();
		void this.store.refresh().catch(e => new Notice(String(e)));
	}
	private render(): void {
		beginListModal(this, this.path ? '项目任务' : '全部任务');
		const tasks = this.path ? this.store.bySource(this.path) : this.store.all();
		this.contentEl.createEl('p', { cls: 'ad-modal-hint', text: `总数 ${tasks.length} · 已完成 ${tasks.filter(t => t.completed).length} · 未完成 ${tasks.filter(t => !t.completed).length}` });
		this.contentEl.createDiv({ cls: 'po-toolbar' }).createEl('button', { cls: 'ad-modal-btn', text: '新建任务' }).onclick = () => new NewEmbeddedTaskModal(this.app, this.store, this.path).open();
		const groups = groupEmbedded(tasks);
		for (const type of ['project', 'learning', 'daily'] as const) {
			if (this.path && type !== 'project') continue;
			const group = this.contentEl.createDiv({ cls: 'ad-update-block' });
			group.createEl('h3', { cls: 'ad-modal-title', text: `${LABELS[type]}任务` });
			renderEmbeddedRows(group, groups[type], this.app, this.store, () => this.close());
		}
	}
	onClose(): void { this.unsubscribe?.(); this.unsubscribe = undefined; closeListModal(this); }
}
