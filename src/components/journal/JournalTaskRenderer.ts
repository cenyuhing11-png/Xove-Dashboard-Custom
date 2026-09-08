import { App, Notice, TFile } from 'obsidian';
import type { EmbeddedTask } from '../../data/embeddedTasks';
import { TASK_DISPLAY_CATEGORIES, TASK_DISPLAY_LABELS } from '../../data/embeddedTasks';
import type { EmbeddedTaskStore } from '../../data/embeddedTaskVault';
import { journalTasks } from '../../data/journal';
import { taskCalendarSourceLabel } from '../../data/planWorkspace';
import { scanLearning } from '../../data/learningVault';
import { scanProjects } from '../../data/projectVault';
import { processes } from '../../data/processes';
import { taskSourceTypeLabel } from '../../data/processContentTypes';

/** Shared Reading/Live Preview renderer. It never writes into the journal Markdown. */
export function renderJournalTaskSummary(parent: HTMLElement, app: App, store: EmbeddedTaskStore, path: string): void {
	const tasks = store.all();
	const sourceLabels = new Map(processes(scanLearning(app), scanProjects(app), tasks)
		.map(process => [process.sourceFile, taskSourceTypeLabel(process.contentType)]));
	const { date, groups } = journalTasks(tasks, path);
	parent.empty();
	if (!date) return;
	const total = TASK_DISPLAY_CATEGORIES.reduce((sum, category) => sum + groups[category].length, 0);
	if (!total) { parent.createDiv({ cls: 'wb-empty', text: '今日暂无任务' }); return; }
	for (const category of TASK_DISPLAY_CATEGORIES) {
		const categoryTasks = groups[category];
		if (!categoryTasks.length) continue;
		const group = parent.createDiv({ cls: 'wb-group mx-journal-task-group' });
		const header = group.createDiv({ cls: 'mx-journal-task-group__header' });
		header.createSpan({ cls: 'wb-group__label', text: TASK_DISPLAY_LABELS[category] });
		header.createSpan({ cls: 'mx-journal-task-count', text: `${categoryTasks.filter(task => task.completed).length} / ${categoryTasks.length}` });
		const content = group.createDiv({ cls: 'wb-group__content' });
		for (const task of categoryTasks) renderJournalTask(content, task, app, store, sourceLabels);
	}
}

function renderJournalTask(parent: HTMLElement, task: EmbeddedTask, app: App, store: EmbeddedTaskStore, sourceLabels: Map<string, string>): void {
	const row = parent.createDiv({ cls: 'po-cal__task mx-journal-task-row' });
	const check = row.createSpan({ cls: `po-check${task.completed ? ' is-done' : ''}`, attr: { role: 'checkbox', 'aria-checked': String(task.completed), 'aria-label': `${task.completed ? '取消完成' : '完成'} ${task.text}` } });
	check.addEventListener('click', event => {
		event.stopPropagation();
		void store.complete(task, !task.completed).catch(error => new Notice(`任务更新失败：${String(error)}`));
	});
	const body = row.createDiv({ cls: 'mx-journal-task-body' });
	body.createSpan({ cls: 'po-cal__task-name', text: task.text });
	body.createSpan({ cls: 'mx-journal-task-source', text: `${task.sourceDisplayName} · ${sourceLabels.get(task.sourceFile) ?? taskCalendarSourceLabel(task)}` });
	row.addEventListener('click', () => {
		const file = app.vault.getAbstractFileByPath(task.sourceFile);
		if (file instanceof TFile) void app.workspace.getLeaf('tab').openFile(file);
	});
}
