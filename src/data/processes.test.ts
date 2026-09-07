import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processes, processBoardItems, filterProcesses, currentProcesses, hasProcessSchedule, taskProgressLabel, learningProcessStatus, learningProcessResources } from './processes.ts';
import { learningNote, learningTemplate, currentTopics } from './learning.ts';
import { projectNote, PROJECT_STATUSES } from './projects.ts';
import { parseEmbeddedTasks } from './embeddedTasks.ts';
import { projectTimelineItems } from './projectBoardAdapter.ts';

const topic = learningNote('01-学习与资料/产品建模.md', '产品建模', { 类型: '学习主题', 状态: '学习中', 方向: '设计', 所属能力: ['建模'], 开始日期: '2026-09-01', 截止日期: '2026-09-30' })!;
const project = projectNote('03-项目与成果/视觉/视觉.md', { 类型: '项目', 项目ID: 'abc', 状态: '进行中', 方向: '设计', 开始日期: '2026-09-10', 截止日期: '2026-10-05' })!;
const tasks = [...parseEmbeddedTasks(topic.path, '## 学习任务\n- [x] 一\n- [ ] 二\n- [ ] 三\n## 实践\n- [x] 不计入'), ...parseEmbeddedTasks(project.path, '## 项目任务\n- [x] 一\n- [x] 二\n- [ ] 三\n- [ ] 四\n## 最终成果\n- [x] 不计入')];
const all = () => processes([topic], [project], tasks);

test('Learning theme becomes a learning Process without changing its Markdown identity', () => {
	const p = all()[0]!; assert.equal(p.processType, 'learning'); assert.equal(p.name, topic.name); assert.equal(p.sourceFile, topic.path); assert.equal(p.direction, '设计'); assert.equal(p.status, '进行中'); assert.equal(p.rawStatus, '学习中');
});
test('Formal project becomes a project Process preserving UUID and dates', () => {
	const p = all()[1]!; assert.equal(p.processType, 'project'); assert.equal(p.id, project.id); assert.equal(p.startDate, project.startDate); assert.equal(p.dueDate, project.dueDate);
});
test('Legacy learning and project retain their underlying source identities', () => { assert.deepEqual(all().map(p => p.processType), ['learning', 'project']); });
test('Only the learning task heading contributes 1 of 3', () => { const p=all()[0]!;assert.equal(p.taskTotal,3);assert.equal(p.taskCompleted,1);assert.equal(p.taskPending,2); });
test('Only the project task heading contributes 2 of 4', () => { const p=all()[1]!;assert.equal(p.taskTotal,4);assert.equal(p.taskCompleted,2);assert.equal(p.taskPending,2); });
test('Zero tasks means null progress and 暂无任务', () => { for(const p of processes([topic],[project],[])){assert.equal(p.progress,null);assert.equal(taskProgressLabel(p.taskTotal,p.taskCompleted),'暂无任务');} });
test('Progress is the task ratio only, never ability or project quality', () => { assert.equal(all()[0]!.progress,1/3);assert.equal(all()[1]!.progress,.5);assert.equal(taskProgressLabel(3,1),'1 / 3'); });
test('Learning status filter maps 学习中 without rewriting it', () => {assert.equal(filterProcesses(all(),'learning','进行中').length,1);assert.equal(topic.status,'学习中');});
test('Creation status filter uses real project status', () => {assert.equal(filterProcesses(all(),'creation','进行中').length,1);assert.equal(filterProcesses(all(),'creation','暂停').length,0);});
test('Category and status filters combine, not replace each other', () => {const items=[...all(),{...all()[0]!,status:'暂停' as const}];assert.equal(filterProcesses(items,'learning','暂停').length,1);assert.equal(filterProcesses(items,'creation','暂停').length,0);assert.equal(filterProcesses(items).length,3);});
test('Home prefers in-progress mixed processes and keeps its three-row cap', () => {
	const items=[{...all()[0]!,status:'计划中' as const},...all(),{...all()[1]!,status:'暂停' as const}];const current=currentProcesses(items);assert.equal(current.length,3);assert.deepEqual(current.slice(0,2).map(p=>p.status),['进行中','进行中']);assert.deepEqual(new Set(current.slice(0,2).map(p=>p.processType)),new Set(['learning','project']));
});
for (const type of ['learning','project'] as const) {
	test(`Undated ${type} does not enter calendar`,()=>{const p={...all().find(p=>p.processType===type)!,startDate:undefined,dueDate:undefined};assert.equal(processBoardItems([p]).filter(hasProcessSchedule).length,0);});
	test(`Dated ${type} enters calendar via process-level dates`,()=>{const items=processBoardItems(all().filter(p=>p.processType===type)).filter(hasProcessSchedule);const time=projectTimelineItems(items);assert.equal(time.length,1);assert.equal(time[0]!.startDate,items[0]!.startDate);assert.equal(time[0]!.dueDate,items[0]!.endDate);});
	test(`Gantt ${type} has a flat, read-only schedule, not checkbox children`,()=>{const schedule=projectTimelineItems(processBoardItems(all().filter(p=>p.processType===type)));assert.equal(schedule.length,1);assert.equal(schedule[0]!.parent,'');assert.equal(schedule[0]!.sourceFile,'');assert.deepEqual(schedule[0]!.dailyNodes,{});});
}
test('Empty vault produces no synthetic process or task',()=>{assert.deepEqual(processes([],[],[]),[]);});
test('Ordinary resources, abilities and legacy Projects do not become processes',()=>{
	const resource=learningNote('01-学习与资料/书籍/书.md','书',{类型:'学习资源'})!;
	const ability=learningNote('01-学习与资料/能力.md','能力',{类型:'能力'})!;
	assert.equal(processes([resource,ability,{...topic,path:'旧知识库/主题.md'}],[{...project,path:'Projects/旧项目.md'}],tasks).length,0);
});
test('Original Board adapter receives counts and dates without NPDP phases',()=>{const item=processBoardItems(all())[0]!;assert.equal(item.taskCount,3);assert.equal(item.doneCount,1);assert.equal(item.activeCount,2);assert.equal(item.type,'nostage');assert.equal(item.stage,-1);assert.equal(item.path,topic.path);assert.equal(item.process.progress,1/3);});
test('Task dates or same-title resources never leak into process counts or dates',()=>{
	const resourceTasks=parseEmbeddedTasks('01-学习与资料/书籍/产品建模.md','## 学习任务\n- [x] 资源 📅 2027-01-01');
	const wrong=tasks.map(t=>({...t,sourceHeading:'备注'}));const p=processes([topic],[],[...resourceTasks,...wrong])[0]!;assert.equal(p.taskTotal,0);assert.equal(p.dueDate,'2026-09-30');
});
test('Optional dates accept MetadataCache Date and reject malformed calendar dates',()=>{const p=learningNote(topic.path,topic.name,{类型:'学习主题',开始日期:new Date('2026-09-01T00:00:00Z'),截止日期:'2026-02-30'})!;assert.equal(p.startDate,'2026-09-01');assert.equal(p.dueDate,undefined);});
test('Old learning notes without new fields stay readable and active',()=>{const n=learningNote(topic.path,topic.name,{类型:'学习主题',状态:'学习中'})!;assert.equal(n.startDate,undefined);assert.equal(processes([n],[],[])[0]!.status,'进行中');assert.equal(currentTopics([n]).length,1);});
test('New 进行中 status also remains visible in current learning',()=>{assert.equal(currentTopics([{...topic,status:'进行中'}]).length,1);});
test('All five normalized statuses are preserved',()=>{for(const status of PROJECT_STATUSES)assert.equal(learningProcessStatus(status),status);assert.equal(learningProcessStatus('未知'),'计划中');assert.equal(learningProcessStatus('已学完'),'已完成');});
test('Reversed date ranges are omitted from timelines without hiding list entries',()=>{const items=processBoardItems([{...all()[0]!,startDate:'2026-10-01',dueDate:'2026-09-01'}]);assert.equal(items.length,1);assert.equal(items.filter(hasProcessSchedule).length,0);});
test('A single valid date is a one-day process schedule, not an invented range',()=>{const item=processBoardItems([{...all()[0]!,startDate:undefined}])[0]!;assert.equal(hasProcessSchedule(item),true);assert.equal(projectTimelineItems([item])[0]!.startDate,null);});
test('Learning creation retains its root and adds only blank optional dates/task section',()=>{const content=learningTemplate('学习主题','示例');assert.ok(content.includes('开始日期:\n截止日期:'));assert.ok(content.includes('## 学习任务'));assert.ok(content.includes('类型: 学习主题'));assert.equal(content.includes('类型: 进程'),false);});
test('Aggregation and filtering do not mutate learning, projects or tasks',()=>{const before=JSON.stringify([topic,project,tasks]);currentProcesses(filterProcesses(all()));projectTimelineItems(processBoardItems(all()));assert.equal(JSON.stringify([topic,project,tasks]),before);});
test('Current resources use explicit theme relationships, not only matching direction',()=>{const related=learningNote('01-学习与资料/书籍/a.md','a',{类型:'学习资源',关联主题:'[[产品建模]]'})!;const unrelated={...related,name:'b',topics:[],direction:'设计'};assert.deepEqual(learningProcessResources(topic,[topic,related,unrelated]),[related]);});
test('Ambiguous same-name theme relations are not silently merged',()=>{const resource=learningNote('01-学习与资料/书籍/a.md','a',{类型:'学习资源',关联主题:'产品建模'})!;assert.deepEqual(learningProcessResources(topic,[topic,{...topic,path:'01-学习与资料/别处/产品建模.md'},resource]),[]);});
