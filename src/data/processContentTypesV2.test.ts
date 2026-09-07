import test from 'node:test';
import assert from 'node:assert/strict';
import { appendEmbeddedTask, parseEmbeddedTasks } from './embeddedTasks.ts';
import { currentTopics, learningNote } from './learning.ts';
import { createKnowledgeProcess, createLearningContentProcess } from './processCreation.ts';
import { contentDefinition, processCategoryLabel, processContentTypeLabel, processContentTypes } from './processContentTypes.ts';
import type { LearningContentType } from './processContentTypes.ts';
import { directionProcessCounts } from './processNavigation.ts';
import { processes } from './processes.ts';
import { projectNote, projectTemplate } from './projects.ts';
import type { PlanFiles } from './planning.ts';

function memory() {
	const files = new Map<string, string>();
	const folders = new Set<string>();
	const adapter: PlanFiles = {
		kind: path => files.has(path) ? 'file' : folders.has(path) ? 'folder' : undefined,
		read: async path => files.get(path) ?? '',
		createFolder: async path => { if (files.has(path)) throw new Error('file'); folders.add(path); },
		create: async (path, content) => { if (files.has(path)) throw new Error('exists'); files.set(path, content); },
	};
	return { files, folders, adapter };
}

test('UI process categories are centrally mapped to 学习 and 创作', () => {
	assert.equal(processCategoryLabel('learning'), '学习'); assert.equal(processCategoryLabel('creation'), '创作');
});
test('Learning exposes exactly five centralized content types', () => {
	assert.deepEqual(processContentTypes('learning'), ['course', 'movie', 'book', 'video', 'article']);
});
test('Creation exposes exactly knowledge and project', () => {
	assert.deepEqual(processContentTypes('creation'), ['knowledge', 'project']);
});

const learningCases = [
	['course', '课程', '01-学习与资料/课程'],
	['movie', '电影', '01-学习与资料/电影'],
	['book', '书籍', '01-学习与资料/书籍'],
	['video', '视频', '01-学习与资料/视频'],
	['article', '文章', '01-学习与资料/文章'],
] as const;
for (const [type, label, folder] of learningCases) {
	test(`${label} centralized mapping preserves its real folder and Markdown type`, () => {
		const definition = contentDefinition(type);
		assert.equal(definition.category, 'learning'); assert.equal(definition.folder, folder);
		assert.equal(definition.markdownType, '学习资源'); assert.equal(definition.resourceType, label);
	});
	test(`New ${label} process creates one direct learning resource note`, async () => {
		const m = memory(); const path = await createLearningContentProcess(m.adapter, type, { name: `测试${label}`, status: '进行中', direction: '设计', ability: '长期能力', goal: '学习目标' });
		assert.equal(path, `${folder}/测试${label}.md`); const raw = m.files.get(path)!;
		assert.ok(raw.includes('类型: 学习资源')); assert.ok(raw.includes(`资源类型: "${label}"`));
		assert.ok(raw.includes('所属能力: ["长期能力"]')); assert.ok(raw.includes('## 学习任务'));
		assert.equal(raw.includes('类型: 学习\n'), false); assert.equal(raw.includes('类型: 创作\n'), false);
	});
}

test('Knowledge mapping keeps 02 root and its real Markdown identity', () => {
	const definition = contentDefinition('knowledge');
	assert.equal(definition.folder, '02-知识与思考'); assert.equal(definition.markdownType, '知识与思考'); assert.equal(processContentTypeLabel('knowledge'), '知识与思考');
});
test('Project mapping keeps outcomes root and its real Markdown identity', () => {
	const definition = contentDefinition('project');
	assert.equal(definition.folder, '03-项目与成果'); assert.equal(definition.markdownType, '项目'); assert.equal(processContentTypeLabel('project'), '项目与成果');
});
test('New knowledge process creates its own type and creation task section without ability', async () => {
	const m = memory(); const path = await createKnowledgeProcess(m.adapter, { name: '测试思考', status: '计划中', direction: 'AI', ability: '不得写入', goal: '形成观点' });
	assert.equal(path, '02-知识与思考/测试思考.md'); const raw = m.files.get(path)!;
	assert.ok(raw.includes('类型: 知识与思考')); assert.ok(raw.includes('## 创作任务')); assert.ok(raw.includes('## 目标\n\n形成观点'));
	assert.equal(raw.includes('所属能力'), false); assert.equal(raw.includes('不得写入'), false); assert.equal(raw.includes('类型: 创作\n'), false);
});
test('Project template remains UUID project Markdown with project tasks', () => {
	const raw = projectTemplate({ name: '测试项目', status: '计划中' }, '98d8124a-7bc2-4198-861c-efb50f19c5db', '2026-09-07');
	assert.ok(raw.includes('类型: 项目')); assert.ok(raw.includes('项目ID: 98d8124a-7bc2-4198-861c-efb50f19c5db')); assert.ok(raw.includes('## 项目任务')); assert.equal(raw.includes('类型: 创作\n'), false);
});

test('Legacy learning theme remains a managed learning process', () => {
	const note = learningNote('01-学习与资料/旧主题.md', '旧主题', { 类型: '学习主题', 状态: '学习中' })!;
	const process = processes([note], [], [])[0]!; assert.equal(process.category, 'learning'); assert.equal(process.contentType, 'legacy-topic');
});
test('Ordinary migrated learning resource without status or task heading stays out', () => {
	const note = learningNote('01-学习与资料/书籍/旧书.md', '旧书', { 类型: '学习资源', 资源类型: '书籍' })!;
	assert.deepEqual(processes([note], [], []), []);
});
test('Learning resource with canonical process status is included', () => {
	const note = learningNote('01-学习与资料/书籍/书.md', '书', { 类型: '学习资源', 资源类型: '书籍', 状态: '进行中' })!;
	assert.equal(processes([note], [], [])[0]!.contentType, 'book');
});
test('Learning resource with learning-task heading is included without status', () => {
	const note = learningNote('01-学习与资料/文章/文.md', '文', { 类型: '学习资源', 资源类型: '文章' }, ['学习任务'])!;
	assert.equal(processes([note], [], [])[0]!.contentType, 'article');
});
test('Ordinary knowledge note without status or creation-task heading stays out', () => {
	const note = learningNote('02-知识与思考/旧想法.md', '旧想法', { 类型: '知识与思考' })!;
	assert.deepEqual(processes([note], [], []), []);
});
test('Knowledge note with creation-task heading enters creation processes', () => {
	const note = learningNote('02-知识与思考/想法.md', '想法', { 类型: '知识与思考' }, ['创作任务'])!;
	const process = processes([note], [], [])[0]!; assert.equal(process.category, 'creation'); assert.equal(process.contentType, 'knowledge');
});
test('Ordinary checkbox in knowledge body is never a creation task', () => {
	assert.deepEqual(parseEmbeddedTasks('02-知识与思考/想法.md', '## 思考\n- [ ] 普通清单'), []);
});
test('Checkbox below 创作任务 is parsed as a creation task', () => {
	const task = parseEmbeddedTasks('02-知识与思考/想法.md', '## 创作任务\n- [ ] 写文章')[0]!;
	assert.equal(task.sourceType, 'creation'); assert.equal(task.sourceHeading, '创作任务');
});
for (const [path, heading] of [
	['01-学习与资料/书籍/书.md', '学习任务'],
	['02-知识与思考/想法.md', '创作任务'],
	['03-项目与成果/项目/项目.md', '项目任务'],
] as const) test(`Task append selects ${heading} from the source kind`, () => {
	const raw = appendEmbeddedTask('', path, '下一步行动', undefined, 'stable-id');
	assert.ok(raw.includes(`## ${heading}`)); assert.equal(parseEmbeddedTasks(path, raw)[0]!.sourceHeading, heading);
});
test('Direction totals count learning and both creation subtypes as 学X · 创Y', () => {
	const learning = learningNote('01-学习与资料/课程/课.md', '课', { 类型: '学习资源', 资源类型: '课程', 状态: '进行中', 方向: '设计' })!;
	const knowledge = learningNote('02-知识与思考/思考.md', '思考', { 类型: '知识与思考', 状态: '计划中', 方向: '设计' })!;
	const project = projectNote('03-项目与成果/项目/项目.md', { 类型: '项目', 项目ID: '98d8124a-7bc2-4198-861c-efb50f19c5db', 状态: '进行中', 方向: '设计' })!;
	assert.equal(directionProcessCounts(processes([learning, knowledge], [project], []), '设计').label, '学1 · 创2');
});
test('Current learning includes an active direct learning resource', () => {
	const resource = learningNote('01-学习与资料/电影/电影.md', '电影', { 类型: '学习资源', 资源类型: '电影', 状态: '进行中' })!;
	assert.deepEqual(currentTopics([resource]).map(note => note.name), ['电影']);
});
