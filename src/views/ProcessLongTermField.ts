import type { App } from 'obsidian';
import type { LongTermPlan } from '../data/longTermPlans';
import { LongTermPlanPickerModal } from './LongTermPlanPickerModal';

export interface ProcessLongTermActions { plans: LongTermPlan[]; selectedId?: string; change(id?: string): void | Promise<void>; open(id: string): void }
export function renderProcessLongTermField(parent: HTMLElement, app: App, actions?: ProcessLongTermActions): void {
	if (!actions) return; const selected = actions.plans.find(plan => plan.id === actions.selectedId);
	const row = parent.createDiv({ cls: 'wb-entry mx-process-long-term-field' }); row.createSpan({ cls: 'ad-modal-label', text: '长期计划' });
	if (selected) { const open = row.createEl('button', { cls: 'mx-inline-action wb-entry__label', text: `${selected.name} →` }); open.onclick = () => actions.open(selected.id); }
	const edit = row.createEl('button', { cls: 'mx-inline-action', text: selected ? '更改' : '＋ 关联' });
	edit.onclick = () => new LongTermPlanPickerModal(app, actions.plans, actions.selectedId, actions.change).open();
}
