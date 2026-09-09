import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import type { LongTermPlan } from '../data/longTermPlans';
import type { Process } from '../data/processes';
import { beginListModal, closeListModal, listEntry } from './viewPrimitives';

export class LongTermPlanPickerModal extends Modal {
	constructor(app: App, private plans: LongTermPlan[], private selected: string | undefined, private choose: (id?: string) => void | Promise<void>) { super(app); }
	onOpen(): void {
		const el = beginListModal(this, '关联长期计划');
		listEntry(el, '不关联', this.selected ? '清除当前关联' : '当前未关联', () => { void Promise.resolve(this.choose()).then(() => this.close()); });
		for (const plan of this.plans.filter(plan => plan.status !== '归档')) listEntry(el, plan.name, `${plan.startMonth} — ${plan.endMonth} · ${plan.status}${plan.id === this.selected ? ' · 当前' : ''}`, () => { void Promise.resolve(this.choose(plan.id)).then(() => this.close()); });
	}
	onClose(): void { closeListModal(this); }
}

export class StageProcessPickerModal extends Modal {
	constructor(app: App, private processes: Process[], private plans: LongTermPlan[], private currentPlanId: string, private choose: (process: Process) => void | Promise<void>) { super(app); }
	onOpen(): void {
		const el = beginListModal(this, '添加进程');
		if (!this.processes.length) el.createDiv({ cls: 'po-empty', text: '暂无可添加进程' });
		for (const process of this.processes) {
			const other = process.longTermPlanId && process.longTermPlanId !== this.currentPlanId;
			const planName = other ? this.plans.find(plan => plan.id === process.longTermPlanId)?.name : '';
			listEntry(el, process.name, `${process.category === 'learning' ? '学习' : '创作'}${process.direction ? ` · ${process.direction}` : ''}${planName ? ` · 当前属于 ${planName}` : process.longTermPlanId === this.currentPlanId ? ' · 当前长期计划' : ''}`, () => { void Promise.resolve(this.choose(process)).then(() => this.close()); });
		}
	}
	onClose(): void { closeListModal(this); }
}

export class LongTermStageModal extends Modal {
	constructor(app: App, private save: (name: string) => void | Promise<void>) { super(app); }
	onOpen(): void {
		const el = beginListModal(this, '添加阶段'); el.createEl('label', { cls: 'ad-modal-label', text: '阶段名称' });
		const input = el.createEl('input', { cls: 'ad-modal-input', attr: { type: 'text', placeholder: '例如：基础准备' } });
		const footer = el.createDiv({ cls: 'ad-modal-btns' }); footer.createEl('button', { cls: 'ad-modal-btn', text: '取消' }).onclick = () => this.close();
		footer.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '添加' }).onclick = () => { if (!input.value.trim()) return; void Promise.resolve(this.save(input.value.trim())).then(() => this.close()); };
	}
	onClose(): void { closeListModal(this); }
}

export class ConfirmActionModal extends Modal {
	constructor(app: App, private titleText: string, private message: string, private confirmText: string, private confirm: () => void | Promise<void>) { super(app); }
	onOpen(): void {
		const el = beginListModal(this, this.titleText); el.createEl('p', { cls: 'ad-modal-desc', text: this.message });
		const footer = el.createDiv({ cls: 'ad-modal-btns' }); footer.createEl('button', { cls: 'ad-modal-btn', text: '取消' }).onclick = () => this.close();
		footer.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: this.confirmText }).onclick = () => { void Promise.resolve(this.confirm()).then(() => this.close()); };
	}
	onClose(): void { closeListModal(this); }
}
