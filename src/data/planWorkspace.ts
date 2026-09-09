import type { EmbeddedTask } from './embeddedTasks.ts';
import { isoWeek, planInfo, readSection } from './planning.ts';
import type { PlanFiles, PlanPeriod } from './planning.ts';

export type PlanWorkspaceMode = 'board' | 'longTermPlan' | 'calendar' | 'review';
export type PlanCalendarMode = 'month' | 'week';

export interface PlanWorkspaceSelection { year: number; month: number }
export interface PlanWorkspaceCard { period: PlanPeriod; title: string; path: string; exists: boolean; entries: string[]; error?: string }
export interface PlanWorkspaceWeek extends PlanWorkspaceCard { isoYear: number; week: number; start: Date; end: Date }
export interface PlanWorkspaceSnapshot { selection: PlanWorkspaceSelection; quarter: number; annual: PlanWorkspaceCard; quarterly: PlanWorkspaceCard; monthly: PlanWorkspaceCard; weeks: PlanWorkspaceWeek[] }

export function localPlanSelection(now = new Date()): PlanWorkspaceSelection {
	return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function quarterForMonth(month: number): number {
	if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('月份必须为 1 到 12');
	return Math.floor((month - 1) / 3) + 1;
}

export function selectionDate(year: number, month: number): Date {
	if (!Number.isInteger(year) || year < 1) throw new Error('年份无效');
	quarterForMonth(month);
	return new Date(year, month - 1, 1, 12);
}

function monday(date: Date): Date {
	const value = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
	value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
	return value;
}

export function monthIsoWeeks(year: number, month: number): Array<{ isoYear: number; week: number; start: Date; end: Date }> {
	const first = selectionDate(year, month);
	const last = new Date(year, month, 0, 12);
	const cursor = monday(first);
	const result: Array<{ isoYear: number; week: number; start: Date; end: Date }> = [];
	while (cursor <= last) {
		const start = new Date(cursor);
		const end = new Date(cursor); end.setDate(end.getDate() + 6);
		const iso = isoWeek(start);
		result.push({ isoYear: iso.year, week: iso.week, start, end });
		cursor.setDate(cursor.getDate() + 7);
	}
	return result;
}

async function card(files: Pick<PlanFiles, 'kind' | 'read'>, period: PlanPeriod, date: Date, title: string, primary: string, fallback?: string): Promise<PlanWorkspaceCard> {
	const info = planInfo(period, date);
	try {
		const kind = files.kind(info.path);
		if (!kind) return { period, title, path: info.path, exists: false, entries: [] };
		if (kind !== 'file') throw new Error('计划路径不是文件');
		const markdown = await files.read(info.path);
		let section = readSection(markdown, primary);
		if (!section.content.length && fallback) section = readSection(markdown, fallback);
		const entries = (section.items.length ? section.items : section.content).slice(0, 3);
		return { period, title, path: info.path, exists: true, entries };
	} catch {
		return { period, title, path: info.path, exists: true, entries: [], error: '暂时无法读取计划' };
	}
}

export async function readPlanWorkspace(files: Pick<PlanFiles, 'kind' | 'read'>, year: number, month: number): Promise<PlanWorkspaceSnapshot> {
	const date = selectionDate(year, month);
	const quarter = quarterForMonth(month);
	const [annual, quarterly, monthly] = await Promise.all([
		card(files, 'year', date, `${year} 年度`, '年度核心突破'),
		card(files, 'quarter', date, `${year} Q${quarter}`, '当前季度主题', '季度重点'),
		card(files, 'month', date, `${year} 年 ${month} 月`, '本月重点'),
	]);
	const weeks = await Promise.all(monthIsoWeeks(year, month).map(async value => {
		const base = await card(files, 'week', value.start, `W${String(value.week).padStart(2, '0')}`, '本周重点');
		return { ...base, ...value };
	}));
	return { selection: { year, month }, quarter, annual, quarterly, monthly, weeks };
}

export function dateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function tasksOnDate(tasks: EmbeddedTask[], date: string): EmbeddedTask[] {
	return tasks.filter(task => task.date === date).sort((a, b) => Number(a.completed) - Number(b.completed) || a.sourceFile.localeCompare(b.sourceFile, 'zh-CN') || a.text.localeCompare(b.text, 'zh-CN'));
}

export function incompleteTaskCountOnDate(tasks: EmbeddedTask[], date: string): number {
	return tasks.reduce((count, task) => count + Number(task.date === date && !task.completed), 0);
}

export function tasksInMonth(tasks: EmbeddedTask[], year: number, month: number): EmbeddedTask[] {
	const prefix = `${year}-${String(month).padStart(2, '0')}-`;
	return tasks.filter(task => task.date?.startsWith(prefix));
}

export function taskCalendarCategory(task: EmbeddedTask): 'learning' | 'creation' | 'daily' {
	return task.sourceType === 'project' ? 'creation' : task.sourceType;
}

export function taskCalendarSourceLabel(task: EmbeddedTask): string {
	if (task.sourceType === 'project') return '项目';
	if (task.sourceType === 'creation') return '知识';
	if (task.sourceType === 'daily') return '日常';
	if (task.sourceFile.startsWith('01-学习与资料/视频/')) return '视频';
	return '学习';
}
