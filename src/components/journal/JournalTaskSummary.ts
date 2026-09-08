import { App, MarkdownPostProcessorContext, MarkdownRenderChild, Notice, TFile } from 'obsidian';
import type { EmbeddedTask } from '../../data/embeddedTasks';
import { TASK_DISPLAY_CATEGORIES, TASK_DISPLAY_LABELS } from '../../data/embeddedTasks';
import type { EmbeddedTaskStore } from '../../data/embeddedTaskVault';
import { journalDateFromPath, journalTasks, readJournalTitle, writeJournalTitle } from '../../data/journal';
import { taskCalendarSourceLabel } from '../../data/planWorkspace';
import { scanLearning } from '../../data/learningVault';
import { scanProjects } from '../../data/projectVault';
import { processes } from '../../data/processes';
import { taskSourceTypeLabel } from '../../data/processContentTypes';

/** Reading View augmentation only: the journal Markdown remains a clean anchor. */
class JournalTaskSummary extends MarkdownRenderChild {
	private sourceLabels = new Map<string, string>();

	constructor(
		private app: App,
		private store: EmbeddedTaskStore,
		private path: string,
		host: HTMLElement,
	) { super(host); }

	onload(): void {
		this.register(this.store.subscribe(() => this.render()));
		void this.store.ready.then(() => this.render());
		this.render();
	}

	private render(): void {
		if (!this.containerEl.isConnected) return;
		const tasks = this.store.all();
		this.sourceLabels = new Map(processes(scanLearning(this.app), scanProjects(this.app), tasks)
			.map(process => [process.sourceFile, taskSourceTypeLabel(process.contentType)]));
		const { date, groups } = journalTasks(tasks, this.path);
		this.containerEl.empty();
		if (!date) return;
		const total = TASK_DISPLAY_CATEGORIES.reduce((sum, category) => sum + groups[category].length, 0);
		if (!total) { this.containerEl.createDiv({ cls: 'wb-empty', text: '今日暂无任务' }); return; }
		for (const category of TASK_DISPLAY_CATEGORIES) {
			const categoryTasks = groups[category];
			if (!categoryTasks.length) continue;
			const group = this.containerEl.createDiv({ cls: 'wb-group mx-journal-task-group' });
			const header = group.createDiv({ cls: 'mx-journal-task-group__header' });
			header.createSpan({ cls: 'wb-group__label', text: TASK_DISPLAY_LABELS[category] });
			header.createSpan({ cls: 'mx-journal-task-count', text: `${categoryTasks.filter(task => task.completed).length} / ${categoryTasks.length}` });
			const content = group.createDiv({ cls: 'wb-group__content' });
			for (const task of categoryTasks) this.renderTask(content, task);
		}
	}

	private renderTask(parent: HTMLElement, task: EmbeddedTask): void {
		const row = parent.createDiv({ cls: 'po-cal__task mx-journal-task-row' });
		const check = row.createSpan({ cls: `po-check${task.completed ? ' is-done' : ''}`, attr: { role: 'checkbox', 'aria-checked': String(task.completed), 'aria-label': `${task.completed ? '取消完成' : '完成'} ${task.text}` } });
		check.addEventListener('click', event => {
			event.stopPropagation();
			void this.store.complete(task, !task.completed).catch(error => new Notice(`任务更新失败：${String(error)}`));
		});
		const body = row.createDiv({ cls: 'mx-journal-task-body' });
		body.createSpan({ cls: 'po-cal__task-name', text: task.text });
		body.createSpan({ cls: 'mx-journal-task-source', text: `${task.sourceDisplayName} · ${this.sourceLabels.get(task.sourceFile) ?? taskCalendarSourceLabel(task)}` });
		row.addEventListener('click', () => {
			const file = this.app.vault.getAbstractFileByPath(task.sourceFile);
			if (file instanceof TFile) void this.app.workspace.getLeaf('tab').openFile(file);
		});
	}
}

/** Reading View enhancement anchored inside `## 今日日记`; the title persists only in frontmatter. */
class JournalTitleEditor extends MarkdownRenderChild {
	private inputEl?: HTMLInputElement;
	private currentTitle = '';
	private saving = false;

	constructor(private app: App, private path: string, host: HTMLElement) { super(host); }

	onload(): void {
		this.currentTitle = this.readTitle();
		this.render();
		this.registerEvent(this.app.metadataCache.on('changed', file => {
			if (file.path !== this.path || this.saving || document.activeElement === this.inputEl) return;
			this.currentTitle = this.readTitle();
			if (this.inputEl) this.inputEl.value = this.currentTitle;
		}));
	}

	private readTitle(): string {
		const file = this.app.vault.getAbstractFileByPath(this.path);
		return file instanceof TFile ? readJournalTitle(this.app, file) : '';
	}

	private render(): void {
		this.containerEl.empty();
		const field = this.containerEl.createDiv({ cls: 'mx-journal-title-field' });
		field.createEl('label', { cls: 'ad-modal-label', text: '标题', attr: { for: `mx-journal-title-${this.path}` } });
		const input = field.createEl('input', {
			cls: 'ad-modal-input',
			attr: {
				id: `mx-journal-title-${this.path}`,
				type: 'text',
				value: this.currentTitle,
				placeholder: '输入今天这篇日记的标题',
				'aria-label': '今日日记标题',
				autocomplete: 'off',
			},
		});
		this.inputEl = input;
		input.addEventListener('keydown', event => {
			if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
			if (event.key === 'Escape') { input.value = this.currentTitle; input.blur(); }
		});
		input.addEventListener('change', () => { void this.save(input.value); });
	}

	private async save(rawTitle: string): Promise<void> {
		if (this.saving) return;
		const file = this.app.vault.getAbstractFileByPath(this.path);
		if (!(file instanceof TFile)) { new Notice('日记文件不存在'); return; }
		const title = rawTitle.trim();
		if (title === this.currentTitle) { if (this.inputEl) this.inputEl.value = title; return; }
		this.saving = true;
		if (this.inputEl) this.inputEl.disabled = true;
		try {
			await writeJournalTitle(this.app, file, title);
			this.currentTitle = title;
			if (this.inputEl) this.inputEl.value = title;
		} catch (error) {
			if (this.inputEl) this.inputEl.value = this.currentTitle;
			new Notice(`日记标题更新失败：${String(error)}`);
		} finally {
			this.saving = false;
			if (this.inputEl) this.inputEl.disabled = false;
		}
	}
}

export function mountJournalTaskSummary(
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	app: App,
	store: EmbeddedTaskStore,
): void {
	if (!journalDateFromPath(ctx.sourcePath)) return;
	for (const heading of Array.from(el.querySelectorAll('h2'))) {
		const title = heading.textContent?.trim();
		if (title === '今日任务') {
			if (heading.nextElementSibling?.classList.contains('mx-journal-task-summary')) continue;
			const host = heading.ownerDocument.createElement('div');
			host.className = 'mx-journal-task-summary';
			heading.insertAdjacentElement('afterend', host);
			ctx.addChild(new JournalTaskSummary(app, store, ctx.sourcePath, host));
		} else if (title === '今日日记') {
			if (heading.nextElementSibling?.classList.contains('mx-journal-title-editor')) continue;
			const host = heading.ownerDocument.createElement('div');
			host.className = 'mx-journal-title-editor';
			heading.insertAdjacentElement('afterend', host);
			ctx.addChild(new JournalTitleEditor(app, ctx.sourcePath, host));
		}
	}
}
