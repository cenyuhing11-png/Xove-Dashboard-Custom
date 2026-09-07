import { ensureLearningNote } from './learning.ts';
import type { PlanFiles } from './planning';
import { PROJECT_STATUSES, projectDirections } from './projects.ts';
import type { NewProject } from './projects';
import { validTaskDate } from './embeddedTasks.ts';
import { contentDefinition } from './processContentTypes.ts';
import type { LearningContentType } from './processContentTypes';

/** Creation-only input; learning and project Markdown models remain separate. */
export interface NewLearningProcess extends NewProject { ability?: string }
export async function createLearningProcess(files: PlanFiles, input: NewLearningProcess): Promise<string> {
	if (!PROJECT_STATUSES.includes(input.status)) throw new Error('学习状态无效');
	if (input.direction && !projectDirections().includes(input.direction)) throw new Error('请选择当前人生方向');
	for (const date of [input.startDate, input.dueDate]) if (date && !validTaskDate(date)) throw new Error('学习日期无效');
	if (input.startDate && input.dueDate && input.startDate > input.dueDate) throw new Error('截止日期不能早于开始日期');
	return ensureLearningNote(files, '学习主题', input.name, '其他资料', input);
}

/** New v2 learning content is one real resource note and one process, never a shadow topic. */
export async function createLearningContentProcess(files: PlanFiles, contentType: LearningContentType, input: NewLearningProcess): Promise<string> {
	const definition = contentDefinition(contentType);
	if (definition.category !== 'learning' || !definition.resourceType) throw new Error('学习内容类型无效');
	if (!PROJECT_STATUSES.includes(input.status)) throw new Error('学习状态无效');
	if (input.direction && !projectDirections().includes(input.direction)) throw new Error('请选择当前人生方向');
	for (const date of [input.startDate, input.dueDate]) if (date && !validTaskDate(date)) throw new Error('学习日期无效');
	if (input.startDate && input.dueDate && input.startDate > input.dueDate) throw new Error('截止日期不能早于开始日期');
	return ensureLearningNote(files, '学习资源', input.name, definition.resourceType, input);
}

/** Knowledge creation keeps its own Markdown type and creation-task section. */
export async function createKnowledgeProcess(files: PlanFiles, input: NewLearningProcess): Promise<string> {
	if (!PROJECT_STATUSES.includes(input.status)) throw new Error('创作状态无效');
	if (input.direction && !projectDirections().includes(input.direction)) throw new Error('请选择当前人生方向');
	for (const date of [input.startDate, input.dueDate]) if (date && !validTaskDate(date)) throw new Error('创作日期无效');
	if (input.startDate && input.dueDate && input.startDate > input.dueDate) throw new Error('截止日期不能早于开始日期');
	return ensureLearningNote(files, '知识与思考', input.name, '', input);
}
