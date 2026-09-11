import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROJECT_ROOT } from './vaultPaths.ts';
import { PROJECT_ROOT as exportedRoot, createMengxuProject, projectNote, projectPath, projectTemplate, projectSummary, directionProjects } from './projects.ts';
import { embeddedSource, appendEmbeddedTask, parseEmbeddedTasks, setEmbeddedCompletion } from './embeddedTasks.ts';
import { processes, processBoardItems, currentProcesses, filterProcesses } from './processes.ts';
import { projectBoardItems, projectTimelineItems } from './projectBoardAdapter.ts';
import { LEARNING_ROOT, learningNote } from './learning.ts';
import { journalTemplate } from './journal.ts';
import type { PlanFiles } from './planning';

const id = '98d8124a-7bc2-4198-861c-efb50f19c5db';
const input = { name: '目录验证', status: '进行中' as const, direction: '设计', startDate: '2026-09-01', dueDate: '2026-09-30', goal: '最终成果保持原含义' };
const fm = { 类型: '项目', 项目ID: id, 状态: input.status, 方向: input.direction, 开始日期: input.startDate, 截止日期: input.dueDate };
const path = projectPath(input.name).path;
const content = appendEmbeddedTask(projectTemplate(input, id, '2026-09-06'), path, '目录迁移后的任务', '2026-09-06', 'stable-task-id');
const project = projectNote(path, fm)!;
const tasks = parseEmbeddedTasks(path, content);

test('Formal project root has one centralized outcomes value and compatible export', () => {
	assert.equal(PROJECT_ROOT, '03-项目与成果'); assert.equal(exportedRoot, PROJECT_ROOT);
	assert.equal(path, '03-项目与成果/目录验证/目录验证.md');
});
test('New project writes only into the renamed root using the same template', async () => {
	const dirs = new Set<string>(), notes = new Map<string, string>();
	const files: PlanFiles = { kind: p => dirs.has(p) ? 'folder' : notes.has(p) ? 'file' : undefined, read: async p => notes.get(p)!, createFolder: async p => { dirs.add(p); }, create: async (p, text) => { notes.set(p, text); } };
	assert.equal(await createMengxuProject(files, input, id, '2026-09-06'), path);
	assert.deepEqual([...dirs], [PROJECT_ROOT, `${PROJECT_ROOT}/${input.name}`]);
	assert.deepEqual([...notes.keys()], [path]); assert.equal(notes.get(path), projectTemplate(input, id, '2026-09-06'));
});
test('A migrated existing project is never adopted or overwritten by creation', async () => {
	const files: PlanFiles = { kind: p => p === path ? 'file' : p === `${PROJECT_ROOT}/${input.name}` ? 'folder' : undefined, read: async () => content, create: async () => assert.fail('overwrite'), createFolder: async () => assert.fail('new directory') };
	await assert.rejects(createMengxuProject(files, input, id, '2026-09-06'), /已存在/);
	assert.equal(projectNote(path, fm)!.id, id); assert.equal(await files.read(path), content);
});
test('Embedded project tasks retain stable IDs, dates and only checkbox changes after rename', () => {
	assert.equal(embeddedSource(path), 'project'); assert.equal(tasks[0]!.id, 'stable-task-id'); assert.equal(tasks[0]!.date, '2026-09-06');
	const changed = setEmbeddedCompletion(content, tasks[0]!, true, () => assert.fail('new ID'));
	assert.equal(changed, content.replace('- [ ] 目录迁移后的任务', '- [x] 目录迁移后的任务'));
	assert.equal(projectSummary(project, changed).done, 1); assert.ok(changed.includes(`项目ID: ${id}`));
});
test('Project and Process adapters retain directions, counts and timeline dates at the new root', () => {
	assert.equal(directionProjects([project], '设计').length, 1);
	const all = processes([], [project], tasks), board = processBoardItems(all);
	assert.equal(filterProcesses(all, 'creation').length, 1); assert.equal(currentProcesses(all)[0]!.sourceFile, path);
	assert.equal(board[0]!.taskCount, 1); assert.equal(board[0]!.activeCount, 1); assert.equal(board[0]!.direction, '设计');
	for (const items of [board, projectBoardItems([project], tasks)]) {
		const timeline = projectTimelineItems(items)[0]!;
		assert.equal(timeline.id, path); assert.equal(timeline.startDate, input.startDate); assert.equal(timeline.dueDate, input.dueDate); assert.equal(timeline.sourceFile, '');
	}
});
test('Learning process source remains unchanged and independent of the project rename', () => {
	assert.equal(LEARNING_ROOT, '01-学习与资料');
	const note = learningNote(`${LEARNING_ROOT}/示例.md`, '示例', { 类型: '学习主题', 状态: '学习中' })!;
	const all = processes([note], [project], tasks);
	assert.equal(filterProcesses(all, 'learning')[0]!.sourceFile, note.path); assert.equal(embeddedSource(note.path), 'learning');
});
test('Default setting, legacy fallback and task picker all reuse PROJECT_ROOT', () => {
	const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
	assert.ok(read('../settings.ts').includes('projectsFolder: PROJECT_ROOT'));
	assert.ok(read('../views/DashboardView.ts').includes('configuredRoot : PROJECT_ROOT'));
	assert.ok(read('../views/EmbeddedTaskModal.ts').includes('processes(scanLearning(this.app), scanProjects(this.app), [])'));
	assert.ok(read('./processes.ts').includes('projects.filter(p => inRoot(p.path, PROJECT_ROOT))'));
	assert.ok(read('./embeddedTasks.ts').includes('path.startsWith(`${PROJECT_ROOT}/`)'));
});
test('Only project category captions change; creation/outcomes and final outcome retain their meaning', () => {
	assert.match(journalTemplate('week'), /## 做成了什么/);
	assert.match(journalTemplate('month'), /## 本月做成了什么/);
	assert.ok(projectTemplate(input, id, '2026-09-06').includes('## 最终成果'));
	assert.ok(readFileSync(new URL('../components/workbench/WorkbenchHome.ts', import.meta.url), 'utf8').includes('✨ 创作与成果'));
});
