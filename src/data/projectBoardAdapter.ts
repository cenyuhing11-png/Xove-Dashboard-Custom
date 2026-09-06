import type { MengxuProject, ProjectStatus } from './projects';
import type { EmbeddedTask } from './embeddedTasks';
import type { ProjectInfo, TaskItem } from './taskParseCore';

/** Presentation only: never persisted and never passed to the legacy TaskStore. */
export interface ProjectBoardItem extends ProjectInfo {
	key: string;
	project: MengxuProject;
	status: ProjectStatus;
	direction: string;
}
export function projectBoardItems(projects: MengxuProject[], tasks: readonly EmbeddedTask[]): ProjectBoardItem[] {
	return projects.map(project => {
		const related = tasks.filter(task => task.sourceType === 'project' && task.sourceFile === project.path);
		const done = related.filter(task => task.completed).length;
		return { key: project.path, project, status: project.status, direction: project.direction,
			name: project.name, path: project.path, description: project.goal, color: '#7BA7FF',
			startDate: project.startDate || null, endDate: project.dueDate || null, createDate: project.createdDate || null,
			taskCount: related.length, doneCount: done, activeCount: related.length - done,
			// NPDP phase is not project status. Do not infer or write a phase.
			type: 'nostage', stage: -1 };
	});
}
export function filterBoardItems<T extends Pick<ProjectBoardItem, 'status' | 'key'>>(items: T[], status: ProjectStatus | '全部', selected: string | null = null): T[] {
	return items.filter(item => (status === '全部' || item.status === status) && (!selected || item.key === selected));
}
/** Read-only schedule projection for the original Gantt/calendar geometry.
 * `status` only drives their completion shading; visible labels use item.status.
 * Empty sourceFile prevents legacy file mutations as an additional safeguard.
 * Embedded Task dates are deliberately not projected as project schedules.
 */
export function projectTimelineItems(items: Array<Omit<ProjectBoardItem, 'project'>>): TaskItem[] {
	return items.map(item => ({ id: item.key, content: item.name, projectId: item.name, color: item.color,
		status: item.status === '已完成' ? '已完成' : '待办', priority: null,
		startDate: item.startDate, dueDate: item.endDate, tags: [], type: '普通', repeatRule: null,
		reminder: [], notes: item.description, completeTime: null, dailyNodes: {}, sourceFile: '',
		isOverdue: false, remindDate: null, parent: '' }));
}
