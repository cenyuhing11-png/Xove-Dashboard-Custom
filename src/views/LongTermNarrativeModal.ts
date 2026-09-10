import { Modal, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { NarrativeTitle } from '../data/longTermNarrative';
import { beginListModal, closeListModal } from './viewPrimitives';

export class LongTermNarrativeModal extends Modal {
	constructor(app: App, private titleText: NarrativeTitle, private markdown: string, private save: (value: string) => Promise<void>) { super(app); }
	onOpen(): void {
		const el = beginListModal(this, `编辑「${this.titleText}」`);
		const input = el.createEl('textarea', { cls: 'ad-modal-input ad-modal-textarea', attr: { 'aria-label': this.titleText, rows: '8' } }); input.value = this.markdown;
		const footer = el.createDiv({ cls: 'ad-modal-btns' });
		footer.createEl('button', { cls: 'ad-modal-btn', text: '取消' }).onclick = () => this.close();
		const save = footer.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '保存' });
		save.onclick = async () => { save.disabled = true; try { await this.save(input.value); this.close(); } catch (error) { new Notice(String(error)); } finally { save.disabled = false; } };
	}
	onClose(): void { closeListModal(this); }
}
