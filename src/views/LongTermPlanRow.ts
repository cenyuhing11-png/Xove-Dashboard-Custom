import type { LongTermPlan } from '../data/longTermPlans';
import { longTermPlanListMetadata, longTermStageProgress } from '../data/longTermPlans';

/** Shared long-term summary row used by Time Trace and direction overviews. */
export function renderLongTermPlanSummaryRow(parent: HTMLElement, plan: LongTermPlan, open: () => void): HTMLElement {
	const progress = longTermStageProgress(plan.stages);
	const row = parent.createDiv({ cls: 'wb-entry wb-entry--button', attr: { role: 'button', tabindex: '0' } });
	const body = row.createDiv({ cls: 'mx-long-term-row__body' });
	body.createDiv({ cls: 'wb-entry__label', text: plan.name });
	body.createDiv({ cls: 'ad-modal-hint', text: longTermPlanListMetadata(plan) });
	row.createSpan({ cls: 'wb-entry__detail', text: `阶段 ${progress.completed} / ${progress.total}` });
	row.createSpan({ cls: 'wb-entry__arrow', text: '→' });
	row.onclick = open;
	row.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
	return row;
}
