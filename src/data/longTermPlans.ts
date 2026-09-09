import type { PlanFiles } from './planning.ts';
import { learningName, relationNames } from './learning.ts';
import { LONG_TERM_PLAN_ROOT } from './vaultPaths.ts';
import { PROJECT_STATUSES } from './projects.ts';
import type { ProjectStatus } from './projects.ts';

export { LONG_TERM_PLAN_ROOT } from './vaultPaths.ts';
export interface LongTermStage { index: number; text: string; completed: boolean }
export interface LongTermPlan {
	id: string; path: string; name: string; status: ProjectStatus; startMonth: string; endMonth: string;
	createdDate: string; goal: string; stages: LongTermStage[];
}
export interface NewLongTermPlan { name: string; status: ProjectStatus; startMonth: string; endMonth: string; goal?: string }
export interface LinkedPeriodPlan { path: string; name: string; period: string; longTermPlanIds: string[] }

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''; }
export function validMonth(value: string): boolean { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
export function longTermRelationIds(value: unknown): string[] {
	return relationNames(value).map(value => value.trim()).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
}
export function longTermPlanPath(name: string): { name: string; path: string } {
	const safe = learningName(name); return { name: safe, path: `${LONG_TERM_PLAN_ROOT}/${safe}.md` };
}
export function parseLongTermStages(markdown: string): LongTermStage[] {
	const stages: LongTermStage[] = []; let inSection = false, inFrontmatter = false, fence = '';
	for (const [lineIndex, line] of markdown.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
		if (lineIndex === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
		if (inFrontmatter) { if (/^(---|\.\.\.)\s*$/.test(line)) inFrontmatter = false; continue; }
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
		if (marker) { if (!fence) fence = marker[0]!; else if (marker[0] === fence) fence = ''; continue; }
		if (fence) continue;
		const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*$/.exec(line);
		if (heading) { if (inSection && heading[1]!.length <= 2) break; inSection = heading[1] === '##' && heading[2] === '阶段安排'; continue; }
		if (!inSection) continue;
		const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
		if (task) stages.push({ index: stages.length, text: task[2]!, completed: task[1]!.toLowerCase() === 'x' });
	}
	return stages;
}
export function toggleLongTermStage(markdown: string, stageIndex: number, completed: boolean): string {
	const eol = markdown.includes('\r\n') ? '\r\n' : '\n'; const lines = markdown.split(/\r?\n/);
	let inSection = false, seen = 0, frontmatter = false, fence = '';
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? '';
		if (index === 0 && line.trim() === '---') { frontmatter = true; continue; }
		if (frontmatter) { if (/^(---|\.\.\.)\s*$/.test(line)) frontmatter = false; continue; }
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
		if (marker) { if (!fence) fence = marker[0]!; else if (marker[0] === fence) fence = ''; continue; }
		if (fence) continue;
		const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*$/.exec(line);
		if (heading) { if (inSection && heading[1]!.length <= 2) break; inSection = heading[1] === '##' && heading[2] === '阶段安排'; continue; }
		if (!inSection || !/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) continue;
		if (seen++ !== stageIndex) continue;
		lines[index] = line.replace(/\[([ xX])\]/, completed ? '[x]' : '[ ]'); return lines.join(eol);
	}
	throw new Error('长期计划阶段已变化，请刷新后重试');
}
export function currentLongTermStage(stages: readonly LongTermStage[]): string {
	return stages.find(stage => !stage.completed)?.text ?? (stages.length ? '阶段已完成' : '尚未添加阶段');
}
export function longTermStageProgress(stages: readonly LongTermStage[]): { completed: number; total: number } {
	return { completed: stages.filter(stage => stage.completed).length, total: stages.length };
}
export function longTermMonths(startMonth: string, endMonth: string): number {
	if (!validMonth(startMonth) || !validMonth(endMonth) || startMonth > endMonth) return 0;
	const [sy, sm] = startMonth.split('-').map(Number), [ey, em] = endMonth.split('-').map(Number);
	return (ey! - sy!) * 12 + em! - sm! + 1;
}
export function longTermPlanNote(path: string, properties: unknown, markdown: string): LongTermPlan | null {
	if (!path.startsWith(`${LONG_TERM_PLAN_ROOT}/`) || !path.endsWith('.md') || !properties || typeof properties !== 'object' || Array.isArray(properties)) return null;
	const fm = properties as Record<string, unknown>; if (fm['类型'] !== '长期计划') return null;
	const id = text(fm['长期计划ID']), startMonth = text(fm['开始月份']), endMonth = text(fm['结束月份']);
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !validMonth(startMonth) || !validMonth(endMonth)) return null;
	return { id, path, name: path.split('/').pop()!.slice(0, -3), status: PROJECT_STATUSES.includes(fm['状态'] as ProjectStatus) ? fm['状态'] as ProjectStatus : '计划中', startMonth, endMonth,
		createdDate: text(fm['创建日期']), goal: text(fm['长期目标']), stages: parseLongTermStages(markdown) };
}
export function longTermPlanTemplate(input: NewLongTermPlan, id: string, createdDate: string): string {
	const { name } = longTermPlanPath(input.name);
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('长期计划 ID 必须是 UUID');
	if (!PROJECT_STATUSES.includes(input.status)) throw new Error('长期计划状态无效');
	if (!validMonth(input.startMonth) || !validMonth(input.endMonth) || input.startMonth > input.endMonth) throw new Error('长期计划月份范围无效');
	const goal = input.goal?.trim() ?? '';
	return `---\n类型: 长期计划\n长期计划ID: ${id}\n状态: ${input.status}\n开始月份: ${input.startMonth}\n结束月份: ${input.endMonth}\n创建日期: ${createdDate}\n长期目标: ${JSON.stringify(goal)}\n---\n\n# ${name}\n\n## 长期目标\n\n${goal}\n\n## 阶段安排\n\n## 备注\n`;
}
export async function createLongTermPlan(files: PlanFiles, input: NewLongTermPlan, id: string, createdDate: string): Promise<string> {
	const info = longTermPlanPath(input.name); const content = longTermPlanTemplate(input, id, createdDate);
	if (files.kind(info.path)) throw new Error('同名长期计划已存在，请打开已有计划；不会覆盖');
	if (!files.kind('05-计划')) await files.createFolder('05-计划');
	if (!files.kind(LONG_TERM_PLAN_ROOT)) await files.createFolder(LONG_TERM_PLAN_ROOT);
	await files.create(info.path, content); return info.path;
}
export function longTermPlansForMonth(plans: readonly LongTermPlan[], year: number, month: number): LongTermPlan[] {
	const key = `${year}-${String(month).padStart(2, '0')}`;
	return plans.filter(plan => plan.startMonth <= key && plan.endMonth >= key && plan.status !== '归档')
		.sort((a, b) => a.startMonth.localeCompare(b.startMonth) || a.name.localeCompare(b.name, 'zh-CN'));
}
export function activeLongTermPlans(plans: readonly LongTermPlan[]): LongTermPlan[] { return plans.filter(plan => plan.status !== '归档'); }
export function linkedPeriodPlan(path: string, properties: unknown): LinkedPeriodPlan | null {
	if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null;
	const fm = properties as Record<string, unknown>; if (fm['类型'] !== '计划') return null;
	const ids = longTermRelationIds(fm['关联长期计划ID']); if (!ids.length) return null;
	return { path, name: path.split('/').pop()!.replace(/\.md$/, ''), period: text(fm['周期']), longTermPlanIds: ids };
}
