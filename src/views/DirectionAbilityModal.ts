import { App, Modal, Notice } from 'obsidian';
import { addDirectionAbility } from '../data/compass';
import { learningFiles } from '../data/learningVault';
import { beginListModal, closeListModal } from './viewPrimitives';

export class DirectionAbilityModal extends Modal {
	private saving = false;
	constructor(app: App, private direction: string, private select: (ability: string) => void | Promise<void>) { super(app); }
	onOpen(): void {
		const el = beginListModal(this, '新建能力');
		el.createEl('label', { cls: 'ad-modal-label', text: '能力名称' });
		const input = el.createEl('input', { cls: 'ad-modal-input', attr: { type: 'text', 'aria-label': '能力名称' } });
		el.createEl('p', { cls: 'ad-modal-hint', text: `当前方向：${this.direction}` });
		const footer = el.createDiv({ cls: 'ad-modal-btns' });
		const cancel = footer.createEl('button', { cls: 'ad-modal-btn', text: '取消' });
		cancel.onclick = () => this.close();
		const add = footer.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '添加' });
		add.onclick = async () => {
			if (this.saving) return;
			this.saving = true; input.disabled = cancel.disabled = add.disabled = true;
			try {
				const result = await addDirectionAbility(learningFiles(this.app), this.direction, input.value);
				if (!result.added) new Notice('该能力已存在');
				await this.select(result.ability);
				this.close();
			} catch (error) { new Notice(String(error)); }
			finally { this.saving = false; input.disabled = cancel.disabled = add.disabled = false; }
		};
		input.onkeydown = event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); add.click(); } };
		input.focus();
	}
	onClose(): void { closeListModal(this); }
}
