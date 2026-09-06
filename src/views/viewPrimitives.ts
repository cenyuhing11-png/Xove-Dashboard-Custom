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
