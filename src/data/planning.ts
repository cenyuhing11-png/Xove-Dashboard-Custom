import { ensureSafeNote } from './safeNote.ts';
import { PLAN_ROOT, PLAN_FOLDERS } from './vaultPaths.ts';
export { PLAN_ROOT } from './vaultPaths.ts';

export type PlanPeriod = 'year' | 'quarter' | 'month' | 'week';
export const PLAN_PERIODS: PlanPeriod[] = ['week', 'month', 'quarter', 'year'];
const folders: Record<PlanPeriod, string> = { year: '年度', quarter: '季度', month: '月度', week: '周计划' };

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
	const year = date.getFullYear();
	const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	const quarter = `${year}-Q${Math.floor(date.getMonth() / 3) + 1}`;
	const iso = isoWeek(date);
	const keys = { year: String(year), quarter, month, week: `${iso.year}-W${String(iso.week).padStart(2, '0')}` };
	const key = keys[period];
	const name = `${key} ${period === 'week' ? '周计划' : `${folders[period]}计划`}`;
	const parent = period === 'quarter' ? `${year} 年度计划` : period === 'month' ? `${quarter} 季度计划` : period === 'week' ? `${month} 月度计划` : undefined;
	return { period, key, name, parent, folder: `${PLAN_ROOT}/${PLAN_FOLDERS[period]}`, path: `${PLAN_ROOT}/${PLAN_FOLDERS[period]}/${name}.md` };
}

export function planTemplate(period: PlanPeriod, date = new Date()): string {
	const info = planInfo(period, date);
	const title = period === 'month' ? `${date.getFullYear()}年${date.getMonth() + 1}月` : period === 'quarter' || period === 'week' ? info.name.replace('-', ' ') : info.name;
	const sections: Record<PlanPeriod, string> = {
		year: '## 年度核心突破\n\n-\n\n## 持续维护\n\n-\n\n## 年度成果标准\n\n-\n\n## 备注\n',
		quarter: '## 当前季度主题\n\n-\n\n## 季度重点\n\n-\n-\n-\n\n## 持续维护\n\n-\n\n## 本季度想得到的结果\n\n-\n\n## 备注\n',
		month: '## 本月重点\n\n-\n-\n-\n\n## 持续维护\n\n-\n\n## 本月想得到的结果\n\n-\n\n## 备注\n',
		week: '## 本周重点\n\n-\n-\n-\n\n## 本周行动\n\n- [ ]\n\n## 持续维护\n\n-\n\n## 备注\n',
	};
	return `---\n类型: 计划\n周期: ${folders[period]}\n期间: ${info.key}\n状态: 进行中\n${info.parent ? `上级计划: "[[${info.parent}]]"\n` : ''}---\n\n# ${title}\n\n${sections[period]}`;
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
	const path = planInfo(period, date).path;
	try {
		const kind = files.kind(path);
		if (!kind) return { period, exists: false, entries: [] };
		if (kind !== 'file') throw new Error('计划路径被文件夹占用');
		const markdown = await files.read(path);
		const title = { week: '本周重点', month: '本月重点', quarter: '当前季度主题', year: '年度核心突破' }[period];
		const section = readSection(markdown, title);
		const entries = period === 'quarter' ? (section.content.length ? section.content : readSection(markdown, '季度重点').items) : section.items;
		return { period, exists: true, entries: entries.slice(0, period === 'week' || period === 'month' ? 3 : 1) };
	} catch {
		return { period, exists: true, entries: [], error: '暂时无法读取计划，请检查对应笔记' };
	}
}

/** Never modify an existing file; a concurrent creator wins safely. */
export async function ensurePlan(files: PlanFiles, period: PlanPeriod, date = new Date()): Promise<string> {
	const info = planInfo(period, date);
	return ensureSafeNote(files, info.path, [PLAN_ROOT, info.folder], planTemplate(period, date));
}
