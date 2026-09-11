import { isoWeek, planInfo } from './planning.ts';
import type { PlanFiles } from './planning';
import { ensureSafeNote } from './safeNote.ts';
import { JOURNAL_ROOT, JOURNAL_FOLDERS, LEGACY_JOURNAL_FOLDERS } from './vaultPaths.ts';
import type { EmbeddedTask } from './embeddedTasks.ts';
import { groupEmbeddedForDisplay } from './embeddedTasks.ts';
import { applyFrontmatterUpdates } from './frontmatterWriter.ts';
import { reviewDisplayLabel } from './cycleDisplayLabels.ts';
import type { App, TFile } from 'obsidian';
export { JOURNAL_ROOT } from './vaultPaths.ts';

export type JournalKind = 'day' | 'week' | 'month' | 'quarter' | 'year';
export const JOURNAL_KINDS: JournalKind[] = ['day', 'week', 'month', 'quarter', 'year'];
const legacyOpeners: Record<JournalKind, string> = { day: '日记', week: '周记', month: '月度复盘', quarter: '季复盘', year: '年度复盘' };
const canonicalOpeners: Record<JournalKind, string> = { day: '', week: '周复盘', month: '月复盘', quarter: '季复盘', year: '年复盘' };
const legacyFolders: Partial<Record<JournalKind, string>> = { ...LEGACY_JOURNAL_FOLDERS };

export function journalInfo(kind: JournalKind, date = new Date()) {
	const year = date.getFullYear();
	const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	const day = `${month}-${String(date.getDate()).padStart(2, '0')}`;
	const period = kind === 'day' ? day : planInfo(kind, date).key;
	const folder = `${JOURNAL_ROOT}/${JOURNAL_FOLDERS[kind]}`;
	const name = kind === 'day' ? period : `${period} ${canonicalOpeners[kind]}`;
	return { kind, period, folder, path: `${folder}/${name}.md`, name };
}

export function legacyJournalInfo(kind: JournalKind, date = new Date()) {
	const canonical = journalInfo(kind, date);
	const folder = legacyFolders[kind] ?? JOURNAL_FOLDERS[kind];
	const name = kind === 'day'
		? `${canonical.period} 日记.md`
		: canonical.kind === 'week'
			? `${canonical.period} 周记.md`
			: `${canonical.period} ${legacyOpeners[kind]}.md`;
	return { ...canonical, folder: `${JOURNAL_ROOT}/${folder}`, path: `${JOURNAL_ROOT}/${folder}/${name}`, name: name.slice(0, -3) };
}

/** Canonical first, then the legacy day/week/month/year path when distinct. */
export function journalPaths(kind: JournalKind, date = new Date()): string[] {
	return [...new Set([journalInfo(kind, date).path, legacyJournalInfo(kind, date).path])];
}

export function existingJournalPath(files: Pick<PlanFiles, 'kind'>, kind: JournalKind, date = new Date()): string | undefined {
	let blocked = false;
	for (const path of journalPaths(kind, date)) {
		const kindAtPath = files.kind(path);
		if (kindAtPath === 'file') return path;
		if (kindAtPath === 'folder') blocked = true;
	}
	if (blocked) throw new Error('笔记路径被文件夹占用');
	return undefined;
}
export function journalTemplate(kind: JournalKind, date = new Date()): string {
	const info = journalInfo(kind, date);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const headers: Record<JournalKind, string> = {
		day: `类型: 日记\n日期: ${info.period}\n标题:`,
		week: `类型: 周记\n期间: ${info.period}\n关联计划: "[[${planInfo('week', date).name}]]"`,
		month: `类型: 复盘\n周期: 月度\n期间: ${info.period}\n关联计划: "[[${planInfo('month', date).name}]]"`,
		quarter: `类型: 复盘\n周期: 季度\n期间: ${info.period}\n关联计划: "[[${planInfo('quarter', date).name}]]"`,
		year: `类型: 复盘\n周期: 年度\n期间: ${info.period}\n关联计划: "[[${planInfo('year', date).name}]]"`,
	};
	const titles = { day: `${year}年${month}月${date.getDate()}日`, week: info.name.replace('-', ' '), month: `${year}年${month}月复盘`, quarter: `${year} Q${Math.floor(date.getMonth() / 3) + 1} 季复盘`, year: `${year}年复盘` };
	const sections: Record<JournalKind, string[]> = {
		day: ['今日任务', '随时记', '今日日记', '今日回看'],
		week: ['这周实际推进了什么', '做成了什么', '哪些没有推进', '为什么会有偏差', '下周怎么调整'],
		month: ['这个月实际到了什么状态', '本月做成了什么', '哪些重点没有完成', '哪些事情值得记住', '偏差来自哪里', '下个月怎么调整'],
		quarter: ['这个季度实际到了什么状态', '本季最重要的成果', '哪些重点没有实现', '哪些判断是对的', '哪些判断需要修正', '下一季度最该调整什么'],
		year: ['这一年我最终到了什么状态', '今年真正做成了什么', '最重要的变化是什么', '哪些目标没有实现', '哪些选择是对的', '哪些事情以后不再重复', '明年最值得继续的是什么'],
	};
	const heading = kind === 'day' ? '' : `# ${titles[kind]}\n\n`;
	return `---\n${headers[kind]}\n---\n\n${heading}${sections[kind].map((title) => `## ${title}\n`).join('\n')}\n`;
}

/** Daily journal names stay backwards compatible; no source file is rewritten. */
export function journalDateFromPath(path: string): string | null {
	const prefix = `${JOURNAL_ROOT}/${JOURNAL_FOLDERS.day}/`;
	if (!path.startsWith(prefix) || !path.endsWith('.md')) return null;
	const basename = path.slice(prefix.length, -3);
	const match = /^(\d{4}-\d{2}-\d{2})(?: 日记)?$/.exec(basename);
	if (!match) return null;
	const date = new Date(`${match[1]}T12:00:00`);
	return Number.isNaN(date.getTime()) || `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` !== match[1] ? null : match[1];
}

/** Live Preview only targets the current canonical daily filename, not legacy names. */
export function isCanonicalDailyJournalPath(path: string): boolean {
	const date = journalDateFromPath(path);
	return !!date && path === `${JOURNAL_ROOT}/${JOURNAL_FOLDERS.day}/${date}.md`;
}

/** Find the end of a real H2 without matching YAML or fenced examples. */
function journalSectionWidgetOffset(content: string, title: string): number | null {
	const lines = content.split('\n');
	let yaml = lines[0]?.replace(/^\uFEFF/, '').trim() === '---';
	let fence = '';
	let offset = 0;
	for (let index = 0; index < lines.length; index++) {
		const raw = lines[index] ?? '';
		const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
		if (yaml) {
			if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) yaml = false;
		} else if (fence) {
			if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = '';
		} else {
			const openingFence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
			if (openingFence) fence = openingFence[1] ?? '';
			else {
				const heading = /^ {0,3}##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
				if (heading?.[1]?.trim() === title) return offset + line.length;
			}
		}
		offset += raw.length + 1;
	}
	return null;
}

/** Live Preview title editor anchor. */
export function journalTitleWidgetOffset(content: string): number | null {
	return journalSectionWidgetOffset(content, '今日日记');
}

/** Live Preview dynamic task summary anchor. */
export function journalTaskWidgetOffset(content: string): number | null {
	return journalSectionWidgetOffset(content, '今日任务');
}

export function journalTasks(tasks: EmbeddedTask[], path: string) {
	const date = journalDateFromPath(path);
	return { date, groups: groupEmbeddedForDisplay(date ? tasks.filter(task => task.date === date) : []) };
}

export interface JournalCalendarEntry {
	date: string;
	path: string;
	title: string;
	titleSource: 'frontmatter' | 'legacy-h1' | 'quick-note';
	quickNoteCount: number;
	summary?: string;
}

interface MarkdownHeading { line: number; level: number; text: string }

/** Read only real Markdown headings; fenced examples and frontmatter are ignored. */
function markdownHeadings(content: string): { lines: string[]; headings: MarkdownHeading[] } {
	const lines = content.split(/\r?\n/);
	const headings: MarkdownHeading[] = [];
	let yaml = lines[0]?.replace(/^\uFEFF/, '').trim() === '---';
	let fence = '';
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!;
		if (yaml) { if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) yaml = false; continue; }
		if (fence) { if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = ''; continue; }
		const openingFence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
		if (openingFence) { fence = openingFence[1]!; continue; }
		const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
		if (heading) headings.push({ line: index, level: heading[1]!.length, text: heading[2]!.trim() });
	}
	return { lines, headings };
}

function sectionLines(document: ReturnType<typeof markdownHeadings>, title: string): string[] {
	const heading = document.headings.find(item => item.level === 2 && item.text === title);
	if (!heading) return [];
	const end = document.headings.find(item => item.line > heading.line && item.level <= 2)?.line ?? document.lines.length;
	return document.lines.slice(heading.line + 1, end);
}

function countJournalEntries(lines: string[]): number {
	let count = 0;
	let paragraph = false;
	let listItem = false;
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) { paragraph = false; listItem = false; continue; }
		if (/^(?:[-*+]|\d+[.)])[ \t]+/.test(line)) { count++; paragraph = false; listItem = true; continue; }
		if (listItem && /^\s+/.test(raw)) continue;
		listItem = false;
		if (!paragraph) { count++; paragraph = true; }
	}
	return count;
}

function plainJournalText(value: string): string {
	return value.replace(/^\s*>\s?/, '').replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias ?? target)
		.replace(/[*_`~]+/g, '').trim();
}

function firstJournalParagraph(lines: string[]): string | undefined {
	const paragraph: string[] = [];
	for (const raw of lines) {
		const line = plainJournalText(raw);
		if (!line) { if (paragraph.length) break; continue; }
		paragraph.push(line);
	}
	const text = paragraph.join(' ').trim();
	return text ? text.slice(0, 360) : undefined;
}

function defaultDailyHeading(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	return `${year}年${month}月${day}日`;
}

export function journalFrontmatterTitle(properties: unknown): string {
	return properties && typeof properties === 'object' && !Array.isArray(properties)
		&& typeof (properties as Record<string, unknown>)['标题'] === 'string'
		? ((properties as Record<string, string>)['标题'] ?? '').trim() : '';
}

/** Shared frontmatter title reader for Reading View and Live Preview. */
export function readJournalTitle(app: App, file: TFile): string {
	return journalFrontmatterTitle(app.metadataCache.getFileCache(file)?.frontmatter);
}

/** Preserve frontmatter order and every unrelated byte-level line choice while changing only the title field. */
export function updateJournalTitleContent(content: string, title: string): string {
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	const lines = content.split(/\r?\n/);
	const value = title.trim();
	applyFrontmatterUpdates(lines, { '标题': value });
	if (!value) {
		let inFrontmatter = false;
		for (let index = 0; index < lines.length; index++) {
			const line = lines[index] ?? '';
			if (/^(---|\.\.\.)\s*$/.test(line)) {
				if (!inFrontmatter && index === 0) { inFrontmatter = true; continue; }
				if (inFrontmatter) break;
			}
			if (inFrontmatter && /^\s*标题\s*:/.test(line)) lines[index] = '标题:';
		}
	}
	return lines.join(eol);
}

export async function writeJournalTitle(app: App, file: TFile, title: string): Promise<void> {
	const content = await app.vault.read(file);
	const next = updateJournalTitleContent(content, title);
	if (next !== content) await app.vault.modify(file, next);
}

/** Calendar projection only; the journal source remains untouched. */
export function journalCalendarEntry(path: string, content: string, properties: unknown): JournalCalendarEntry | null {
	const date = journalDateFromPath(path);
	if (!date) return null;
	const document = markdownHeadings(content);
	const quickNoteCount = countJournalEntries(sectionLines(document, '随时记'));
	const propertyTitle = journalFrontmatterTitle(properties);
	const rawH1 = document.headings.find(item => item.level === 1)?.text.trim() ?? '';
	const legacyTitle = rawH1 && rawH1 !== defaultDailyHeading(date) ? rawH1 : '';
	const title = propertyTitle || legacyTitle || (quickNoteCount ? `随时记 · ${quickNoteCount}条` : '');
	if (!title) return null;
	const titleSource: JournalCalendarEntry['titleSource'] = propertyTitle ? 'frontmatter' : legacyTitle ? 'legacy-h1' : 'quick-note';
	return { date, path, title, titleSource, quickNoteCount, summary: firstJournalParagraph(sectionLines(document, '今日日记')) };
}
export async function ensureJournal(files: PlanFiles, kind: JournalKind, date = new Date()): Promise<string> {
	const existing = existingJournalPath(files, kind, date);
	if (existing) return existing;
	const info = journalInfo(kind, date);
	return ensureSafeNote(files, info.path, [JOURNAL_ROOT, info.folder], journalTemplate(kind, date));
}
export interface JournalState { kind: JournalKind; exists: boolean; blocked: boolean }
export function journalStates(files: Pick<PlanFiles, 'kind'>, date = new Date()): JournalState[] {
	return JOURNAL_KINDS.map((kind) => {
		const states = journalPaths(kind, date).map(path => files.kind(path));
		return { kind, exists: states.includes('file'), blocked: states.includes('folder') };
	});
}
export interface JournalEntry { kind: JournalKind; path: string; title: string; period: string; label: string; order: number; canonical: boolean }

function periodDate(kind: JournalKind, period: string): Date | null {
	const pattern = kind === 'day' ? /^(\d{4})-(\d{2})-(\d{2})$/ : kind === 'week' ? /^(\d{4})-W(\d{2})$/ : kind === 'month' ? /^(\d{4})-(\d{2})$/ : kind === 'quarter' ? /^(\d{4})-Q([1-4])$/ : /^(\d{4})$/;
	const match = pattern.exec(period);
	if (!match) return null;
	const year = Number(match[1]);
	if (year < 1000 || year > 9999) return null;
	if (kind === 'week') {
		const week = Number(match[2]);
		const monday = new Date(year, 0, 4, 12);
		monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + (week - 1) * 7);
		const iso = isoWeek(monday);
		return iso.year === year && iso.week === week ? monday : null;
	}
	if (kind === 'quarter') return new Date(year, (Number(match[2]) - 1) * 3, 1, 12);
	const month = kind === 'year' ? 1 : Number(match[2]);
	const day = kind === 'day' ? Number(match[3]) : 1;
	const date = new Date(year, month - 1, day, 12);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** MetadataCache properties are parsed by Obsidian; invalid records are skipped. */
export function journalEntry(path: string, title: string, properties: unknown): JournalEntry | null {
	if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null;
	const fm = properties as Record<string, unknown>;
	const cycle = fm['周期'];
	const kind = fm['类型'] === '日记' ? 'day' : fm['类型'] === '周记' ? 'week' : fm['类型'] === '复盘' && cycle === '周度' ? 'week' : fm['类型'] === '复盘' && cycle === '月度' ? 'month' : fm['类型'] === '复盘' && cycle === '季度' ? 'quarter' : fm['类型'] === '复盘' && cycle === '年度' ? 'year' : null;
	if (!kind) return null;
	const legacyFolder = legacyFolders[kind];
	const folders = [JOURNAL_FOLDERS[kind], ...(legacyFolder ? [legacyFolder] : [])];
	if (!folders.some(folder => path.startsWith(`${JOURNAL_ROOT}/${folder}/`))) return null;
	const value = fm[kind === 'day' ? '日期' : '期间'];
	const period = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
	const date = periodDate(kind, period);
	if (!date) return null;
	return { kind, path, title, period, label: reviewDisplayLabel(kind), order: date.getTime(), canonical: path === journalInfo(kind, date).path };
}

/** Prefer the canonical path when both legacy and canonical notes exist. */
function preferJournalEntries(entries: readonly JournalEntry[]): JournalEntry[] {
	const preferred = new Map<string, JournalEntry>();
	for (const entry of entries) {
		const key = `${entry.kind}:${entry.period}`;
		const current = preferred.get(key);
		if (!current || (entry.canonical && !current.canonical) || (entry.canonical === current.canonical && entry.path.length < current.path.length)) preferred.set(key, entry);
	}
	return [...preferred.values()];
}

export function journalHistory(entries: JournalEntry[], mode: 'records' | 'reviews'): JournalEntry[] {
	return preferJournalEntries(entries).filter((entry) => mode === 'records' ? entry.kind === 'day' || entry.kind === 'week' : entry.kind === 'month' || entry.kind === 'year')
		.sort((a, b) => b.order - a.order || a.path.localeCompare(b.path, 'zh-CN')).slice(0, 30);
}
