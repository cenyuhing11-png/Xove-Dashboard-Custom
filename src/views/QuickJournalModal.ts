import { App, Modal, Notice } from 'obsidian';
import type { QuickJournalService } from '../data/quickJournal.ts';
import { beginListModal, closeListModal } from './viewPrimitives.ts';

export class QuickJournalModal extends Modal {
	private saving = false;

	constructor(app: App, private service: QuickJournalService) { super(app); }

	onOpen(): void {
		const el = beginListModal(this, '随时记');
		el.createEl('label', { cls: 'ad-modal-label', text: '记录这一刻' });
		const input = el.createEl('textarea', {
			cls: 'ad-modal-input mx-quick-journal-input',
			attr: { rows: '4', placeholder: '今天想记点什么……', 'aria-label': '随时记内容' },
		});
		const footer = el.createDiv({ cls: 'ad-modal-btns' });
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
		refresh(); input.focus();
	}

	onClose(): void { closeListModal(this); }
}
