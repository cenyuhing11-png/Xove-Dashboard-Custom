import { LEARNING_ROOT } from './learning.ts';
import type { LearningNote } from './learning';
import { PROJECT_ROOT, PROJECT_STATUSES } from './projects.ts';
import type { MengxuProject, ProjectStatus } from './projects';
import { EMBEDDED_HEADINGS, validTaskDate } from './embeddedTasks.ts';
import type { EmbeddedTask } from './embeddedTasks';
import type { ProjectInfo } from './taskParseCore';

export type ProcessType = 'learning' | 'project';
export type ProcessStatus = ProjectStatus;
/** Read-only aggregation, never written to Markdown or plugin settings. */
export interface Process {
	id: string; name: string; processType: ProcessType; status: ProcessStatus; rawStatus: string;
	direction: string; startDate?: string; dueDate?: string; sourceFile: string;
	taskTotal: number; taskCompleted: number; taskPending: number;
	/** Task completion ratio only. null means no tasks, not 0% mastery. */
	progress: number | null;
}
export interface ProcessBoardItem extends ProjectInfo {
	key: string; status: ProcessStatus; direction: string; process: Process;
}
export function learningProcessStatus(status: string): ProcessStatus {
	if ((PROJECT_STATUSES as readonly string[]).includes(status)) return status as ProcessStatus;
	const aliases: Record<string, ProcessStatus> = { 学习中: '进行中', 待学习: '计划中', 排队中: '计划中', 已暂停: '暂停', 已学完: '已完成', 已归档: '归档' };
	return Object.prototype.hasOwnProperty.call(aliases, status) ? aliases[status]! : '计划中';
}
function inRoot(path: string, root: string): boolean {
	return path.startsWith(root + '/') && path.endsWith('.md') && !path.split('/').some(p => p.startsWith('.') || !p);
}
function dates(start?: string, due?: string) {
	return { ...(start && validTaskDate(start) ? { startDate: start } : {}), ...(due && validTaskDate(due) ? { dueDate: due } : {}) };
}
function counts(type: ProcessType, path: string, tasks: readonly EmbeddedTask[]) {
	const related = tasks.filter(t => t.sourceType === type && t.sourceFile === path && t.sourceHeading === EMBEDDED_HEADINGS[type]);
	const taskTotal = related.length, taskCompleted = related.filter(t => t.completed).length;
	return { taskTotal, taskCompleted, taskPending: taskTotal - taskCompleted, progress: taskTotal ? taskCompleted / taskTotal : null };
}
export function processes(notes: readonly LearningNote[], projects: readonly MengxuProject[], tasks: readonly EmbeddedTask[]): Process[] {
	const learning: Process[] = notes.filter(n => n.kind === '学习主题' && inRoot(n.path, LEARNING_ROOT)).map(n => ({
		id: `learning:${n.path}`, name: n.name, processType: 'learning', status: learningProcessStatus(n.status), rawStatus: n.status,
		direction: n.direction, sourceFile: n.path, ...dates(n.startDate, n.dueDate), ...counts('learning', n.path, tasks),
	}));
	const formal: Process[] = projects.filter(p => inRoot(p.path, PROJECT_ROOT)).map(p => ({
		id: p.id || `project:${p.path}`, name: p.name, processType: 'project', status: p.status, rawStatus: p.status,
		direction: p.direction, sourceFile: p.path, ...dates(p.startDate, p.dueDate), ...counts('project', p.path, tasks),
	}));
	return [...learning, ...formal];
}
export function processTypeLabel(type: ProcessType): string { return type === 'learning' ? '学习' : '项目'; }
export function taskProgressLabel(total: number, completed: number): string { return total ? `${completed} / ${total}` : '暂无任务'; }
export function filterProcesses(items: readonly Process[], type: ProcessType | 'all' = 'all', status: ProcessStatus | '全部' = '全部'): Process[] {
	return items.filter(p => (type === 'all' || p.processType === type) && (status === '全部' || p.status === status));
}
export function currentProcesses(items: readonly Process[]): Process[] {
	return items.filter(p => p.status === '进行中' || p.status === '计划中')
		.sort((a,b) => Number(a.status !== '进行中') - Number(b.status !== '进行中') || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.sourceFile.localeCompare(b.sourceFile, 'zh-CN')).slice(0, 3);
}
export function processBoardItems(items: readonly Process[]): ProcessBoardItem[] {
	return items.map(process => ({ process, key: process.sourceFile, path: process.sourceFile, name: process.name,
		status: process.status, direction: process.direction, description: '', color: '#7BA7FF',
		startDate: process.startDate || null, endDate: process.dueDate || null, createDate: null,
		taskCount: process.taskTotal, doneCount: process.taskCompleted, activeCount: process.taskPending, type: 'nostage', stage: -1 }));
}
/** Dates remain optional. Reversed ranges are retained in lists, omitted from timelines. */
export function hasProcessSchedule(item: Pick<ProjectInfo, 'startDate' | 'endDate'>): boolean {
	return !!(item.startDate || item.endDate) && !(item.startDate && item.endDate && item.startDate > item.endDate);
}
/** Existing Properties links; avoid inferring ownership from a shared direction or ambiguous title. */
export function learningProcessResources(topic: LearningNote, notes: LearningNote[]): LearningNote[] {
	if (notes.filter(n => n.kind === '学习主题' && n.name === topic.name).length !== 1) return [];
	return notes.filter(n => n.kind === '学习资源' && n.topics.includes(topic.name));
}
