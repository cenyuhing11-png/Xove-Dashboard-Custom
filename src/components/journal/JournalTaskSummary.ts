import { App, MarkdownPostProcessorContext, MarkdownRenderChild, Notice, TFile } from 'obsidian';
import type { EmbeddedTask } from '../../data/embeddedTasks';
import { TASK_DISPLAY_CATEGORIES, TASK_DISPLAY_LABELS } from '../../data/embeddedTasks';
import type { EmbeddedTaskStore } from '../../data/embeddedTaskVault';
import { journalDateFromPath, journalTasks } from '../../data/journal';
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

export function mountJournalTaskSummary(
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	app: App,
	store: EmbeddedTaskStore,
): void {
	if (!journalDateFromPath(ctx.sourcePath)) return;
	for (const heading of Array.from(el.querySelectorAll('h2'))) {
		if (heading.textContent?.trim() !== '今日任务') continue;
		if (heading.nextElementSibling?.classList.contains('mx-journal-task-summary')) continue;
		const host = heading.ownerDocument.createElement('div');
		host.className = 'mx-journal-task-summary';
		heading.insertAdjacentElement('afterend', host);
		ctx.addChild(new JournalTaskSummary(app, store, ctx.sourcePath, host));
	}
}
