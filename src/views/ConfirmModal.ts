import { App, Modal } from 'obsidian';

/* ============================================================
   Generic Confirm Modal — replaces native confirm()/alert(),
   which break keyboard focus in Obsidian/Electron and make
   subsequently opened modals unable to receive input.
   ============================================================ */

export interface ConfirmModalOptions {
	app: App;
	title: string;
	message: string;
	confirmLabel: string;
	cancelLabel: string;
	onConfirm: () => void;
	onCancel?: () => void;
	confirmStyle?: 'primary' | 'danger';
}

export class ConfirmModal extends Modal {
	private opts: ConfirmModalOptions;
	private confirmed = false;

	constructor(opts: ConfirmModalOptions) {
		super(opts.app);
		this.opts = opts;
	}

	onOpen(): void {
		this.confirmed = false;
		const { contentEl } = this;
		contentEl.addClass('ad-confirm-modal');
		contentEl.createEl('h3', { cls: 'ad-modal-title', text: this.opts.title });
		contentEl.createDiv({ cls: 'ad-modal-desc', text: this.opts.message });
		const btns = contentEl.createDiv({ cls: 'ad-modal-btns' });
		btns.createEl('button', { cls: 'ad-modal-btn', text: this.opts.cancelLabel })
			.addEventListener('click', () => this.close());
		const ok = btns.createEl('button', { cls: `ad-modal-btn ad-modal-btn--${this.opts.confirmStyle ?? 'danger'}`, text: this.opts.confirmLabel });
		ok.addEventListener('click', () => {
			this.confirmed = true;
			this.close();
			this.opts.onConfirm();
		});
		ok.focus();
	}

	onClose(): void {
		if (!this.confirmed) this.opts.onCancel?.();
		this.contentEl.empty();
	}
}
