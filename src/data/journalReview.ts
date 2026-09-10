import { journalInfo } from './journal.ts';
import type { JournalKind } from './journal.ts';
import { planInfo } from './planning.ts';
import type { TimeFocus } from './timeTrace.ts';
import { parseDateKey } from './timeTrace.ts';

export type JournalReviewMode = 'review' | 'compare';

export interface JournalReviewTarget {
	kind: JournalKind;
	date: Date;
	primary: string;
	secondary?: string;
	reviewPaths: string[];
	planPath?: string;
	planLabel?: string;
	reviewLabel: string;
}

export interface MarkdownReviewSection {
	title: string;
	markdown: string;
}

function atNoon(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function focusTargetDate(focus: TimeFocus): Date {
	if (focus.kind === 'day') return parseDateKey(focus.date) ?? new Date(focus.date);
	if (focus.kind === 'week') return parseDateKey(focus.anchorDate) ?? new Date(focus.isoYear, 0, 4, 12);
	return new Date(focus.year, focus.kind === 'month' ? focus.month - 1 : 0, 1, 12);
}

function dottedDate(date: Date): string {
	return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function reviewCandidates(kind: JournalKind, date: Date): string[] {
	const canonical = journalInfo(kind, date);
	return kind === 'day'
		? [canonical.path, `${canonical.folder}/${canonical.period} 日记.md`]
		: [canonical.path];
}

export function journalReviewTarget(focus: TimeFocus): JournalReviewTarget {
	const date = atNoon(focusTargetDate(focus));
	if (focus.kind === 'day') {
		return {
			kind: 'day', date,
			primary: `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`,
			reviewPaths: reviewCandidates('day', date), reviewLabel: '日记',
		};
	}
	if (focus.kind === 'week') {
		const end = atNoon(date); end.setDate(end.getDate() + 6);
		return {
			kind: 'week', date,
			primary: `${focus.isoYear}-W${String(focus.isoWeek).padStart(2, '0')} 周记`,
			secondary: `${dottedDate(date)} — ${dottedDate(end)}`,
			reviewPaths: reviewCandidates('week', date),
			planPath: planInfo('week', date).path, planLabel: '周计划', reviewLabel: '周记',
		};
	}
	if (focus.kind === 'month') {
		return {
			kind: 'month', date,
			primary: `${focus.year} 年 ${focus.month} 月`, secondary: '月度复盘',
			reviewPaths: reviewCandidates('month', date),
			planPath: planInfo('month', date).path, planLabel: '月度计划', reviewLabel: '月度复盘',
		};
	}
	return {
		kind: 'year', date,
		primary: `${focus.year} 年`, secondary: '年度复盘',
		reviewPaths: reviewCandidates('year', date),
		planPath: planInfo('year', date).path, planLabel: '年度计划', reviewLabel: '年度复盘',
	};
}

/** Extract real H2 sections while preserving their Markdown bodies. */
export function markdownReviewSections(markdown: string, allowed?: readonly string[]): MarkdownReviewSection[] {
	const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/);
	const sections: MarkdownReviewSection[] = [];
	let frontmatter = lines[0]?.trim() === '---';
	let fence = '';
	let current: { title: string; lines: string[] } | undefined;
	const finish = () => {
		if (!current) return;
		const body = current.lines.join('\n').trim();
		sections.push({ title: current.title, markdown: body });
		current = undefined;
	};
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? '';
		if (frontmatter) {
			if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
			continue;
		}
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
		if (fence) {
			if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = '';
			if (current) current.lines.push(line);
			continue;
		}
		if (marker) {
			fence = marker[1] ?? '';
			if (current) current.lines.push(line);
			continue;
		}
		const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
		if (heading && (heading[1]?.length ?? 6) <= 2) {
			finish();
			if (heading[1]?.length === 2) {
				const title = heading[2]?.trim() ?? '';
				if (!allowed || allowed.includes(title)) current = { title, lines: [] };
			}
			continue;
		}
		if (current) current.lines.push(line);
	}
	finish();
	if (!allowed) return sections;
	return allowed.flatMap(title => sections.filter(section => section.title === title));
}

export function dayReviewSections(markdown: string): MarkdownReviewSection[] {
	return markdownReviewSections(markdown, ['随时记', '今日日记', '今日回看']);
}
