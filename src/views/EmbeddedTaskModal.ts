import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { DAILY_TASK_FILE, embeddedSource, groupEmbedded } from '../data/embeddedTasks';
import type { EmbeddedTask, EmbeddedSourceType } from '../data/embeddedTasks';
import type { EmbeddedTaskStore } from '../data/embeddedTaskVault';

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
		this.titleEl.setText('新建任务');
		let text = ''; let date = ''; let type: EmbeddedSourceType = (this.presetPath && embeddedSource(this.presetPath)) || 'daily'; let path = this.presetPath ?? DAILY_TASK_FILE;
		new Setting(this.contentEl).setName('任务内容').addText(input => input.setPlaceholder('一次可以完成的具体行动').onChange(value => text = value));
		const sources = this.contentEl.createDiv();
		const picker = this.contentEl.createDiv();
		const renderPicker = () => {
			picker.empty();
			if (type === 'daily') { path = DAILY_TASK_FILE; picker.createEl('p', { text: '保存到：日常任务 → 日常待办' }); return; }
			const files = this.app.vault.getMarkdownFiles().filter(f => embeddedSource(f.path) === type).sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
			// Scope + explicit selection determines project source; never scan unrelated folders.
			if (!files.some(f => f.path === path)) path = files[0]?.path ?? '';
			new Setting(picker).setName(type === 'project' ? '项目笔记' : '学习笔记 / 学习资源').addDropdown(select => {
				for (const file of files) select.addOption(file.path, file.path);
				select.setValue(path).onChange(value => path = value);
			});
			if (!files.length) picker.createEl('p', { text: `暂无${LABELS[type]}笔记，请先在${type === 'project' ? '03-项目与作品' : '01-学习与资料'}中新建笔记。` });
		};
		new Setting(sources).setName('归属').addDropdown(select => {
			select.addOption('daily', '日常').addOption('project', '项目').addOption('learning', '学习').setValue(type).onChange(value => { type = value as EmbeddedSourceType; renderPicker(); });
		});
		renderPicker();
		new Setting(this.contentEl).setName('日期（可选）').setDesc('v1：计划执行 / 截止日期；不填则不进入今日执行').addText(input => { input.inputEl.type = 'date'; input.onChange(value => date = value); });
		new Setting(this.contentEl).addButton(button => button.setButtonText('创建任务').setCta().onClick(async () => {
			button.setDisabled(true);
			try { if (!path) throw new Error('请先选择来源笔记'); await this.store.add(path, text, date || undefined); this.close(); new Notice('任务已写入来源笔记'); }
			catch (e) { new Notice(String(e)); button.setDisabled(false); }
		}));
	}
	onClose(): void { this.contentEl.empty(); }
}
export class EmbeddedTaskListModal extends Modal {
	private unsubscribe?: () => void;
	constructor(app: App, private store: EmbeddedTaskStore, private path?: string) { super(app); }
	onOpen(): void {
		this.titleEl.setText(this.path ? '项目任务' : '全部任务');
		this.unsubscribe = this.store.subscribe(() => this.render());
		this.render();
		void this.store.refresh().catch(e => new Notice(String(e)));
	}
	private render(): void {
		this.contentEl.empty();
		const tasks = this.path ? this.store.bySource(this.path) : this.store.all();
		this.contentEl.createEl('p', { text: `总数 ${tasks.length} · 已完成 ${tasks.filter(t => t.completed).length} · 未完成 ${tasks.filter(t => !t.completed).length}` });
		this.contentEl.createEl('button', { text: '新建任务' }).onclick = () => new NewEmbeddedTaskModal(this.app, this.store, this.path).open();
		const groups = groupEmbedded(tasks);
		for (const type of ['project', 'learning', 'daily'] as const) {
			if (this.path && type !== 'project') continue;
			this.contentEl.createEl('h3', { text: `${LABELS[type]}任务` });
			renderEmbeddedRows(this.contentEl, groups[type], this.app, this.store, () => this.close());
		}
	}
	onClose(): void { this.unsubscribe?.(); this.contentEl.empty(); }
}
