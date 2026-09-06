import type { ProjectInfo, TaskItem } from '../../data/taskParser';
import { KNOWLEDGE_AREAS } from './config';
import { renderLifeCompass } from './LifeCompass';
import { renderPlanningCard } from './PlanningCard';
import type { PlanPeriod, PlanState } from '../../data/planning';
import { addEmpty, addEntry, createGroup, createSection } from './shared';

export interface WorkbenchHomeData {
	todayTasks: TaskItem[];
	upcomingTasks: TaskItem[];
	projects: ProjectInfo[];
	existingPaths: Set<string>;
	plans: PlanState[];
	onOpenPlan(period: PlanPeriod): void;
	onOpenTask(task: TaskItem): void;
	onOpenProjects(): void;
	onOpenProject(project: ProjectInfo): void;
	onOpenProjectView(view: 'calendar' | 'gantt'): void;
	onOpenPath(path: string): void;
}

function renderTaskEntries(parent: HTMLElement, tasks: TaskItem[], emptyText: string, data: WorkbenchHomeData): void {
	if (!tasks.length) return addEmpty(parent, emptyText);
	for (const task of tasks.slice(0, 3)) {
		addEntry(parent, task.content, task.dueDate ? `截止 ${task.dueDate}` : task.projectId, () => data.onOpenTask(task));
	}
}

function renderToday(parent: HTMLElement, data: WorkbenchHomeData): void {
	const body = createSection(parent, '🎯 今日执行');
	addEmpty(createGroup(body, '今日最重要的 3 件事'), '尚未建立独立的重点事项模型');
	renderTaskEntries(createGroup(body, '今日任务'), data.todayTasks, '今日暂无任务', data);
	renderTaskEntries(createGroup(body, '即将截止'), data.upcomingTasks, '近期暂无截止任务', data);
}

function renderLearning(parent: HTMLElement): void {
	const body = createSection(parent, '📚 当前学习');
	addEmpty(createGroup(body, '当前主题'), '暂无当前学习主题');
	addEmpty(createGroup(body, '当前资源'), '暂无当前学习资源');
	addEmpty(createGroup(body, '下一步'), '尚未设置学习下一步');
	const links = body.createDiv({ cls: 'wb-inline-links' });
	addEntry(links, '学习队列', '后续接入');
	addEntry(links, '能力地图', '后续接入');
}

function renderProjects(parent: HTMLElement, data: WorkbenchHomeData): void {
	const body = createSection(parent, '📅 项目与日程');
	if (data.projects.length) addEntry(body, '当前项目', `${data.projects.length} 个`, data.onOpenProjects);
	else addEmpty(body, '暂无当前项目');
	addEntry(body, '月历', '查看现有项目月历', () => data.onOpenProjectView('calendar'));
	addEntry(body, '甘特图', '查看现有项目甘特图', () => data.onOpenProjectView('gantt'));
	if (data.upcomingTasks.length) addEntry(body, '即将截止', `${data.upcomingTasks.length} 项`, data.onOpenProjects);
	else addEmpty(body, '近期暂无截止任务');
}

function renderKnowledge(parent: HTMLElement, data: WorkbenchHomeData): void {
	const body = createSection(parent, '📥 知识库');
	for (const area of KNOWLEDGE_AREAS) {
		const exists = data.existingPaths.has(area.path);
		addEntry(body, area.label, exists ? area.path : '目录尚未建立', exists ? () => data.onOpenPath(area.path) : undefined);
	}
	addEntry(body, '标签导航', '后续接入');
}

function renderContent(parent: HTMLElement, data: WorkbenchHomeData): void {
	const body = createSection(parent, '✨ 作品与内容');
	const projects = createGroup(body, '最近项目');
	if (!data.projects.length) addEmpty(projects, '暂无项目数据');
	for (const project of data.projects.slice(0, 3)) {
		addEntry(projects, project.name, project.description || `${project.activeCount} 项进行中`, () => data.onOpenProject(project));
	}
	addEmpty(createGroup(body, '最近作品'), '暂无作品数据');
	addEmpty(createGroup(body, '自媒体待发布'), '暂无待发布内容');
}

function renderReviews(parent: HTMLElement): void {
	const diary = createSection(parent, '📓 日记 / 周记', true);
	addEmpty(createGroup(diary, '今日日记'), '尚未检测到今日日记');
	addEmpty(createGroup(diary, '本周周记'), '尚未建立周记入口');
	addEntry(diary, '最近记录', '后续接入');

	const review = createSection(parent, '🔄 月度 / 年度复盘', true);
	addEmpty(createGroup(review, '本月复盘'), '尚未建立本月复盘');
	addEmpty(createGroup(review, '年度复盘'), '尚未建立年度复盘');
	addEntry(review, '查看复盘', '后续接入');
}

export function renderWorkbenchHome(parent: HTMLElement, data: WorkbenchHomeData): void {
	parent.empty();
	parent.addClass('wb-home');
	renderLifeCompass(parent);
	const execution = parent.createDiv({ cls: 'wb-grid' });
	renderToday(execution, data);
	renderPlanningCard(execution, data.plans, data.onOpenPlan);
	const growth = parent.createDiv({ cls: 'wb-grid' });
	renderLearning(growth);
	renderProjects(growth, data);
	const knowledge = parent.createDiv({ cls: 'wb-grid' });
	renderKnowledge(knowledge, data);
	renderContent(knowledge, data);
	const reviews = parent.createDiv({ cls: 'wb-grid wb-grid--short' });
	renderReviews(reviews);
}
