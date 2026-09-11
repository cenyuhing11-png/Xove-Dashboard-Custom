import { ensureSafeNote } from './safeNote.ts';
import { LEGACY_PLAN_FOLDERS, PLAN_ROOT, PLAN_FOLDERS } from './vaultPaths.ts';
export { PLAN_ROOT } from './vaultPaths.ts';

export type PlanPeriod = 'year' | 'quarter' | 'month' | 'week';
export const PLAN_PERIODS: PlanPeriod[] = ['week', 'month', 'quarter', 'year'];
const cycleNames: Record<PlanPeriod, string> = { year: '年度', quarter: '季度', month: '月度', week: '周计划' };
const displayNames: Record<PlanPeriod, string> = { year: '年计划', quarter: '季计划', month: '月计划', week: '周计划' };
const legacyDisplayNames: Record<PlanPeriod, string> = { year: '年度计划', quarter: '季度计划', month: '月度计划', week: '周计划' };

function planInfoForFolder(period: PlanPeriod, date: Date, folder: string, legacy: boolean) {
	const year = date.getFullYear();
	const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	const quarter = `${year}-Q${Math.floor(date.getMonth() / 3) + 1}`;
	const iso = isoWeek(date);
	const keys = { year: String(year), quarter, month, week: `${iso.year}-W${String(iso.week).padStart(2, '0')}` };
	const key = keys[period];
	const name = `${key} ${legacy ? legacyDisplayNames[period] : displayNames[period]}`;
	const parent = period === 'quarter' ? `${year} 年计划` : period === 'month' ? `${quarter} 季计划` : period === 'week' ? `${month} 月计划` : undefined;
	return { period, key, name, parent, folder: `${PLAN_ROOT}/${folder}`, path: `${PLAN_ROOT}/${folder}/${name}.md` };
}

/** Use local calendar dates; count calendar days rather than elapsed DST hours. */
export function isoWeek(date: Date): { year: number; week: number } {
	const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
	thursday.setDate(thursday.getDate() + 4 - (thursday.getDay() || 7));
	const year = thursday.getFullYear();
	let ordinal = thursday.getDate();
	for (let month = 0; month < thursday.getMonth(); month++) ordinal += new Date(year, month + 1, 0).getDate();
	return { year, week: Math.ceil(ordinal / 7) };
}

export function planInfo(period: PlanPeriod, date = new Date()) {
	return planInfoForFolder(period, date, PLAN_FOLDERS[period], false);
}

/** Legacy paths remain readable until the real Vault migration phase. */
export function legacyPlanInfo(period: PlanPeriod, date = new Date()) {
	return planInfoForFolder(period, date, LEGACY_PLAN_FOLDERS[period], true);
}

/** Canonical first, then legacy; identical week paths are returned once. */
export function planPaths(period: PlanPeriod, date = new Date()): string[] {
	return [...new Set([planInfo(period, date).path, legacyPlanInfo(period, date).path])];
}

export function existingPlanPath(files: Pick<PlanFiles, 'kind'>, period: PlanPeriod, date = new Date()): string | undefined {
	let blocked = false;
	for (const path of planPaths(period, date)) {
		const kind = files.kind(path);
		if (kind === 'file') return path;
		if (kind === 'folder') blocked = true;
	}
	if (blocked) throw new Error('计划路径被文件夹占用');
	return undefined;
}

export function planTemplate(period: PlanPeriod, date = new Date()): string {
	const info = planInfo(period, date);
	const title = period === 'month' ? `${date.getFullYear()}年${date.getMonth() + 1}月` : period === 'quarter' || period === 'week' ? info.name.replace('-', ' ') : info.name;
	const sections: Record<PlanPeriod, string> = {
		year: '## 这一年我想达到什么状态\n\n## 今年最想实现的突破\n\n## 这一年我不准备做什么\n\n## 年底希望看到的变化\n',
		quarter: '## 这个季度我想达到什么状态\n\n## 当前季度主题\n\n## 季度重点\n\n## 这个季度我不准备做什么\n\n## 季末希望看到的变化\n',
		month: '## 这个月我想达到什么状态\n\n## 本月重点\n\n## 这个月我不准备做什么\n\n## 月底希望看到的变化\n',
		week: '## 这周我想推进什么\n\n## 本周重点\n\n## 这周我不准备做什么\n\n## 周末希望看到的变化\n',
	};
	return `---\n类型: 计划\n周期: ${cycleNames[period]}\n期间: ${info.key}\n状态: 进行中\n${info.parent ? `上级计划: "[[${info.parent}]]"\n` : ''}---\n\n# ${title}\n\n${sections[period]}`;
}

function plainText(value: string): string {
	return value.replace(/!?(?:\[\[)([^\]]+)\]\]/g, (_, link: string) => link.split('|').pop() ?? link)
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]*>/g, '').replace(/[*_~`]/g, '').replace(/\\([\[\]*_`])/g, '$1').trim();
}

/** Line-based section scanner: frontmatter/fences are excluded, H1/H2 end a section. */
export function readSection(markdown: string, title: string): { found: boolean; items: string[]; content: string[] } {
	const result = { found: false, items: [] as string[], content: [] as string[] };
	let frontmatter = false;
	let fence = '';
	let fenceLength = 0;
	const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? '';
		if (index === 0 && line.trim() === '---') { frontmatter = true; continue; }
		if (frontmatter) { if (/^(---|\.\.\.)\s*$/.test(line)) frontmatter = false; continue; }
		const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) {
			if (marker && marker[1]?.[0] === fence && marker[1].length >= fenceLength && !marker[2]?.trim()) fence = '';
			continue;
		}
		if (marker) { fence = marker[1]?.[0] ?? ''; fenceLength = marker[1]?.length ?? 3; continue; }
		const heading = /^ {0,3}(#{1,6})(?:\s+|$)(.*)$/.exec(line);
		if (heading) {
			const level = heading[1]?.length ?? 6;
			if (result.found && level <= 2) break;
			if (level === 2 && plainText((heading[2] ?? '').replace(/\s+#+\s*$/, '')) === title) result.found = true;
			continue;
		}
		if (!result.found) continue;
		const list = /^\s*[-*+](?:\s+|$)(?:\[[ xX]\](?:\s+|$))?(.*)$/.exec(line);
		const text = plainText(list ? list[1] ?? '' : line);
		if (!text) continue;
		result.content.push(text);
		if (list) result.items.push(text);
	}
	return result;
}

export interface PlanState { period: PlanPeriod; exists: boolean; entries: string[]; error?: string }
export interface PlanFiles {
	kind(path: string): 'file' | 'folder' | undefined;
	read(path: string): Promise<string>;
	createFolder(path: string): Promise<unknown>;
	create(path: string, content: string): Promise<unknown>;
}

export async function readPlan(files: PlanFiles, period: PlanPeriod, date = new Date()): Promise<PlanState> {
	try {
		const path = existingPlanPath(files, period, date);
		if (!path) return { period, exists: false, entries: [] };
		const markdown = await files.read(path);
		const titles = { week: ['本周重点'], month: ['本月重点'], quarter: ['当前季度主题', '季度重点'], year: ['今年最想实现的突破', '年度核心突破'] }[period];
		let section = readSection(markdown, titles[0]!);
		for (const fallback of titles.slice(1)) if (!section.content.length) section = readSection(markdown, fallback);
		const entries = period === 'quarter' ? (section.content.length ? section.content : section.items) : section.items;
		return { period, exists: true, entries: entries.slice(0, period === 'week' || period === 'month' ? 3 : 1) };
	} catch {
		return { period, exists: true, entries: [], error: '暂时无法读取计划，请检查对应笔记' };
	}
}

/** Never modify an existing file; a concurrent creator wins safely. */
export async function ensurePlan(files: PlanFiles, period: PlanPeriod, date = new Date()): Promise<string> {
	const existing = existingPlanPath(files, period, date);
	if (existing) return existing;
	const info = planInfo(period, date);
	return ensureSafeNote(files, info.path, [PLAN_ROOT, info.folder], planTemplate(period, date));
}
