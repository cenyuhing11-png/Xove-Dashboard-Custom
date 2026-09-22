import { App, Modal, Notice } from 'obsidian';
import type { QuickJournalService } from '../data/quickJournal.ts';
import { beginListModal, closeListModal } from './viewPrimitives.ts';

function isMobilePhone(): boolean {
	return document.body.classList.contains('is-mobile') && document.body.classList.contains('is-phone');
}

function viewportHeight(): number { return window.visualViewport?.height ?? window.innerHeight; }
function viewportTop(): number { return window.visualViewport?.offsetTop ?? 0; }

export class QuickJournalModal extends Modal {
	private saving = false;
	private viewportResizeHandler?: () => void;
	private viewportScrollHandler?: () => void;

	constructor(app: App, private service: QuickJournalService) { super(app); }

	private syncMobileViewport(): void {
		if (!isMobilePhone()) return;
		const height = Math.max(240, Math.floor(viewportHeight() - 12));
		const textareaMax = Math.max(72, Math.floor(viewportHeight() * 0.34));
		this.modalEl.style.setProperty('--mx-quick-journal-vh', `${height}px`);
		this.modalEl.style.setProperty('--mx-quick-journal-top', `${Math.max(0, Math.round(viewportTop()))}px`);
		this.modalEl.style.setProperty('--mx-quick-journal-textarea-max', `${textareaMax}px`);
	}

	private attachViewportListeners(): void {
		if (!isMobilePhone()) return;
		this.syncMobileViewport();
		const viewport = window.visualViewport;
		if (viewport) {
			this.viewportResizeHandler = () => this.syncMobileViewport();
			this.viewportScrollHandler = () => this.syncMobileViewport();
			viewport.addEventListener('resize', this.viewportResizeHandler);
			viewport.addEventListener('scroll', this.viewportScrollHandler);
		}
	}

	private detachViewportListeners(): void {
		const viewport = window.visualViewport;
		if (viewport && this.viewportResizeHandler) viewport.removeEventListener('resize', this.viewportResizeHandler);
		if (viewport && this.viewportScrollHandler) viewport.removeEventListener('scroll', this.viewportScrollHandler);
		this.viewportResizeHandler = undefined;
		this.viewportScrollHandler = undefined;
	}

	onOpen(): void {
		const el = beginListModal(this, '随时记');
		this.modalEl.addClass('mx-quick-journal-modal');
		el.addClass('mx-quick-journal-content');
		this.containerEl.closest('.modal-container')?.addClass('mx-quick-journal-container');
		el.querySelector('.ad-modal-title')?.addClass('mx-quick-journal-title');
		const body = el.createDiv({ cls: 'mx-quick-journal-body' });
		body.createEl('label', { cls: 'ad-modal-label mx-quick-journal-label', text: '记录这一刻' });
		const input = body.createEl('textarea', {
			cls: 'ad-modal-input mx-quick-journal-input',
			attr: { rows: '4', placeholder: '今天想记点什么……', 'aria-label': '随时记内容' },
		});
		const footer = el.createDiv({ cls: 'ad-modal-btns mx-quick-journal-footer' });
		const cancel = footer.createEl('button', { cls: 'ad-modal-btn', text: '取消', attr: { type: 'button' } });
		const save = footer.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '保存', attr: { type: 'button' } });
		const refresh = () => { save.disabled = this.saving || !input.value.trim(); };
		const submit = async () => {
			if (this.saving || !input.value.trim()) return;
			this.saving = true; input.disabled = cancel.disabled = save.disabled = true;
			try {
				await this.service.appendQuickJournalEntry(input.value);
				this.close();
				new Notice('已记入今日日记');
			} catch (error) {
				new Notice('随时记保存失败，请重试');
				console.error('[Mengxu] quick journal save failed', error);
			} finally {
				this.saving = false; input.disabled = cancel.disabled = false; refresh();
			}
		};
		input.addEventListener('input', refresh);
		input.addEventListener('keydown', event => {
			if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {
				event.preventDefault(); void submit();
			}
		});
		cancel.addEventListener('click', () => this.close());
		save.addEventListener('click', () => { void submit(); });
		this.attachViewportListeners();
		refresh(); input.focus();
	}

	onClose(): void {
		this.detachViewportListeners();
		this.modalEl.removeClass('mx-quick-journal-modal');
		this.contentEl.removeClass('mx-quick-journal-content');
		this.containerEl.closest('.modal-container')?.removeClass('mx-quick-journal-container');
		closeListModal(this);
	}
}
