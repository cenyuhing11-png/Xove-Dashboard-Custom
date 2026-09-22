import { hasMeaningfulJournalContent } from './journal.ts';
import { dayReviewSections, plainReviewText } from './journalReview.ts';
import { titleValue } from './journalInline.ts';
/** Pure diary summary; tasks and legacy H1 are deliberately not summary sources. */
export function journalOverviewSummary(markdown: string): string | null {
	if (!hasMeaningfulJournalContent(markdown)) return null;
	const title = titleValue(markdown).trim(); if (title) return title;
	const sections = dayReviewSections(markdown);
	const quick = sections.find(s => s.title === '随时记')?.markdown ?? '';
	const entries = quick.split(/\r?\n/).filter(l => /^[-*+]\s+\S/.test(l));
	if (entries.length) return `随时记 · ${entries.length}条`;
	if (plainReviewText(quick)) return '随时记 · 1条';
	for (const name of ['今日日记', '今日回看']) {
		const first = (sections.find(s => s.title === name)?.markdown ?? '').split(/\r?\n/).map(plainReviewText).find(Boolean);
		if (first) return first.slice(0, 96);
	}
	return null;
}
