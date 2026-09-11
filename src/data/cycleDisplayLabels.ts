import type { JournalKind } from './journal.ts';
import type { PlanPeriod } from './planning.ts';

export const CYCLE_DISPLAY_LABELS: Record<PlanPeriod, { plan: string; review: string }> = {
	week: { plan: '周计划', review: '周复盘' },
	month: { plan: '月计划', review: '月复盘' },
	quarter: { plan: '季计划', review: '季复盘' },
	year: { plan: '年计划', review: '年复盘' },
};

export const REVIEW_DISPLAY_LABELS: Record<JournalKind, string> = {
	day: '日记',
	week: CYCLE_DISPLAY_LABELS.week.review,
	month: CYCLE_DISPLAY_LABELS.month.review,
	quarter: CYCLE_DISPLAY_LABELS.quarter.review,
	year: CYCLE_DISPLAY_LABELS.year.review,
};

export function planDisplayLabel(period: PlanPeriod): string {
	return CYCLE_DISPLAY_LABELS[period].plan;
}

export function reviewDisplayLabel(kind: JournalKind): string {
	return REVIEW_DISPLAY_LABELS[kind];
}

/** Normalize legacy review wording for display only; source paths and Markdown stay untouched. */
export function reviewDisplayTitle(kind: JournalKind, title: string): string {
	if (kind === 'day') return title;
	return title
		.replace(/周记$/, REVIEW_DISPLAY_LABELS.week)
		.replace(/月度复盘$/, REVIEW_DISPLAY_LABELS.month)
		.replace(/季度复盘$/, REVIEW_DISPLAY_LABELS.quarter)
		.replace(/年度复盘$/, REVIEW_DISPLAY_LABELS.year);
}
