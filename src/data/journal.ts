import { isoWeek, planInfo } from './planning.ts';
import type { PlanFiles } from './planning';
import { ensureSafeNote } from './safeNote.ts';

export const JOURNAL_ROOT = '04-日记与复盘';
export type JournalKind = 'day' | 'week' | 'month' | 'year';
export const JOURNAL_KINDS: JournalKind[] = ['day', 'week', 'month', 'year'];
const folders: Record<JournalKind, string> = { day: '日记', week: '周记', month: '月度复盘', year: '年度复盘' };
export function journalInfo(kind: JournalKind, date = new Date()) {
	const year = date.getFullYear();
	const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	const day = `${month}-${String(date.getDate()).padStart(2, '0')}`;
	const period = kind === 'day' ? day : planInfo(kind, date).key;
	const folder = `${JOURNAL_ROOT}/${folders[kind]}`;
	return { kind, period, folder, path: `${folder}/${period} ${folders[kind]}.md`, name: `${period} ${folders[kind]}` };
}
export function journalTemplate(kind: JournalKind, date = new Date()): string {
	const info = journalInfo(kind, date);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const headers: Record<JournalKind, string> = {
		day: `类型: 日记\n日期: ${info.period}`,
		week: `类型: 周记\n期间: ${info.period}\n关联计划: "[[${planInfo('week', date).name}]]"`,
		month: `类型: 复盘\n周期: 月度\n期间: ${info.period}\n关联计划: "[[${planInfo('month', date).name}]]"`,
		year: `类型: 复盘\n周期: 年度\n期间: ${info.period}\n关联计划: "[[${planInfo('year', date).name}]]"`,
	};
	const titles = { day: `${year}年${month}月${date.getDate()}日`, week: info.name.replace('-', ' '), month: `${year}年${month}月复盘`, year: `${year}年度复盘` };
	const sections: Record<JournalKind, string[]> = {
		day: ['今天', '想法', '学习与收获', '明天'],
		week: ['本周发生了什么', '本周完成', '学习与思考', '项目与作品', '本周感受', '下周'],
		month: ['本月计划回顾', '本月完成', '学习与成长', '项目与作品', '内容与输出', '财务与生活', '做得好的', '需要调整', '下月重点'],
		year: ['年度目标回顾', '这一年发生了什么', '事业与设计', '内容与影响力', '学习与认知', '财务', '生活', '今年最重要的收获', '需要调整的事情', '下一年'],
	};
	return `---\n${headers[kind]}\n---\n\n# ${titles[kind]}\n\n${sections[kind].map((title) => `## ${title}\n`).join('\n')}\n`;
}
export async function ensureJournal(files: PlanFiles, kind: JournalKind, date = new Date()): Promise<string> {
	const info = journalInfo(kind, date);
	return ensureSafeNote(files, info.path, [JOURNAL_ROOT, info.folder], journalTemplate(kind, date));
}
export interface JournalState { kind: JournalKind; exists: boolean; blocked: boolean }
export function journalStates(files: Pick<PlanFiles, 'kind'>, date = new Date()): JournalState[] {
	return JOURNAL_KINDS.map((kind) => {
		const entry = files.kind(journalInfo(kind, date).path);
		return { kind, exists: entry === 'file', blocked: entry === 'folder' };
	});
}
export interface JournalEntry { kind: JournalKind; path: string; title: string; period: string; label: string; order: number }

function periodDate(kind: JournalKind, period: string): Date | null {
	const pattern = kind === 'day' ? /^(\d{4})-(\d{2})-(\d{2})$/ : kind === 'week' ? /^(\d{4})-W(\d{2})$/ : kind === 'month' ? /^(\d{4})-(\d{2})$/ : /^(\d{4})$/;
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
	const month = kind === 'year' ? 1 : Number(match[2]);
	const day = kind === 'day' ? Number(match[3]) : 1;
	const date = new Date(year, month - 1, day, 12);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** MetadataCache properties are parsed by Obsidian; invalid records are skipped. */
export function journalEntry(path: string, title: string, properties: unknown): JournalEntry | null {
	if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null;
	const fm = properties as Record<string, unknown>;
	const kind = fm['类型'] === '日记' ? 'day' : fm['类型'] === '周记' ? 'week' : fm['类型'] === '复盘' && fm['周期'] === '月度' ? 'month' : fm['类型'] === '复盘' && fm['周期'] === '年度' ? 'year' : null;
	if (!kind || !path.startsWith(`${JOURNAL_ROOT}/${folders[kind]}/`)) return null;
	const value = fm[kind === 'day' ? '日期' : '期间'];
	const period = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
	const date = periodDate(kind, period);
	if (!date) return null;
	return { kind, path, title, period, label: folders[kind], order: date.getTime() };
}
export function journalHistory(entries: JournalEntry[], mode: 'records' | 'reviews'): JournalEntry[] {
	return entries.filter((entry) => mode === 'records' ? entry.kind === 'day' || entry.kind === 'week' : entry.kind === 'month' || entry.kind === 'year')
		.sort((a, b) => b.order - a.order || a.path.localeCompare(b.path, 'zh-CN')).slice(0, 30);
}
