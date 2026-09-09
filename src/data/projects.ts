import { learningName } from './learning.ts';
import { readSection } from './planning.ts';
import type { PlanFiles } from './planning';
import { validTaskDate, parseEmbeddedTasks } from './embeddedTasks.ts';
import { LIFE_COMPASS } from '../components/workbench/config.ts';
import { PROJECT_ROOT } from './vaultPaths.ts';
export { PROJECT_ROOT } from './vaultPaths.ts';

export const PROJECT_STATUSES = ['计划中', '进行中', '暂停', '已完成', '归档'] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];
export interface MengxuProject {
	id: string; path: string; name: string; status: ProjectStatus; direction: string;
	startDate: string; dueDate: string; createdDate: string; goal: string;
	longTermPlanId?: string;
}
export interface NewProject {
	name: string; status: ProjectStatus; direction?: string; startDate?: string; dueDate?: string; goal?: string; longTermPlanId?: string;
}
export function projectDirections(): string[] { return LIFE_COMPASS.flatMap(l => l.items); }
export function projectPath(name: string): { name: string; folder: string; path: string } {
	const safe = learningName(name);
	return { name: safe, folder: `${PROJECT_ROOT}/${safe}`, path: `${PROJECT_ROOT}/${safe}/${safe}.md` };
}
function text(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }
function date(v: unknown): string {
	if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
	const s = text(v); return validTaskDate(s) ? s : '';
}
export function projectNote(path: string, properties: unknown): MengxuProject | null {
	if (!path.startsWith(`${PROJECT_ROOT}/`) || !path.endsWith('.md') || path.split('/').some(p => p.startsWith('.'))) return null;
	if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null;
	const fm = properties as Record<string, unknown>;
	if (fm['类型'] !== '项目') return null;
	return { id: text(fm['项目ID']), path, name: path.split('/').pop()!.slice(0, -3),
		status: PROJECT_STATUSES.includes(fm['状态'] as ProjectStatus) ? fm['状态'] as ProjectStatus : '计划中',
		direction: text(fm['方向']), startDate: date(fm['开始日期']), dueDate: date(fm['截止日期']), createdDate: date(fm['创建日期']), goal: text(fm['项目目标']),
		...(text(fm['关联长期计划ID']) ? { longTermPlanId: text(fm['关联长期计划ID']) } : {}) };
}
export function projectTemplate(input: NewProject, id: string, createdDate: string): string {
	const { name } = projectPath(input.name);
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('项目 ID 必须是 UUID');
	if (!PROJECT_STATUSES.includes(input.status)) throw new Error('项目状态无效');
	if (input.direction && !projectDirections().includes(input.direction)) throw new Error('请选择当前人生方向');
	for (const value of [input.startDate, input.dueDate, createdDate]) if (value && !validTaskDate(value)) throw new Error('项目日期无效');
	if (input.startDate && input.dueDate && input.startDate > input.dueDate) throw new Error('截止日期不能早于开始日期');
	const scalar = (s?: string) => s ? JSON.stringify(s) : '';
	return `---\n类型: 项目\n项目ID: ${id}\n状态: ${input.status}\n方向: ${scalar(input.direction)}\n关联长期计划ID: ${scalar(input.longTermPlanId)}\n开始日期: ${scalar(input.startDate)}\n截止日期: ${scalar(input.dueDate)}\n创建日期: ${createdDate}\n项目目标: ${scalar(input.goal)}\n---\n\n# ${name}\n\n## 项目目标\n\n${input.goal?.trim() || ''}\n\n## 项目任务\n\n- [ ]\n\n## 项目资料\n\n\n## 过程记录\n\n\n## 最终成果\n\n\n## 项目复盘\n\n`;
}
export async function createMengxuProject(files: PlanFiles, input: NewProject, id: string, createdDate: string): Promise<string> {
	const info = projectPath(input.name);
	const content = projectTemplate(input, id, createdDate);
	if (files.kind(info.folder)) throw new Error('同名项目目录已存在，请打开已有项目；不会覆盖');
	if (!files.kind(PROJECT_ROOT)) {
		try { await files.createFolder(PROJECT_ROOT); }
		catch (e) { if (files.kind(PROJECT_ROOT) !== 'folder') throw e; }
	}
	if (files.kind(PROJECT_ROOT) !== 'folder') throw new Error('项目根目录被文件占用');
	// Directory creation claims ownership; never adopt an existing folder after a race.
	await files.createFolder(info.folder);
	await files.create(info.path, content);
	return info.path;
}
export function filterProjects(projects: MengxuProject[], status: ProjectStatus | '全部'): MengxuProject[] {
	return projects.filter(p => status === '全部' || p.status === status);
}
export function directionProjects(projects: MengxuProject[], direction: string): MengxuProject[] {
	return direction ? projects.filter(p => p.direction === direction) : [];
}
export function currentProjects(projects: MengxuProject[]): MengxuProject[] {
	return projects.filter(p => p.status === '进行中' || p.status === '计划中')
		.sort((a, b) => Number(a.status !== '进行中') - Number(b.status !== '进行中') || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.name.localeCompare(b.name, 'zh-CN')).slice(0, 3);
}
export function projectSummary(project: MengxuProject, content: string) {
	const tasks = parseEmbeddedTasks(project.path, content);
	const summary = (heading: string) => readSection(content, heading).content.slice(0, 3).join('\n').slice(0, 400);
	return { total: tasks.length, done: tasks.filter(t => t.completed).length,
		goal: summary('项目目标') || project.goal, materials: summary('项目资料'), progress: summary('过程记录'), outcome: summary('最终成果') };
}
