import type { Modal } from 'obsidian';

/** Existing author modal classes, without inheriting any legacy data behavior. */
export function beginListModal(modal: Modal, title: string): HTMLElement {
	modal.contentEl.empty();
	modal.contentEl.addClass('ad-task-modal');
	modal.containerEl.closest('.modal-container')?.addClass('dashboard-modal');
	modal.contentEl.createEl('h3', { cls: 'ad-modal-title', text: title });
	return modal.contentEl;
}
export function closeListModal(modal: Modal): void {
	modal.containerEl.closest('.modal-container')?.removeClass('dashboard-modal');
	modal.contentEl.empty();
}
export function listEntry(parent: HTMLElement, title: string, meta: string, open: () => void): void {
	const row = parent.createDiv({ cls: 'ad-update-block' });
	const button = row.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--ghost', text: title });
	button.onclick = open;
	row.createEl('p', { cls: 'ad-modal-hint', text: meta });
}

/** Shared detail-only task heading; callers retain their existing create action. */
export function detailTaskHeader(parent: HTMLElement, label: string, completed: number, total: number, add: () => void): void {
	const header = parent.createDiv({ cls: 'ad-card__head mx-detail-task-head' });
	const title = header.createEl('h2', { cls: 'ad-modal-title', text: label });
	title.createSpan({ cls: 'ad-modal-hint', text: ` · ${completed} / ${total}` });
	header.createEl('button', { cls: 'po-cal__seg-btn', text: '＋ 添加', attr: { type: 'button', 'aria-label': `添加${label}` } }).onclick = add;
}
