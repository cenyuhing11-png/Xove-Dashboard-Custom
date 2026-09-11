import type { PlanPeriod, PlanState } from '../../data/planning';
import { addEmpty, addEntry, createGroup, createSection } from './shared';
import { planDisplayLabel } from '../../data/cycleDisplayLabels';

export function renderPlanningCard(parent: HTMLElement, plans: PlanState[], open: (period: PlanPeriod) => void): void {
	const body = createSection(parent, '🗓 当前计划');
	const labels = { week: '本周重点', month: '本月重点', quarter: '当前季度', year: '年度目标' };
	const names = { week: '本周计划', month: '本月计划', quarter: planDisplayLabel('quarter'), year: planDisplayLabel('year') };
	for (const plan of plans) {
		const { period } = plan;
		const group = period === 'year' ? body : createGroup(body, labels[period]);
		if (plan.error) {
			addEmpty(group, plan.error);
			continue;
		}
		if (!plan.exists) {
			if (period !== 'year') addEmpty(group, `尚未建立${names[period]}`);
			addEntry(group, `创建${names[period]}`, undefined, () => open(period));
		} else {
			const entries = plan.entries.length ? plan.entries : ['尚未填写重点，打开计划'];
			for (const entry of entries) {
				const label = period === 'year' ? `年度目标：${entry}` : entry;
				const button = addEntry(group, label, undefined, () => open(period));
				button.setAttribute('title', label);
			}
		}
	}
}
