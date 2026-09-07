import { KNOWLEDGE_ROOT, LEARNING_FOLDERS, LEARNING_ROOT, PROJECT_ROOT } from './vaultPaths.ts';

export { KNOWLEDGE_ROOT } from './vaultPaths.ts';
export const PROCESS_CATEGORIES = ['learning', 'creation'] as const;
export type ProcessCategory = typeof PROCESS_CATEGORIES[number];
export const LEARNING_CONTENT_TYPES = ['course', 'movie', 'book', 'video', 'article'] as const;
export const CREATION_CONTENT_TYPES = ['knowledge', 'project'] as const;
export type LearningContentType = typeof LEARNING_CONTENT_TYPES[number];
export type CreationContentType = typeof CREATION_CONTENT_TYPES[number];
export type ProcessContentType = LearningContentType | CreationContentType;
export type CompatibleProcessContentType = ProcessContentType | 'legacy-topic' | 'legacy-resource';

export interface ProcessContentDefinition {
	type: ProcessContentType;
	category: ProcessCategory;
	label: string;
	compactLabel: string;
	folder: string;
	markdownType: '学习资源' | '知识与思考' | '项目';
	resourceType?: string;
}

export const PROCESS_CONTENT_DEFINITIONS: readonly ProcessContentDefinition[] = [
	{ type: 'course', category: 'learning', label: '课程', compactLabel: '课程', folder: `${LEARNING_ROOT}/${LEARNING_FOLDERS.course}`, markdownType: '学习资源', resourceType: '课程' },
	{ type: 'movie', category: 'learning', label: '电影', compactLabel: '电影', folder: `${LEARNING_ROOT}/${LEARNING_FOLDERS.film}`, markdownType: '学习资源', resourceType: '电影' },
	{ type: 'book', category: 'learning', label: '书籍', compactLabel: '书籍', folder: `${LEARNING_ROOT}/${LEARNING_FOLDERS.book}`, markdownType: '学习资源', resourceType: '书籍' },
	{ type: 'video', category: 'learning', label: '视频', compactLabel: '视频', folder: `${LEARNING_ROOT}/${LEARNING_FOLDERS.video}`, markdownType: '学习资源', resourceType: '视频' },
	{ type: 'article', category: 'learning', label: '文章', compactLabel: '文章', folder: `${LEARNING_ROOT}/${LEARNING_FOLDERS.article}`, markdownType: '学习资源', resourceType: '文章' },
	{ type: 'knowledge', category: 'creation', label: '知识与思考', compactLabel: '知识', folder: KNOWLEDGE_ROOT, markdownType: '知识与思考' },
	{ type: 'project', category: 'creation', label: '项目与成果', compactLabel: '项目', folder: PROJECT_ROOT, markdownType: '项目' },
] as const;

export function processCategoryLabel(category: ProcessCategory): string { return category === 'learning' ? '学习' : '创作'; }
export function contentDefinition(type: ProcessContentType): ProcessContentDefinition {
	const found = PROCESS_CONTENT_DEFINITIONS.find(item => item.type === type);
	if (!found) throw new Error('进程内容类型无效');
	return found;
}
export function processContentTypeLabel(type: CompatibleProcessContentType, compact = false): string {
	if (type === 'legacy-topic') return '学习主题';
	if (type === 'legacy-resource') return '学习资料';
	const definition = contentDefinition(type);
	return compact ? definition.compactLabel : definition.label;
}
export function processContentTypes(category: ProcessCategory): readonly ProcessContentType[] {
	return category === 'learning' ? LEARNING_CONTENT_TYPES : CREATION_CONTENT_TYPES;
}
export function learningContentType(resourceType: string): LearningContentType | undefined {
	const normalized = resourceType === '网页' ? '文章' : resourceType;
	return PROCESS_CONTENT_DEFINITIONS.find(item => item.category === 'learning' && item.resourceType === normalized)?.type as LearningContentType | undefined;
}
