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

export class ProcessAssociationModal extends Modal {
	constructor(app: App, private processes: Process[], private plan: LongTermPlan, private choose: (processes: Process[]) => void | Promise<void>) { super(app); }
	onOpen(): void {
		const el = beginListModal(this, '添加关联进程'); const selected = new Set<string>();
		for (const process of this.processes.filter(process => !process.longTermPlanId || process.longTermPlanId === this.plan.id)) {
			const label = el.createEl('label', { cls: 'ad-modal-check' });
			const input = label.createEl('input', { cls: 'ad-modal-checkbox', attr: { type: 'checkbox' } }); input.checked = process.longTermPlanId === this.plan.id;
			if (input.checked) selected.add(process.sourceFile);
			label.createSpan({ cls: 'ad-modal-check-label', text: `${process.category === 'learning' ? '学习' : '创作'} · ${process.name}${process.direction ? ` · ${process.direction}` : ''}` });
			input.onchange = () => { if (input.checked) selected.add(process.sourceFile); else selected.delete(process.sourceFile); };
		}
		const footer = el.createDiv({ cls: 'ad-modal-btns' }); footer.createEl('button', { cls: 'ad-modal-btn', text: '取消' }).onclick = () => this.close();
		footer.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '保存关联' }).onclick = () => { void Promise.resolve(this.choose(this.processes.filter(process => selected.has(process.sourceFile)))).then(() => this.close()); };
	}
	onClose(): void { closeListModal(this); }
}
