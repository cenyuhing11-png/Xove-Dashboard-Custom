import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../components/workbench/WorkbenchHome.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../views/DashboardView.ts', import.meta.url), 'utf8');
const list = readFileSync(new URL('../views/EmbeddedTaskModal.ts', import.meta.url), 'utf8');
const project = readFileSync(new URL('../views/ProjectView.ts', import.meta.url), 'utf8');
const learning = readFileSync(new URL('../views/LearningProcessDetail.ts', import.meta.url), 'utf8');

test('today execution removes the former top-three placeholder and starts with embedded tasks', () => {
	assert.equal(home.includes('今日最重要的 3 件事'), false);
	assert.equal(home.includes('尚未建立独立的重点事项模型'), false);
	assert.ok(home.includes('data.renderEmbeddedToday(body)'));
});

test('today and all-task summaries share the centralized three-category mapping', () => {
	for (const source of [dashboard, list]) {
		assert.ok(source.includes('groupEmbeddedForDisplay'));
		assert.ok(source.includes('TASK_DISPLAY_CATEGORIES'));
		assert.ok(source.includes('TASK_DISPLAY_LABELS'));
		assert.ok(source.includes('if (!group.length) continue') || source.includes('if (!groups[type].length) continue'));
	}
	assert.equal(list.includes("for (const type of ['project', 'creation', 'learning', 'daily']"), false);
});

test('today has one neutral empty state and source type details', () => {
	assert.ok(dashboard.includes("text: '今日暂无任务'"));
	assert.ok(dashboard.includes('taskSourceTypeLabel(process.contentType)'));
});

test('specific project and learning details retain their storage-level task titles', () => {
	assert.ok(project.includes("detailTaskHeader(tasks, '项目任务'"));
	assert.ok(learning.includes("detailTaskHeader(block, '学习任务'"));
});
