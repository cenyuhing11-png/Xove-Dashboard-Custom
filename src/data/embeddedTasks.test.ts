import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendEmbeddedTask, DAILY_TASK_FILE, DAILY_TASK_TEMPLATE, embeddedSource, EmbeddedTaskIndex, groupEmbedded, groupEmbeddedForDisplay, overdueEmbedded, parseEmbeddedTasks, setEmbeddedCompletion, TASK_DISPLAY_CATEGORIES, TASK_DISPLAY_LABELS, taskDisplayCategory, todayEmbedded, validTaskDate } from './embeddedTasks.ts';
import { learningTemplate } from './learning.ts';

const learning = '01-学习与资料/书籍/书.md';
const project = '03-项目与成果/视觉/project-视觉.md';
const content = '## 学习任务\n\n- [ ] 看书 📅 2026-09-07\n';
function first(raw = content, path = learning) { return parseEmbeddedTasks(path, raw)[0]!; }
for (const [path, heading, type] of [[learning, '学习任务', 'learning'], [project, '项目任务', 'project'], [DAILY_TASK_FILE, '日常待办', 'daily']]) {
	test(`${type}: only target section parsed`, () => {
		const tasks = parseEmbeddedTasks(path!, `# 页面\n- [ ] 外部\n## ${heading}\n- [ ] 正确\n## 其他\n- [ ] 不识别\n`);
		assert.equal(tasks.length, 1); assert.equal(tasks[0]!.text, '正确'); assert.equal(tasks[0]!.sourceType, type);
	});
	test(`${type}: append correct section without overwriting`, () => {
		const original = '# 用户正文\n\n保持原样\n';
		const result = appendEmbeddedTask(original, path!, '测试', undefined, 'id-1');
		assert.ok(result.startsWith(original)); assert.equal(first(result, path).text, '测试'); assert.ok(result.includes(`## ${heading}`));
	});
}
test('non-target folders and plan checklists excluded', () => {
	for (const path of ['05-计划/05-周计划/周.md', '02-知识与思考/知识.md', '01-学习与资料假/笔记.md', '06-任务/a.md', '01-学习与资料/../秘密.md']) assert.deepEqual(parseEmbeddedTasks(path, content), []);
});
test('ability checklist and course outline excluded', () => { assert.deepEqual(parseEmbeddedTasks(learning, '## 能力标准\n- [ ] 不要\n## 课程目录\n- [ ] 不要'), []); });
test('recurring daily section excluded', () => { assert.deepEqual(parseEmbeddedTasks(DAILY_TASK_FILE, '## 定期事项\n- [ ] 不要'), []); });
test('YAML and fenced code ignored', () => {
	assert.equal(parseEmbeddedTasks(learning, '---\ntext: |\n  ## 学习任务\n  - [ ] 假\n---\n```md\n## 学习任务\n- [ ] 假\n```\n' + content + '~~~md\n- [ ] 假\n~~~').length, 1);
});
test('HTML comments, quoted and indented examples ignored', () => { assert.equal(parseEmbeddedTasks(learning, content + '<!--\n- [ ] 假\n-->\n> - [ ] 假\n    - [ ] 假\n').length, 1); });
test('empty checkbox placeholders ignored', () => { assert.deepEqual(parseEmbeddedTasks(DAILY_TASK_FILE, DAILY_TASK_TEMPLATE), []); });
test('checkbox uppercase/lowercase state parsed', () => { const tasks = parseEmbeddedTasks(learning, '## 学习任务\n- [x] a\n- [X] b\n- [ ] c'); assert.deepEqual(tasks.map(t => t.completed), [true, true, false]); });
test('date parsed and removed from text', () => { assert.equal(first().date, '2026-09-07'); assert.equal(first().text, '看书'); });
test('no date remains optional', () => { assert.equal(first('## 学习任务\n- [ ] 没日期').date, undefined); });
test('invalid calendar dates are not scheduled', () => { assert.equal(validTaskDate('2026-02-30'), false); assert.equal(first('## 学习任务\n- [ ] 假日 📅 2026-02-30').date, undefined); assert.equal(validTaskDate('2028-02-29'), true); });
test('stable ID hidden and survives inserted lines', () => { const raw = content.trimEnd() + ' <!-- mx-task:abc-123 -->\n'; assert.equal(first(raw).id, 'abc-123'); assert.equal(first('\n' + raw).id, 'abc-123'); assert.equal(first(raw).text, '看书'); });
test('handwritten task read without mutation', () => { const task = first(); assert.equal(task.locator.persistent, false); assert.equal(task.locator.snapshot, content); });
test('first completion adds stable ID only to selected line', () => { const raw = content + '- [ ] 其他\n'; const result = setEmbeddedCompletion(raw, first(raw), true, () => 'new-id'); assert.ok(result.includes('- [x] 看书 📅 2026-09-07 <!-- mx-task:new-id -->')); assert.ok(result.endsWith('- [ ] 其他\n')); });
test('stable completion can be undone', () => { const raw = setEmbeddedCompletion(content, first(), true, () => 'stable'); const result = setEmbeddedCompletion(raw, first(raw), false, () => { throw new Error('must not regenerate'); }); assert.equal(first(result).completed, false); assert.equal(first(result).id, 'stable'); });
test('stale line numbers never determine persistent writes', () => { const raw = appendEmbeddedTask('', learning, 'a', undefined, 'stable'); const task = first(raw); const changed = '# New header\n' + raw; const result = setEmbeddedCompletion(changed, task, true, () => 'unused'); assert.equal(first(result).completed, true); });
test('unique handwritten line relocated safely', () => { const result = setEmbeddedCompletion('# 标题\n' + content, first(), true, () => 'stable'); assert.equal(first(result).completed, true); });
test('concurrent edited text refuses stale handwritten write', () => { assert.throws(() => setEmbeddedCompletion(content.replace('看书', '写作'), first(), true, () => 'id'), /变化/); });
test('same-name tasks distinguished on unchanged snapshot', () => { const raw = '## 学习任务\n- [ ] 相同\n- [ ] 相同\n'; const tasks = parseEmbeddedTasks(learning, raw); const result = setEmbeddedCompletion(raw, tasks[1]!, true, () => 'second'); assert.deepEqual(parseEmbeddedTasks(learning, result).map(t => t.completed), [false, true]); });
test('stale same-name handwritten tasks fail closed', () => { const raw = '## 学习任务\n- [ ] 相同\n- [ ] 相同\n'; assert.throws(() => setEmbeddedCompletion('# 变化\n' + raw, first(raw), true, () => 'id')); });
test('duplicate persistent ID rejected', () => { const raw = '## 学习任务\n- [ ] a <!-- mx-task:dup -->\n- [ ] b <!-- mx-task:dup -->'; assert.throws(() => setEmbeddedCompletion(raw, first(raw), true, () => 'id'), /重复/); });
test('multiple IDs on one line rejected', () => { const raw = '## 学习任务\n- [ ] a <!-- mx-task:one --> <!-- mx-task:two -->'; assert.throws(() => setEmbeddedCompletion(raw, first(raw), true, () => 'id'), /重复/); });
test('existing section not duplicated and next section untouched', () => { const raw = content + '\n## 备注\n用户内容'; const result = appendEmbeddedTask(raw, learning, '新增', undefined, 'id'); assert.equal((result.match(/## 学习任务/g) ?? []).length, 1); assert.ok(result.endsWith('## 备注\n用户内容')); assert.equal(parseEmbeddedTasks(learning, result).length, 2); });
test('CRLF writes preserve line endings', () => { const raw = content.replace(/\n/g, '\r\n'); const result = setEmbeddedCompletion(raw, first(raw), true, () => 'id'); assert.equal(result.replace(/\r\n/g, '').includes('\n'), false); const added = appendEmbeddedTask(result, learning, 'b', undefined, 'two'); assert.equal(added.replace(/\r\n/g, '').includes('\n'), false); });
test('ambiguous duplicate headings refuse append', () => { assert.throws(() => appendEmbeddedTask(content + content, learning, 'a', undefined, 'id'), /多个/); });
test('unclosed fenced code prevents hidden append', () => { assert.throws(() => appendEmbeddedTask(content + '```', learning, 'a', undefined, 'id'), /未闭合/); });
test('invalid task creation cannot inject lines or markers', () => { for (const text of ['', 'a\nb', 'a <!-- mx-task:fake -->', 'a 📅 2026-09-06']) assert.throws(() => appendEmbeddedTask('', learning, text, undefined, 'id')); });
test('today includes matching and overdue only, excludes completed/undated/future', () => { const raw = '## 学习任务\n- [ ] 今天 📅 2026-09-06\n- [ ] 过去 📅 2026-09-05\n- [x] 完成 📅 2026-09-06\n- [ ] 未来 📅 2026-09-07\n- [ ] 无日期'; const tasks = parseEmbeddedTasks(learning, raw); assert.deepEqual(todayEmbedded(tasks, '2026-09-06').map(t => t.text), ['过去', '今天']); assert.deepEqual(overdueEmbedded(tasks, '2026-09-06').map(t => t.text), ['过去']); });
test('all tasks grouped without loss', () => { const tasks = [first(), first('## 项目任务\n- [x] 完成', project), first('## 日常待办\n- [ ] 日常', DAILY_TASK_FILE)]; const groups = groupEmbedded(tasks); assert.deepEqual(Object.keys(groups), ['project', 'creation', 'learning', 'daily']); assert.equal(Object.values(groups).flat().length, 3); });
test('summary display categories are exactly learning, creation and daily', () => {
	assert.deepEqual(TASK_DISPLAY_CATEGORIES, ['learning', 'creation', 'daily']);
	assert.deepEqual(TASK_DISPLAY_LABELS, { learning: '学习任务', creation: '创作任务', daily: '日常任务' });
});
test('summary mapping keeps learning and daily while merging knowledge and projects into creation', () => {
	assert.equal(taskDisplayCategory('learning'), 'learning');
	assert.equal(taskDisplayCategory('creation'), 'creation');
	assert.equal(taskDisplayCategory('project'), 'creation');
	assert.equal(taskDisplayCategory('daily'), 'daily');
});
test('summary grouping merges knowledge and project tasks without changing total count', () => {
	const knowledge = '02-知识与思考/AI 与设计.md';
	const tasks = [
		first('## 学习任务\n- [ ] 学习', learning),
		first('## 创作任务\n- [ ] 思考', knowledge),
		first('## 项目任务\n- [ ] 项目', project),
		first('## 日常待办\n- [ ] 日常', DAILY_TASK_FILE),
	];
	const groups = groupEmbeddedForDisplay(tasks);
	assert.deepEqual(Object.keys(groups), ['learning', 'creation', 'daily']);
	assert.equal(groups.learning.length, 1);
	assert.deepEqual(groups.creation.map(task => task.sourceType), ['creation', 'project']);
	assert.equal(groups.daily.length, 1);
	assert.equal(Object.values(groups).flat().length, tasks.length);
});
function memory() {
	const files = new Map<string, string>(); let id = 0;
	const index = new EmbeddedTaskIndex({ paths: () => [...files.keys()], read: async p => { if (!files.has(p)) throw new Error('missing'); return files.get(p)!; }, process: async (p, fn) => { if (!files.has(p)) throw new Error('missing'); files.set(p, fn(files.get(p)!)); }, ensureDaily: async () => { if (!files.has(DAILY_TASK_FILE)) files.set(DAILY_TASK_FILE, DAILY_TASK_TEMPLATE); } }, () => `test-${++id}`);
	return { files, index };
}
test('empty vault scan never creates daily file', async () => { const { files, index } = memory(); await index.refresh(); assert.deepEqual(index.all(), []); assert.equal(files.size, 0); });
test('first daily task lazily creates template', async () => { const { files, index } = memory(); await index.add(DAILY_TASK_FILE, '交电费', '2026-09-06'); assert.equal(files.size, 1); assert.equal(index.all()[0]!.text, '交电费'); assert.ok(files.get(DAILY_TASK_FILE)!.includes('## 定期事项')); });
test('existing daily content not overwritten', async () => { const { files, index } = memory(); files.set(DAILY_TASK_FILE, '# 保留正文\n'); await index.add(DAILY_TASK_FILE, 'a'); assert.ok(files.get(DAILY_TASK_FILE)!.startsWith('# 保留正文\n')); });
test('invalid creation never creates daily file', async () => { const { files, index } = memory(); await assert.rejects(index.add(DAILY_TASK_FILE, '')); assert.equal(files.size, 0); });
test('deleted source is purged and stale completion rejected', async () => { const { files, index } = memory(); files.set(learning, content); await index.refresh(); const task = index.all()[0]!; files.delete(learning); await index.refresh(); assert.equal(index.all().length, 0); await assert.rejects(index.complete(task, true)); });
test('renamed source reindexed with same persistent ID', async () => { const { files, index } = memory(); const raw = appendEmbeddedTask('', learning, 'a', undefined, 'keep'); files.set(learning, raw); await index.refresh(); files.delete(learning); files.set('01-学习与资料/新名字.md', raw); await index.refresh(); assert.equal(index.all()[0]!.id, 'keep'); assert.equal(index.bySource(learning).length, 0); });
test('cross-file duplicate IDs rejected before write', async () => { const { files, index } = memory(); const raw = appendEmbeddedTask('', learning, 'a', undefined, 'same'); files.set(learning, raw); files.set('01-学习与资料/另一本.md', raw); await index.refresh(); await assert.rejects(index.complete(index.all()[0]!, true), /重复/); });
test('index source/today/overdue queries refresh after completion', async () => { const { files, index } = memory(); files.set(learning, content); await index.refresh(); assert.equal(index.bySource(learning).length, 1); assert.equal(index.today('2026-09-07').length, 1); assert.equal(index.overdue('2026-09-08').length, 1); await index.complete(index.all()[0]!, true); assert.equal(index.today('2026-09-07').length, 0); });
test('parallel adds keep both tasks', async () => { const { index } = memory(); await Promise.all([index.add(DAILY_TASK_FILE, 'one'), index.add(DAILY_TASK_FILE, 'two')]); assert.equal(index.all().length, 2); assert.equal(new Set(index.all().map(t => t.id)).size, 2); });
test('resource templates add empty task section without generated tasks', () => { const raw = learningTemplate('学习资源', '资料', '书籍'); assert.ok(raw.includes('## 学习任务')); assert.equal(parseEmbeddedTasks(learning, raw).length, 0); });
test('legacy scanner has no embedded dependency', () => { const source = readFileSync(new URL('./taskStore.ts', import.meta.url), 'utf8'); assert.equal(source.includes('embedded'), false); assert.ok(source.includes('scanAllWithTasks')); });
test('toolbar routes to embedded modal while legacy modal remains', () => { const source = readFileSync(new URL('../views/DashboardView.ts', import.meta.url), 'utf8'); assert.ok(source.includes("if (action === 'task') new NewEmbeddedTaskModal")); assert.ok(source.includes('private async openTaskModal(')); });
test('calendar and gantt remain TaskItem driven', () => { const source = readFileSync(new URL('../views/ProjectBoard.ts', import.meta.url), 'utf8'); assert.ok(source.includes('this.renderGanttPanel(panel, tasks, this.currentProjects)')); assert.ok(source.includes('this.renderCalendarPanel(panel, tasks, this.currentProjects)')); });
