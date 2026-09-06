import { taskProgressLabel } from '../data/processes.ts';

export function updateTaskProgressPill(pill: HTMLButtonElement, name: string, total: number, completed: number): void {
	pill.setText(taskProgressLabel(total, completed));
	pill.disabled = total === 0;
	pill.setAttribute('aria-label', `${name}：${total ? '查看任务 ' : ''}${taskProgressLabel(total, completed)}`);
	pill.title = total ? '快速查看任务' : '暂无任务';
}
/** Stop pointer/keyboard bubbling so a card's detail action is never also triggered. */
export function renderTaskProgressPill(parent: HTMLElement, name: string, sourceFile: string, total: number, completed: number, open: () => void): HTMLButtonElement {
	const pill = parent.createEl('button', { cls: 'ad-modal-btn po-count po-task-progress', type: 'button' });
	pill.dataset.sourceFile = sourceFile;
	updateTaskProgressPill(pill, name, total, completed);
	pill.onclick = event => { event.stopPropagation(); if (!pill.disabled) open(); };
	pill.onkeydown = event => { event.stopPropagation(); };
	return pill;
}
