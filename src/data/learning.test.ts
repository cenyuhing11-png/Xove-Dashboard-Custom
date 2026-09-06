import test from 'node:test';
import assert from 'node:assert/strict';
import { abilityNotes, currentLearning, currentTopics, ensureLearningNote, learningName, learningNote, learningTemplate, queuedResources, relationNames } from './learning.ts';
import type { LearningKind, LearningNote } from './learning.ts';
import type { PlanFiles } from './planning.ts';

function note(kind: LearningKind, properties: Record<string, unknown> = {}, name = '示例'): LearningNote {
	return learningNote(`${name}.md`, name, { 类型: kind, ...properties })!;
}
test('recognizes all three MetadataCache types', () => {
	for (const kind of ['能力', '学习主题', '学习资源'] as const) assert.equal(note(kind).kind, kind);
	assert.equal(learningNote('x.md', 'x', { 类型: '计划' }), null);
});
test('malformed or absent frontmatter is ignored safely', () => {
	for (const fm of [undefined, null, 'broken YAML', [], 42, { 类型: ['学习主题'] }]) assert.equal(learningNote('x.md', 'x', fm), null);
});
test('only active learning topics enter homepage', () => {
	const notes = [note('学习主题', { 状态: '学习中' }), note('学习主题', { 状态: '暂停' }), note('学习资源', { 状态: '学习中' })];
	assert.equal(currentTopics(notes).length, 1);
});
test('priority order and maximum three topics', () => {
	const notes = ['未知', '维护', '辅助', '主攻'].map((p) => note('学习主题', { 状态: '学习中', 优先级: p }, p));
	assert.deepEqual(currentTopics(notes).map((n) => n.priority), ['主攻', '辅助', '维护']);
	assert.equal(notes.length, 4);
});
test('equal priorities have deterministic ordering', () => {
	const a = note('学习主题', { 状态: '学习中', 优先级: '主攻' }, 'a');
	const b = note('学习主题', { 状态: '学习中', 优先级: '主攻' }, 'b');
	assert.deepEqual(currentTopics([b, a]).map((n) => n.name), ['a', 'b']);
});
test('multiple abilities support wikilinks, aliases and scalar values', () => {
	assert.deepEqual(note('学习主题', { 所属能力: ['[[3D 产品视觉]]', '[[能力/视觉#目标|视觉表达]]'] }).abilities, ['3D 产品视觉', '视觉表达']);
	assert.deepEqual(relationNames('[[英语]]'), ['英语']);
	assert.deepEqual(relationNames([null, {}, '']), []);
});
test('arbitrary ability stages are preserved, not converted to percentages', () => {
	const n = note('能力', { 阶段: '形成自己的方法', 领域: '自定义领域', 状态: '培养中' });
	assert.equal(n.stage, '形成自己的方法');
	assert.equal(n.domain, '自定义领域');
	assert.equal(abilityNotes([n, note('学习主题')]).length, 1);
});
test('queue only includes queued and pending-study resources', () => {
	const notes = ['排队中', '待学习', '待处理', '学习中', '已完成', '暂停', '淘汰'].map((状态) => note('学习资源', { 状态, 资源类型: '官方文档' }, 状态));
	assert.deepEqual(queuedResources(notes).map((n) => n.status).sort(), ['排队中', '待学习'].sort());
	assert.ok(queuedResources(notes).every((n) => n.resourceType === '官方文档'));
});
test('resource relations and type are data driven', () => {
	const n = note('学习资源', { 资源类型: '书籍', 关联主题: ['[[阅读]]', '[[研究]]'] });
	assert.equal(n.resourceType, '书籍');
	assert.deepEqual(n.topics, ['阅读', '研究']);
});
test('next step uses shared section reader and first nonempty item', async () => {
	const result = await currentLearning([note('学习主题', { 状态: '学习中' })], async () => '## 下一步\n-\n- [ ] **完成实践**\n- 第二项\n## 实践\n- 其它');
	assert.equal(result[0]?.next, '完成实践');
});
test('next step supports plain paragraphs', async () => {
	const result = await currentLearning([note('学习主题', { 状态: '学习中' })], async () => '## 下一步\n尝试一次输出\n');
	assert.equal(result[0]?.next, '尝试一次输出');
});
test('missing, empty and malformed next-step section are safe', async () => {
	for (const md of ['', '## 其它\n- 任务', '## 下一步\n- [ ]', '---\n未闭合\n## 下一步\n- 任务']) {
		assert.equal((await currentLearning([note('学习主题', { 状态: '学习中' })], async () => md))[0]?.next, '');
	}
});
test('read failures do not crash homepage', async () => {
	const result = await currentLearning([note('学习主题', { 状态: '学习中' })], async () => { throw new Error('iCloud unavailable'); });
	assert.equal(result[0]?.next, '');
});
test('empty vault returns empty lists without reading', async () => {
	assert.deepEqual(await currentLearning([], async () => { throw new Error('must not read'); }), []);
	assert.deepEqual(queuedResources([]), []);
	assert.deepEqual(abilityNotes([]), []);
});
test('invalid file names and traversal are rejected', () => {
	for (const name of ['', ' ', '../x', 'a/b', 'a\\b', 'a:b', 'a|b', 'a?', 'a*', 'a#b', '[x]', 'a\n---', '.hidden', 'CON', 'x'.repeat(101)]) assert.throws(() => learningName(name));
});
test('valid names are trimmed and optional extension normalized', () => {
	assert.equal(learningName('  【测试】产品建模.md  '), '【测试】产品建模');
});
function store() {
	const contents = new Map<string, string>();
	const folders = new Set<string>();
	const files: PlanFiles = {
		kind: (p) => contents.has(p) ? 'file' : folders.has(p) ? 'folder' : undefined,
		read: async (p) => contents.get(p) ?? '',
		createFolder: async (p) => { if (folders.has(p)) throw new Error('exists'); folders.add(p); },
		create: async (p, body) => { if (contents.has(p)) throw new Error('exists'); contents.set(p, body); },
	};
	return { contents, folders, files };
}
test('same-name note is opened without overwrite', async () => {
	const s = store();
	const path = '01-学习与资料/学习主题/示例.md';
	s.contents.set(path, '真实用户内容');
	assert.equal(await ensureLearningNote(s.files, '学习主题', '示例'), path);
	assert.equal(s.contents.get(path), '真实用户内容');
});
for (const kind of ['能力', '学习主题', '学习资源'] as const) test(`${kind} creation uses blank independent Markdown template`, async () => {
	const s = store();
	const path = await ensureLearningNote(s.files, kind, '【测试】示例');
	assert.equal(path, `01-学习与资料/${kind}/【测试】示例.md`);
	assert.equal(s.contents.get(path), learningTemplate(kind, '【测试】示例'));
	assert.ok(s.folders.has(`01-学习与资料/${kind}`));
});
test('concurrent creation never overwrites', async () => {
	const s = store();
	await Promise.all([ensureLearningNote(s.files, '能力', '示例'), ensureLearningNote(s.files, '能力', '示例')]);
	assert.equal(s.contents.size, 1);
});
test('path conflicts and permissions fail safely', async () => {
	const s = store();
	s.contents.set('01-学习与资料', '不要改动');
	await assert.rejects(ensureLearningNote(s.files, '能力', '示例'));
	assert.equal(s.contents.get('01-学习与资料'), '不要改动');
	const other = store();
	other.files.create = async () => { throw new Error('permission'); };
	await assert.rejects(ensureLearningNote(other.files, '能力', '示例'), /permission/);
});
