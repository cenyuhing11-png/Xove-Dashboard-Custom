import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { compactProcessDate, processDateTitle, directionProcessCounts, matchesProcessFilters, processPreviewTasks } from './processNavigation.ts';
import { parseEmbeddedTasks } from './embeddedTasks.ts';
import type { ProcessStatus, ProcessType } from './processes';
import { renderLifeCompass } from '../components/workbench/LifeCompass.ts';
import { LIFE_COMPASS } from '../components/workbench/config.ts';
import { readFileSync } from 'node:fs';

const items = [
	{direction:'设计',processType:'learning',status:'进行中'},
	{direction:'设计',processType:'learning',status:'暂停'},
	...Array.from({length:4},()=>({direction:'设计',processType:'project',status:'计划中'})),
	{direction:'英语',processType:'learning',status:'进行中'},
	{direction:'',processType:'project',status:'进行中'},
] as {direction:string;processType:ProcessType;status:ProcessStatus}[];
const filtered=(direction:string|null=null,type:ProcessType|'all'='all',status:ProcessStatus|'全部'='全部')=>items.filter(p=>matchesProcessFilters(p,{direction,type,status}));
test('Direction filter selects exact direction, not a title or task source',()=>{assert.equal(filtered('设计').length,6);assert.equal(filtered('英语').length,1);});
test('Direction count includes learning processes, not resources or tasks',()=>{assert.equal(directionProcessCounts(items,'设计').learning,2);});
test('Direction count includes project processes, not completed checkboxes',()=>{assert.equal(directionProcessCounts(items,'设计').project,4);});
test('Direction count label is exactly 学2 · 项4',()=>{assert.equal(directionProcessCounts(items,'设计').label,'学2 · 项4');});
test('Empty direction retains 学0 · 项0 format',()=>{assert.equal(directionProcessCounts(items,'摄影').label,'学0 · 项0');assert.equal(filtered('摄影').length,0);});
test('Direction and type form an intersection',()=>{assert.equal(filtered('设计','learning').length,2);assert.equal(filtered('设计','project').length,4);});
test('Direction and status form an intersection',()=>{assert.equal(filtered('设计','all','进行中').length,1);});
test('All three filters combine',()=>{assert.equal(filtered('设计','learning','进行中').length,1);assert.equal(filtered('设计','project','进行中').length,0);});
test('Clearing direction retains type and status and includes unassigned processes',()=>{assert.equal(filtered(null,'learning','进行中').length,2);assert.equal(filtered(null,'project','进行中').length,1);});
test('Sidebar facet counts are stable while main-view filters change',()=>{const before=directionProcessCounts(items,'设计');filtered('设计','learning','暂停');assert.deepEqual(directionProcessCounts(items,'设计'),before);});
test('Current local year displays zero-padded MM.DD',()=>{assert.equal(compactProcessDate('2026-09-01',new Date(2026,0,1)),'09.01');assert.equal(compactProcessDate('2026-09-30',new Date(2026,11,31)),'09.30');});
test('Non-current year displays YYYY.MM.DD',()=>{assert.equal(compactProcessDate('2027-01-15',new Date(2026,8,1)),'2027.01.15');assert.equal(compactProcessDate('2025-12-31',new Date(2026,0,1)),'2025.12.31');});
for(const [zone,instant,date,expected] of [
	['Asia/Shanghai','2026-12-31T16:30:00Z','2027-01-01','01.01'],
	['Asia/Shanghai','2026-12-31T16:30:00Z','2026-12-31','2026.12.31'],
	['America/Los_Angeles','2027-01-01T01:30:00Z','2026-12-31','12.31'],
	['America/Los_Angeles','2027-01-01T01:30:00Z','2027-01-01','2027.01.01'],
])test(`Local year boundary ${zone} ${date} uses local, not UTC, year`,()=>{
	const script=`import {compactProcessDate} from ${JSON.stringify(new URL('./processNavigation.ts',import.meta.url).href)};process.stdout.write(compactProcessDate(${JSON.stringify(date)},new Date(${JSON.stringify(instant)})));`;
	const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TZ:zone},encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,expected);
});
test('Date tooltip is full Chinese calendar date without timezone conversion',()=>{assert.equal(processDateTitle('2026-09-01'),'2026年9月1日');});
test('Invalid or missing date remains noninteractive dash',()=>{for(const d of [null,undefined,'','2026-02-30','9/1']){assert.equal(compactProcessDate(d),'—');assert.equal(processDateTitle(d),'');}});
test('Learning quick preview selects only the specified learning heading and file',()=>{
	const source={name:'主题',processType:'learning' as const,sourceFile:'01-学习与资料/主题.md'};
	const tasks=parseEmbeddedTasks(source.sourceFile,'## 学习任务\n- [ ] 一\n- [x] 二\n## 下一步\n- [ ] 不计入');
	const other=parseEmbeddedTasks('01-学习与资料/资料.md','## 学习任务\n- [ ] 不属于主题');
	const group=processPreviewTasks([...tasks,...other],source);assert.equal(group.total,2);assert.equal(group.pending.length,1);assert.equal(group.completed.length,1);
});
test('Project quick preview selects only the project task heading',()=>{
	const source={name:'项目',processType:'project' as const,sourceFile:'03-项目与作品/项目/项目.md'};
	const tasks=parseEmbeddedTasks(source.sourceFile,'## 项目任务\n- [x] 一\n- [ ] 二\n## 最终成果\n- [ ] 不计入');const result=processPreviewTasks(tasks,source);assert.equal(result.total,2);assert.equal(result.completed.length,1);
});
test('Empty quick preview is safe and does not mutate or create tasks',()=>{assert.deepEqual(processPreviewTasks([],{name:'空',processType:'learning',sourceFile:'01-学习与资料/空.md'}),{pending:[],completed:[],total:0});});
test('Home/process/inbox use the same LifeCompass renderer, config and classes',()=>{
	const home=readFileSync(new URL('../components/workbench/WorkbenchHome.ts',import.meta.url),'utf8'),view=readFileSync(new URL('../views/ProjectView.ts',import.meta.url),'utf8'),dashboard=readFileSync(new URL('../views/DashboardView.ts',import.meta.url),'utf8');
	for(const code of [home,view,dashboard])assert.ok(code.includes('renderLifeCompass('));assert.ok(dashboard.includes("page === 'opportunity'"));assert.equal(view.includes('wb-compass__lane'),false);assert.equal(dashboard.includes('wb-compass__lane'),false);
	const names:string[]=[];const nodes:any[]=[];const element=(tag:string,options:any={})=>{const n:any={tag,...options,createEl:element,createSpan:(o:any)=>element('span',o),createDiv:(o:any)=>element('div',o)};nodes.push(n);return n;};
	const compass=renderLifeCompass(element('div'),name=>names.push(name));assert.equal((compass as any).cls,'wb-compass');nodes.filter(n=>n.tag==='button').forEach(n=>n.onclick());assert.deepEqual(names,LIFE_COMPASS.flatMap(l=>l.items));assert.ok(nodes.filter(n=>n.cls==='wb-compass__label').every(n=>!n.onclick));
});
test('Inbox board business code is not used to render the added compass',()=>{const board=readFileSync(new URL('../views/OpportunityBoard.ts',import.meta.url),'utf8');assert.equal(board.includes('renderLifeCompass'),false);assert.equal(board.includes('ProcessTasksModal'),false);});
