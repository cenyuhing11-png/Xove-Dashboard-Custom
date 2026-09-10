import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import { normalizeLongTermDirections } from '../data/longTermPlans';
import { projectDirections } from '../data/projects';
import { beginListModal, closeListModal } from './viewPrimitives';

export function renderLongTermDirectionPicker(parent: HTMLElement, selected: readonly string[], change: (directions: string[]) => void): void {
	let values = normalizeLongTermDirections(selected);
	parent.createEl('label', { cls: 'ad-modal-label', text: '方向（可选）' });
	const group = parent.createDiv({ cls: 'ad-prio-group mx-long-term-directions', attr: { role: 'group', 'aria-label': '方向（可选）' } });
	for (const direction of projectDirections()) {
		const button = group.createEl('button', { cls: `ad-prio-btn${values.includes(direction) ? ' is-selected' : ''}`, text: direction, attr: { type: 'button', 'aria-pressed': String(values.includes(direction)) } });
		button.onclick = () => {
			values = values.includes(direction) ? values.filter(value => value !== direction) : [...values, direction];
			button.toggleClass('is-selected', values.includes(direction)); button.setAttribute('aria-pressed', String(values.includes(direction))); change([...values]);
		};
	}
}

export class LongTermPlanDirectionModal extends Modal {
	private directions: string[];
	constructor(app: App, directions: readonly string[], private save: (directions: string[]) => void | Promise<void>) { super(app); this.directions = normalizeLongTermDirections(directions); }
	onOpen(): void {
		const el = beginListModal(this, '编辑长期计划');
		renderLongTermDirectionPicker(el, this.directions, directions => { this.directions = directions; });
		const footer = el.createDiv({ cls: 'ad-modal-btns' }); footer.createEl('button', { cls: 'ad-modal-btn', text: '取消' }).onclick = () => this.close();
		footer.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '保存' }).onclick = () => { void Promise.resolve(this.save([...this.directions])).then(() => this.close()); };
	}
	onClose(): void { closeListModal(this); }
}
