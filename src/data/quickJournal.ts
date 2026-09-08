import { ensureJournal, journalInfo } from './journal.ts';
import type { PlanFiles } from './planning.ts';
import { nowFmt } from './taskLogic.ts';

export interface QuickJournalFiles extends PlanFiles {
	process(path: string, update: (content: string) => string): Promise<unknown>;
}

export interface QuickJournalResult {
	path: string;
	date: string;
	time: string;
	created: boolean;
}

interface MarkdownSection {
	title: string;
	start: number;
	end: number;
}

function markdownSections(content: string): MarkdownSection[] {
	const headings: Array<{ title: string; start: number; level: number }> = [];
	const linePattern = /.*?(?:\r\n|\n|$)/g;
	let yaml = false;
	let fence = '';
	let offset = 0;
	for (const match of content.matchAll(linePattern)) {
		const raw = match[0] ?? '';
		if (!raw) break;
		const line = raw.replace(/(?:\r\n|\n)$/, '');
		if (offset === 0 && line.replace(/^\uFEFF/, '').trim() === '---') yaml = true;
		else if (yaml) {
			if (/^(---|\.\.\.)\s*$/.test(line)) yaml = false;
		} else if (fence) {
			if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = '';
		} else {
			const openingFence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
			if (openingFence) fence = openingFence[1] ?? '';
			else {
				const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
				if (heading) headings.push({ title: heading[2]?.trim() ?? '', start: offset, level: heading[1]?.length ?? 6 });
			}
		}
		offset += raw.length;
	}
	return headings.filter(heading => heading.level === 2).map(heading => ({
		title: heading.title,
		start: heading.start,
		end: headings.find(candidate => candidate.start > heading.start && candidate.level <= 2)?.start ?? content.length,
	}));
}

function insertAtBoundary(content: string, offset: number, block: string): string {
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	const left = content.slice(0, offset).replace(/[ \t]*(?:(?:\r\n|\n))+$/, '');
	const right = content.slice(offset).replace(/^(?:(?:\r\n|\n))+/, '');
	return right
		? `${left}${eol}${eol}${block}${eol}${eol}${right}`
		: `${left}${eol}${eol}${block}${eol}`;
}

export function quickJournalEntry(text: string, time: string): string | null {
	const normalized = text.replace(/\r\n?/g, '\n').trim();
	if (!normalized) return null;
	const [first = '', ...rest] = normalized.split('\n');
	return [`- ${time} ${first}`, ...rest.map(line => `  ${line}`)].join('\n');
}

/** Add one entry without rebuilding or reordering any existing journal section. */
export function appendQuickJournalContent(content: string, entry: string): string {
	const sections = markdownSections(content);
	const quick = sections.find(section => section.title === '随时记');
	if (quick) return insertAtBoundary(content, quick.end, entry);
	const todayTasks = sections.find(section => section.title === '今日任务');
	const block = `## 随时记\n\n${entry}`;
	if (todayTasks) return insertAtBoundary(content, todayTasks.end, block);
	const journal = sections.find(section => section.title === '今日日记');
	if (journal) return insertAtBoundary(content, journal.start, block);
	return insertAtBoundary(content, content.length, block);
}

/**
 * View-independent quick capture writer. Calls are serialized so two rapid saves
 * always process the latest Vault contents instead of overwriting each other.
 */
export class QuickJournalService {
	private queue: Promise<void> = Promise.resolve();
	private files: QuickJournalFiles;
	private clock: () => Date;

	constructor(files: QuickJournalFiles, clock: () => Date = () => new Date()) {
		this.files = files;
		this.clock = clock;
	}

	appendQuickJournalEntry(text: string, date?: Date): Promise<QuickJournalResult> {
		const requested = date ? new Date(date.getTime()) : this.clock();
		const job = this.queue.then(() => this.append(text, requested));
		this.queue = job.then(() => undefined, () => undefined);
		return job;
	}

	private async append(text: string, date: Date): Promise<QuickJournalResult> {
		const time = nowFmt(date).slice(-5);
		const entry = quickJournalEntry(text, time);
		if (!entry) throw new Error('随时记内容不能为空');
		const canonical = journalInfo('day', date).path;
		const existed = this.files.kind(canonical) === 'file';
		const path = await ensureJournal(this.files, 'day', date);
		await this.files.process(path, content => appendQuickJournalContent(content, entry));
		return { path, date: journalInfo('day', date).period, time, created: !existed && path === canonical };
	}
}
