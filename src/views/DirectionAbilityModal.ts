import { App, Modal, Notice, parseYaml } from 'obsidian';
import { addDirectionAbility, learningAbilityReferences, renameDirectionAbility, syncLearningAbilityReferences } from '../data/compass';
import { learningFiles, scanLearning } from '../data/learningVault';
import { ConfirmModal } from './ConfirmModal';
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

export class EditDirectionAbilityModal extends Modal {
	private saving = false;
	constructor(app: App, private direction: string, private current: string, private select: (ability: string) => void | Promise<void>) { super(app); }
	onOpen(): void {
		const el = beginListModal(this, '编辑能力');
		el.createEl('p', { cls: 'ad-modal-hint', text: `当前方向：${this.direction}` });
		el.createEl('label', { cls: 'ad-modal-label', text: '能力名称' });
		const input = el.createEl('input', { cls: 'ad-modal-input', attr: { type: 'text', 'aria-label': '能力名称' } });
		input.value = this.current;
		const footer = el.createDiv({ cls: 'ad-modal-btns' });
		const cancel = footer.createEl('button', { cls: 'ad-modal-btn', text: '取消' });
		cancel.onclick = () => this.close();
		const save = footer.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '保存' });
		const submit = async () => {
			if (this.saving) return;
			this.saving = true; input.disabled = cancel.disabled = save.disabled = true;
			try {
				const references = learningAbilityReferences(scanLearning(this.app), this.direction, this.current);
				const result = await renameDirectionAbility(learningFiles(this.app), this.direction, this.current, input.value);
				await this.select(result.ability);
				this.close();
				if (result.changed && references.length) {
					new ConfirmModal({
						app: this.app,
						title: '同步更新学习内容',
						message: `有 ${references.length} 篇学习内容正在使用此能力，是否同步更新？`,
						confirmLabel: '同步更新', cancelLabel: '取消', confirmStyle: 'primary',
						onConfirm: () => { void this.sync(references, result.ability); },
					}).open();
				}
			} catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
			finally { this.saving = false; input.disabled = cancel.disabled = save.disabled = false; }
		};
		save.onclick = submit;
		input.onkeydown = event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); void submit(); } };
		input.focus(); input.setSelectionRange(0, input.value.length);
	}
	private async sync(paths: string[], ability: string): Promise<void> {
		try {
			const count = await syncLearningAbilityReferences(learningFiles(this.app), paths, this.direction, this.current, ability, parseYaml);
			new Notice(`已同步更新 ${count} 篇学习内容`);
		} catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
	}
	onClose(): void { closeListModal(this); }
}
