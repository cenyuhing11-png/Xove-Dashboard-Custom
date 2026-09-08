import { Notice } from 'obsidian';
import type { EmbeddedTask } from '../../data/embeddedTasks';
import type { EmbeddedTaskStore } from '../../data/embeddedTaskVault';

/** One native checkbox and one write callback for every Embedded Task summary surface. */
export function renderEmbeddedTaskCheckbox(parent: HTMLElement, task: EmbeddedTask, store: EmbeddedTaskStore): HTMLInputElement {
	const check = parent.createEl('input', {
		cls: 'po-check mx-embedded-task-check',
		type: 'checkbox',
		attr: { 'aria-label': `${task.completed ? '取消完成' : '完成'} ${task.text}` },
	});
	check.checked = task.completed;
	check.onclick = event => event.stopPropagation();
	check.onchange = () => {
		check.disabled = true;
		void store.complete(task, check.checked)
			.catch(error => { check.checked = task.completed; new Notice(`任务更新失败：${String(error)}`); })
			.finally(() => { check.disabled = false; });
	};
	return check;
}
