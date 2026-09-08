import { App, Modal, Notice, TFile } from 'obsidian';
import { DAILY_TASK_FILE, groupEmbeddedForDisplay, TASK_DISPLAY_CATEGORIES, TASK_DISPLAY_LABELS, taskSourceSubtitle } from '../data/embeddedTasks';
import type { EmbeddedTask } from '../data/embeddedTasks';
import type { EmbeddedTaskStore } from '../data/embeddedTaskVault';
import { scanProjects } from '../data/projectVault';
import { scanLearning } from '../data/learningVault';
import { processes } from '../data/processes';
import { processCategoryLabel, processContentTypeLabel, taskSourceTypeLabel } from '../data/processContentTypes';
import { beginListModal, closeListModal } from './viewPrimitives';
import { renderEmbeddedTaskCheckbox } from '../components/tasks/EmbeddedTaskCheckbox';

export function openEmbeddedSource(app: App, task: EmbeddedTask): void {
	const file = app.vault.getAbstractFileByPath(task.sourceFile);
	if (!(file instanceof TFile)) { new Notice('来源笔记不存在或已移动'); return; }
	void app.workspace.getLeaf('tab').openFile(file).catch(e => new Notice(String(e)));
}
export function renderEmbeddedRows(parent: HTMLElement, tasks: EmbeddedTask[], app: App, store: EmbeddedTaskStore, onOpen?: () => void, sourceDetail?: (task: EmbeddedTask) => string): void {
	if (!tasks.length) parent.createEl('p', { text: '暂无任务', cls: 'wb-empty' });
	for (const task of tasks) {
		const row = parent.createDiv({ cls: 'mx-task-row' });
		renderEmbeddedTaskCheckbox(row, task, store);
		const body = row.createDiv({ cls: 'mx-task-body' });
		const title = body.createEl('button', { text: task.text, cls: 'mx-task-link' });
		if (task.completed) title.addClass('is-complete');
		const open = () => { openEmbeddedSource(app, task); onOpen?.(); };
		title.onclick = open;
		const detail = sourceDetail?.(task);
		const subtitle = taskSourceSubtitle(task, detail);
		if (task.date || subtitle) {
			const meta = body.createDiv({ cls: 'mx-task-meta' });
			if (task.date) meta.createSpan({ text: `📅 ${task.date}${subtitle ? ' · ' : ''}` });
			if (subtitle) meta.createEl('button', { text: `↳ ${subtitle}`, cls: 'mx-task-link', attr: { title: task.sourceFile } }).onclick = open;
		}
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
		// The same read-only Process Adapter as the overview excludes ordinary learning resources.
		const candidates = () => processes(scanLearning(this.app), scanProjects(this.app), [])
			.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.processType.localeCompare(b.processType) || a.sourceFile.localeCompare(b.sourceFile, 'zh-CN'));
		let assignment: 'daily' | 'process' = this.presetPath && this.presetPath !== DAILY_TASK_FILE ? 'process' : 'daily';
		let path = candidates().find(p => p.sourceFile === this.presetPath)?.sourceFile ?? '';
		let saving = false;
		const titleField = contentEl.createDiv({ cls: 'ad-modal-field' });
		titleField.createEl('label', { cls: 'ad-modal-label', text: '任务内容' });
		const textInput = titleField.createEl('input', { cls: 'ad-modal-input ad-input-title', attr: { type: 'text', placeholder: '一次可以完成的具体行动', 'aria-label': '任务内容' } });
		const row = contentEl.createDiv({ cls: 'ad-modal-row' });
		const sources = row.createDiv({ cls: 'ad-modal-col' });
		sources.createEl('label', { cls: 'ad-modal-label', text: '归属' });
		const sourceSelect = sources.createEl('select', { cls: 'ad-modal-input', attr: { 'aria-label': '归属' } });
		for (const [value, text] of [['daily', '日常'], ['process', '进程']] as const) sourceSelect.createEl('option', { value, text });
		sourceSelect.value = assignment;
		let picker: HTMLElement | undefined;
		const updateCreate = () => { create.disabled = saving || (assignment === 'process' && !path); };
		const renderPicker = () => {
			picker?.remove(); picker = undefined;
			if (assignment === 'daily') { path = ''; updateCreate(); return; }
			const items = candidates();
			if (!items.some(p => p.sourceFile === path)) path = '';
			picker = sources.createDiv({ cls: 'ad-modal-field' });
			picker.createEl('label', { cls: 'ad-modal-label', text: '所属进程' });
			const select = picker.createEl('select', { cls: 'ad-modal-input', attr: { 'aria-label': '所属进程' } });
			select.createEl('option', { value: '', text: '选择进程…' });
			for (const process of items) select.createEl('option', { value: process.sourceFile, text: `[${processCategoryLabel(process.category)}·${processContentTypeLabel(process.contentType, true)}] ${process.name}${process.direction ? ` · ${process.direction}` : ''}`, attr: { title: process.sourceFile } });
			select.value = path;
			select.onchange = () => { path = select.value; updateCreate(); };
			if (!items.length) picker.createEl('div', { cls: 'ad-modal-hint', text: '暂无可选进程，请先通过顶部“新建进程”创建学习或创作。' });
			updateCreate();
		};
		sourceSelect.onchange = () => { assignment = sourceSelect.value === 'process' ? 'process' : 'daily'; renderPicker(); };
		const dateField = contentEl.createDiv({ cls: 'ad-modal-field' });
		dateField.createEl('label', { cls: 'ad-modal-label', text: '日期（可选）' });
		const dateInput = dateField.createEl('input', { cls: 'ad-modal-input', attr: { type: 'date', 'aria-label': '日期（可选）' } });
		contentEl.createEl('div', { cls: 'ad-modal-hint', text: 'v1：计划执行 / 截止日期；不填则不进入今日执行' });
		const btns = contentEl.createDiv({ cls: 'ad-modal-btns' });
		btns.createEl('button', { cls: 'ad-modal-btn', text: '取消' }).onclick = () => this.close();
		const create = btns.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '创建任务' });
		create.onclick = async () => {
			if (saving) return;
			saving = true; updateCreate();
			try {
				const target = assignment === 'daily' ? DAILY_TASK_FILE : candidates().find(p => p.sourceFile === path)?.sourceFile;
				if (!target) { renderPicker(); throw new Error('请先选择有效的所属进程'); }
				await this.store.add(target, textInput.value, dateInput.value || undefined);
				this.close(); new Notice('任务已写入来源笔记');
			} catch (e) { new Notice(String(e)); }
			finally { saving = false; updateCreate(); }
		};
		renderPicker();
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
		if (this.path) {
			const group = this.contentEl.createDiv({ cls: 'ad-update-block' });
			group.createEl('h3', { cls: 'ad-modal-title', text: '项目任务' });
			renderEmbeddedRows(group, tasks, this.app, this.store, () => this.close());
			return;
		}
		if (!tasks.length) { this.contentEl.createEl('p', { text: '暂无任务', cls: 'wb-empty' }); return; }
		const sourceTypes = new Map(processes(scanLearning(this.app), scanProjects(this.app), tasks).map(process => [process.sourceFile, taskSourceTypeLabel(process.contentType)]));
		const groups = groupEmbeddedForDisplay(tasks);
		for (const type of TASK_DISPLAY_CATEGORIES) {
			if (!groups[type].length) continue;
			const group = this.contentEl.createDiv({ cls: 'ad-update-block' });
			group.createEl('h3', { cls: 'ad-modal-title', text: TASK_DISPLAY_LABELS[type] });
			renderEmbeddedRows(group, groups[type], this.app, this.store, () => this.close(), task => sourceTypes.get(task.sourceFile) ?? '');
		}
	}
	onClose(): void { this.unsubscribe?.(); this.unsubscribe = undefined; closeListModal(this); }
}
