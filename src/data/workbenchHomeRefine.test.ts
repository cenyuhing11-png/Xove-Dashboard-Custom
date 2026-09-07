import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../components/workbench/WorkbenchHome.ts', import.meta.url), 'utf8');
const learning = readFileSync(new URL('../components/workbench/LearningCard.ts', import.meta.url), 'utf8');

test('Current learning keeps real summary fields and removes duplicate navigation', () => {
	for (const value of ['培养能力', '学习目标', '下一步', '暂未设置能力', '暂未填写学习目标', '暂无待完成学习任务']) assert.ok(learning.includes(value));
	for (const value of ['学习队列', '查看学习主题']) assert.equal(learning.includes(value), false);
	assert.ok(learning.includes("process.category === 'learning'"));
	assert.ok(learning.includes('actions.open(process)'));
});

test('Process schedule card is aggregate-only and keeps actionable sorted deadlines', () => {
	for (const value of ['进行中进程', '学习', '创作', '近期截止', '暂无截止进程', 'runningProcessCounts', 'upcomingProcesses']) assert.ok(home.includes(value));
	for (const value of ["'月历'", "'甘特图'", 'currentProcesses']) assert.equal(home.includes(value), false);
	assert.ok(home.includes('data.onOpenProcess(process)'));
});

test('Knowledge shortcuts remain while creation card uses the settled name and neutral empty states', () => {
	assert.ok(home.includes('KNOWLEDGE_AREAS'));
	assert.ok(home.includes("addEntry(body, '标签导航'"));
	assert.ok(home.includes('✨ 创作与成果'));
	for (const value of ['暂无项目数据', '暂无作品数据', '暂无待发布内容']) assert.ok(home.includes(value));
	assert.equal(home.includes('✨ 作品与内容'), false);
});
