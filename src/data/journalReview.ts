import type { App } from 'obsidian';
import { ensureJournal, journalCalendarEntry, journalEntry, journalFrontmatterTitle, journalInfo } from './journal.ts';
import type { JournalKind } from './journal.ts';
import { planInfo } from './planning.ts';
import type { PlanFiles } from './planning.ts';
import type { TimeFocus, TimeTraceState } from './timeTrace.ts';
import { parseDateKey } from './timeTrace.ts';

export type JournalReviewMode = 'review' | 'compare';
export type JournalReviewViewMode = 'record' | 'recent' | 'search' | 'pastToday';

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

export interface ReviewRecordSource {
	path: string;
	basename: string;
	markdown: string;
	properties: unknown;
}

export interface ReviewRecord {
	kind: JournalKind;
	period: string;
	path: string;
	logicalDate: string;
	order: number;
	focus: TimeFocus;
	title: string;
	label: string;
	searchableText: string;
	previewText: string;
	quickNoteCount: number;
}

export interface ReviewSearchResult {
	record: ReviewRecord;
	snippet: string;
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

/** Create only the daily journal represented by an explicit day focus. */
export async function ensureDayReviewForFocus(files: PlanFiles, focus: TimeFocus): Promise<string | null> {
	if (focus.kind !== 'day') return null;
	const date = parseDateKey(focus.date);
	if (!date) throw new Error('日记日期无效');
	return ensureJournal(files, 'day', date);
}

function dateKeyValue(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Search text is deliberately Markdown-light and never includes frontmatter. */
export function plainReviewText(markdown: string): string {
	return markdown
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/^ {0,3}(?:`{3,}|~{3,}).*$/gm, ' ')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias ?? target)
		.replace(/^\s*#{1,6}\s+/gm, '')
		.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, '')
		.replace(/[*_`~>|]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function sectionEntryCount(markdown: string): number {
	let count = 0;
	let inParagraph = false;
	for (const raw of markdown.split(/\r?\n/)) {
		const line = plainReviewText(raw);
		if (!line) { inParagraph = false; continue; }
		if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(raw)) { count++; inParagraph = false; continue; }
		if (!inParagraph) { count++; inParagraph = true; }
	}
	return count;
}

function firstReviewHeading(markdown: string): string {
	const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/);
	let frontmatter = lines[0]?.trim() === '---';
	let fence = '';
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? '';
		if (frontmatter) {
			if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
			continue;
		}
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
		if (fence) { if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = ''; continue; }
		if (marker) { fence = marker[1] ?? ''; continue; }
		const heading = /^ {0,3}#[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
		if (heading) return heading[1]?.trim() ?? '';
	}
	return '';
}

function firstMeaningfulReviewText(markdown: string): string {
	for (const block of markdown.split(/\r?\n\s*\r?\n/)) {
		const text = plainReviewText(block);
		if (text) return text.slice(0, 96);
	}
	return '';
}

function recordFocus(kind: JournalKind, period: string, date: Date): TimeFocus {
	if (kind === 'day') return { kind: 'day', date: period };
	if (kind === 'week') return { kind: 'week', isoYear: Number(period.slice(0, 4)), isoWeek: Number(period.slice(6)), anchorDate: dateKeyValue(date) };
	if (kind === 'month') return { kind: 'month', year: Number(period.slice(0, 4)), month: Number(period.slice(5)) };
	return { kind: 'year', year: Number(period) };
}

/** Build one read-only record from an existing, metadata-validated journal file. */
export function reviewRecordFromSource(source: ReviewRecordSource): ReviewRecord | null {
	const entry = journalEntry(source.path, source.basename, source.properties);
	if (!entry) return null;
	const date = new Date(entry.order);
	const sections = entry.kind === 'day' ? dayReviewSections(source.markdown) : markdownReviewSections(source.markdown);
	const bodies = sections.map(section => plainReviewText(section.markdown)).filter(Boolean);
	const actualDayTitle = entry.kind === 'day'
		? (journalFrontmatterTitle(source.properties) || (() => {
			const calendar = journalCalendarEntry(source.path, source.markdown, source.properties);
			return calendar?.titleSource === 'legacy-h1' ? calendar.title : '';
		})())
		: '';
	const quickNotes = entry.kind === 'day' ? sections.find(section => section.title === '随时记') : undefined;
	const quickNoteCount = quickNotes ? sectionEntryCount(quickNotes.markdown) : 0;
	const dailySectionText = (title: string) => firstMeaningfulReviewText(sections.find(section => section.title === title)?.markdown ?? '');
	const sourceHeading = entry.kind === 'day' ? '' : firstReviewHeading(source.markdown);
	const title = entry.kind === 'day'
		? actualDayTitle || (quickNoteCount ? `随时记 · ${quickNoteCount}条` : '') || dailySectionText('今日日记') || dailySectionText('今日回看') || '暂无正文'
		: sourceHeading || (entry.kind === 'week' ? `${entry.period} 周记` : entry.kind === 'month' ? '月度复盘' : '年度复盘');
	const searchableText = [actualDayTitle, ...bodies].filter(Boolean).join(' ').trim();
	return {
		kind: entry.kind,
		period: entry.period,
		path: entry.path,
		logicalDate: dateKeyValue(date),
		order: entry.order,
		focus: recordFocus(entry.kind, entry.period, date),
		title,
		label: entry.label,
		searchableText,
		previewText: bodies.join(' ').slice(0, 180),
		quickNoteCount,
	};
}

export function sortReviewRecords(records: readonly ReviewRecord[]): ReviewRecord[] {
	return [...records].sort((a, b) => b.order - a.order || a.path.localeCompare(b.path, 'zh-CN'));
}

/** One transient Vault traversal shared by recent/search/random/past-today. */
export async function discoverReviewRecords(app: App): Promise<ReviewRecord[]> {
	const records: ReviewRecord[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const properties = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!journalEntry(file.path, file.basename, properties)) continue;
		try {
			const markdown = await app.vault.cachedRead(file);
			const record = reviewRecordFromSource({ path: file.path, basename: file.basename, markdown, properties });
			if (record) records.push(record);
		} catch { /* A temporarily unavailable iCloud file is simply absent from this view. */ }
	}
	return sortReviewRecords(records);
}

export function recentReviewRecords(records: readonly ReviewRecord[], limit = 12): ReviewRecord[] {
	return sortReviewRecords(records).slice(0, Math.max(0, limit));
}

export function recentReviewTimeLabel(record: ReviewRecord): string {
	if (record.kind === 'day') return record.period.slice(5).replace('-', '.');
	if (record.kind === 'week') return `W${record.period.slice(6)}`;
	if (record.kind === 'month') return record.period.replace('-', '.');
	return record.period;
}

export function recentReviewTitle(record: ReviewRecord): string {
	if (record.kind === 'month' && record.title === '月度复盘') return `${Number(record.period.slice(5))} 月复盘`;
	if (record.kind === 'year' && record.title === '年度复盘') return `${record.period} 年度复盘`;
	return record.title;
}

function searchSnippet(text: string, query: string): string {
	const lower = text.toLocaleLowerCase();
	const index = lower.indexOf(query.toLocaleLowerCase());
	if (index < 0) return '';
	const start = Math.max(0, index - 28);
	const end = Math.min(text.length, index + query.length + 48);
	return `${start ? '……' : ''}${text.slice(start, end).trim()}${end < text.length ? '……' : ''}`;
}

export function searchReviewRecords(records: readonly ReviewRecord[], rawQuery: string): ReviewSearchResult[] {
	const query = rawQuery.trim();
	if (!query) return [];
	const needle = query.toLocaleLowerCase();
	return sortReviewRecords(records).flatMap(record => {
		if (!record.searchableText.toLocaleLowerCase().includes(needle)) return [];
		return [{ record, snippet: searchSnippet(record.searchableText, query) }];
	});
}

export function randomReviewRecord(records: readonly ReviewRecord[], random = Math.random): ReviewRecord | undefined {
	const substantive = records.filter(record => !!record.searchableText.trim());
	if (!substantive.length) return undefined;
	const index = Math.min(substantive.length - 1, Math.max(0, Math.floor(random() * substantive.length)));
	return substantive[index];
}

export function pastTodayReference(focus: TimeFocus, now = new Date()): Date {
	return focus.kind === 'day' ? (parseDateKey(focus.date) ?? atNoon(now)) : atNoon(now);
}

export function pastTodayReviewRecords(records: readonly ReviewRecord[], reference: Date): ReviewRecord[] {
	const monthDay = dateKeyValue(reference).slice(5);
	const year = reference.getFullYear();
	return sortReviewRecords(records.filter(record => record.kind === 'day' && record.period.slice(5) === monthDay && Number(record.period.slice(0, 4)) < year));
}

export function reviewRecordTimeLabel(record: ReviewRecord, compactDay = false): string {
	if (record.kind === 'day') return compactDay ? record.period.slice(5).replace('-', '.') : record.period.replaceAll('-', '.');
	if (record.kind === 'week') return record.period;
	if (record.kind === 'month') return `${Number(record.period.slice(0, 4))} 年 ${Number(record.period.slice(5))} 月`;
	return `${record.period} 年`;
}

export function timeStateForReviewRecord(state: TimeTraceState, record: ReviewRecord): TimeTraceState {
	const date = parseDateKey(record.logicalDate) ?? new Date(record.order);
	return { visible: { year: date.getFullYear(), month: date.getMonth() + 1 }, focus: record.focus };
}
