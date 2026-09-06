import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectBoardItems, projectTimelineItems, filterBoardItems } from './projectBoardAdapter.ts';
import { parseEmbeddedTasks } from './embeddedTasks.ts';
import { projectNote, PROJECT_STATUSES } from './projects.ts';
import type { MengxuProject } from './projects';
import { scanProjects } from './projectVault.ts';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { processes, processBoardItems } from './processes.ts';
import type { ProcessBoardItem } from './processes';
import { learningNote } from './learning.ts';

const path = '03-项目与作品/设计项目/设计项目.md';
const project: MengxuProject = { id: '32823a4a-645d-4eca-ad69-30bb445a7634', path, name: '设计项目', status: '进行中', direction: '设计', startDate: '2026-09-06', dueDate: '2026-10-01', createdDate: '2026-09-05', goal: '明确结果' };
const tasks = parseEmbeddedTasks(path, '## 项目任务\n- [ ] 未完成 📅 2026-09-07\n- [x] 已完成\n## 项目资料\n- [ ] 不计入');

test('Board adapter preserves project name, UUID reference, path and goal', () => {
	const item = projectBoardItems([project], tasks)[0]!;
	assert.equal(item.name, project.name); assert.equal(item.key, path); assert.equal(item.path, path); assert.equal(item.project.id, project.id); assert.equal(item.description, project.goal);
});
test('Board dates use project dates, not Embedded Task dates', () => {
	const item = projectBoardItems([project], tasks)[0]!;
	assert.equal(item.startDate, '2026-09-06'); assert.equal(item.endDate, '2026-10-01'); assert.equal(item.createDate, '2026-09-05');
});
test('Board counts include only matching project heading tasks', () => {
	const unrelated = parseEmbeddedTasks('01-学习与资料/书籍/学习.md', '## 学习任务\n- [x] 学习');
	const item = projectBoardItems([project], [...tasks, ...unrelated, ...tasks.map(t => ({ ...t, sourceFile: '03-项目与作品/其他/其他.md' }))])[0]!;
	assert.equal(item.taskCount, 2); assert.equal(item.doneCount, 1); assert.equal(item.activeCount, 1);
});
test('Board supports empty project task sections', () => {
	const item = projectBoardItems([project], [])[0]!; assert.equal(item.taskCount, 0); assert.equal(item.doneCount, 0); assert.equal(item.activeCount, 0);
});
for (const status of PROJECT_STATUSES) test(`Board preserves ${status} without inventing NPDP phase`, () => {
	const item = projectBoardItems([{ ...project, status }], [])[0]!;
	assert.equal(item.status, status); assert.equal(item.type, 'nostage'); assert.equal(item.stage, -1); assert.equal(item.stages, undefined);
});
test('Board direction optional, no forced classification', () => {
	assert.equal(projectBoardItems([project], [])[0]!.direction, '设计');
	assert.equal(projectBoardItems([{ ...project, direction: '' }], [])[0]!.direction, '');
});
test('Missing date fields stay absent without invented range', () => {
	const item = projectBoardItems([{ ...project, startDate: '', dueDate: '', createdDate: '' }], [])[0]!;
	assert.equal(item.startDate, null); assert.equal(item.endDate, null); assert.equal(item.createDate, null);
	const time = projectTimelineItems([item])[0]!; assert.equal(time.startDate, null); assert.equal(time.dueDate, null);
});
test('One-date projects remain one-date schedules', () => {
	for (const key of ['startDate', 'dueDate'] as const) { const p = { ...project, [key]: '' }; const time = projectTimelineItems(projectBoardItems([p], []))[0]!; assert.equal(time[key], null); }
});
test('Schedule projection is read-only and does not expose task source files', () => {
	const items = projectBoardItems([project], tasks); const time = projectTimelineItems(items);
	assert.equal(time.length, 1); assert.equal(time[0]!.sourceFile, ''); assert.equal(time[0]!.id, path); assert.equal(time[0]!.parent, ''); assert.deepEqual(time[0]!.dailyNodes, {});
});
test('Closed project shading does not turn archived projects into cancelled tasks', () => {
	const items = projectBoardItems(PROJECT_STATUSES.map(status => ({ ...project, status })), []);
	const time = projectTimelineItems(items); assert.equal(time.filter(t => t.status === '已完成').length, 1); assert.equal(time.some(t => t.status === '已取消'), false);
});
test('Filtering uses actual project status and exact path, not duplicate names', () => {
	const items = projectBoardItems([project, { ...project, path: '03-项目与作品/其他/设计项目.md', status: '暂停' }], tasks);
	assert.equal(filterBoardItems(items, '暂停')[0]!.project.status, '暂停'); assert.equal(filterBoardItems(items, '全部', path).length, 1); assert.equal(filterBoardItems(items, '全部').length, 2);
});
test('Adapter does not mutate projects or tasks', () => {
	const before = JSON.stringify([project, tasks]); projectTimelineItems(projectBoardItems([project], tasks)); assert.equal(JSON.stringify([project, tasks]), before);
});
test('Formal scanner excludes legacy project metadata and unrelated notes', () => {
	const files = [{ path }, { path: '03-项目与作品/旧项目/project-旧项目.md' }, { path: 'Projects/旧项目/project-旧项目.md' }];
	const app = { vault: { getMarkdownFiles: () => files }, metadataCache: { getFileCache: (f: {path: string}) => ({ frontmatter: f.path === path ? { 类型: '项目', 项目ID: project.id } : { 项目名称: '旧项目', 阶段: 2 } }) } };
	const items = projectBoardItems(scanProjects(app as any), []); assert.equal(items.length, 1); assert.equal(items[0]!.key, path);
});
test('Legacy missing optional fields still render safely through the formal opt-in', () => {
	const parsed = projectNote(path, { 类型: '项目' })!; const item = projectBoardItems([parsed], [])[0]!;
	assert.equal(item.status, '计划中'); assert.equal(item.direction, ''); assert.equal(item.project.id, '');
});

// Exercise the real ProjectBoard in project mode with no TaskStore or file writers.
class Element {
	tag: string; children: Element[] = []; parent?: Element; classes = new Set<string>(); text = ''; value = ''; title = ''; draggable = false;
	dataset: Record<string,string> = {}; style: Record<string,string> = {}; attrs: Record<string,string> = {}; events: Record<string,((e:any)=>unknown)[]> = {};
	onclick: () => unknown = () => {}; onkeydown: (e:any)=>unknown = () => {};
	clientWidth=800; clientHeight=600; offsetHeight=600; offsetTop=0; scrollLeft=0; scrollTop=0;
	constructor(tag='div') { this.tag=tag; }
	get parentElement(){return this.parent;}
	classList = { add: (c:string)=>this.classes.add(c), remove:(c:string)=>this.classes.delete(c), contains:(c:string)=>this.classes.has(c) };
	createEl(tag:string, opts:any={}) { const e=new Element(tag); e.text=opts.text??''; e.value=opts.value??''; for(const c of (opts.cls??'').split(' ').filter(Boolean))e.addClass(c);for(const [k,v]of Object.entries(opts.attr??{}))e.setAttribute(k,String(v));this.appendChild(e);return e; }
	createDiv(o:any={}) { return this.createEl('div',o); } createSpan(o:any={}) { return this.createEl('span',o); }
	appendChild(e:Element) { e.parent=this;this.children.push(e);return e; } replaceChildren(...e:Element[]) {this.children=e;}
	addClass(c:string){this.classes.add(c);} removeClass(c:string){this.classes.delete(c);} toggleClass(c:string,on:boolean){on?this.addClass(c):this.removeClass(c);}
	setAttribute(k:string,v:string){this.attrs[k]=v;if(k==='class')this.classes=new Set(v.split(' '));if(k.startsWith('data-'))this.dataset[k.slice(5)]=v;}
	setAttr(k:string,v:string){this.setAttribute(k,v);} getAttribute(k:string){return this.attrs[k];}
	appendText(t:string){this.text+=t;} setText(t:string){this.text=t;} empty(){for(const child of this.children)child.parent=undefined;this.children=[];}
	addEventListener(k:string,fn:(e:any)=>unknown){(this.events[k]??=[]).push(fn);}
	all():Element[]{return [this,...this.children.flatMap(e=>e.all())];}
	querySelectorAll(selector:string){return this.all().filter(e=>selector.startsWith('.')?e.classes.has(selector.slice(1)):e.tag===selector);}
	querySelector(selector:string){return this.querySelectorAll(selector)[0];}
	getBoundingClientRect(){return {left:0,top:0,right:800,bottom:600,width:800,height:600};}
	remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);} scrollIntoView(){}
}
const bundle=buildSync({entryPoints:[fileURLToPath(new URL('../views/ProjectBoard.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['obsidian']}).outputFiles[0]!.text;
function boardFixture(view='kanban', values=[project], processItems?: ProcessBoardItem[]) {
	const module:{exports:any}={exports:{}};const opened:any[]=[];let created=0,learningCreated=0;const menuItems:any[]=[];
	class Menu { addItem(fn:(item:any)=>void){const item={title:'',click:()=>{},setTitle(title:string){this.title=title;return this;},onClick(click:()=>void){this.click=click;return this;}};fn(item);menuItems.push(item);} showAtMouseEvent(){} }
	runInNewContext(bundle,{module,exports:module.exports,require:(id:string)=>{assert.equal(id,'obsidian');return {Menu,Modal:class{},ItemView:class{}};},
		DOMParser:class{parseFromString(){return {documentElement:new Element('svg')};}},
		document:{createElementNS:(_:string,t:string)=>new Element(t)},window:{requestAnimationFrame:()=>{}},
		ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>{},setTimeout:()=>{},
	});
	const root=new Element();const items=processItems ?? projectBoardItems(values,tasks);
	const board=new module.exports.ProjectBoard({kind:'mengxu',app:{},boardEl:root,tasks:{},items:()=>items,open:(p:any)=>opened.push(p.process ?? p.project),create:()=>created++,...(processItems ? {createLearning:()=>learningCreated++} : {})});
	board.currentView=view;
	return {board,root,items,opened,created:()=>created,learningCreated:()=>learningCreated,menuItems};
}
test('ProjectBoard uses original container/sidebar/tabs/card classes', async()=>{
	const f=boardFixture();await f.board.show();for(const cls of ['po-board','po-container','po-sidebar','po-main','po-tabs','po-panel','po-kanban','po-kanban__card'])assert.ok(f.root.querySelector('.'+cls),cls);
	assert.equal(f.root.querySelectorAll('.po-tab').length,4);assert.equal(f.root.querySelector('.mx-project-card'),undefined);
});

const learningPath='01-学习与资料/产品建模.md';
const learning=learningNote(learningPath,'产品建模',{类型:'学习主题',状态:'学习中',方向:'设计',开始日期:'2026-09-01',截止日期:'2026-09-30'})!;
const learningBody='## 学习目标\n测试目标\n## 学习任务\n- [x] 一\n- [ ] 二\n- [ ] 三\n## 当前资源\n材料摘录\n## 下一步\n下一步内容\n## 实践\n实践内容';
const mixed=processBoardItems(processes([learning],[project],[...tasks,...parseEmbeddedTasks(learningPath,learningBody)]));
test('Process create menu routes exactly to the existing learning/project actions',async()=>{
	const f=boardFixture('kanban',[],mixed);await f.board.show();f.root.querySelector('.po-add-btn')!.onclick();assert.deepEqual(f.menuItems.map(i=>i.title),['学习进程','项目']);f.menuItems[0].click();f.menuItems[1].click();assert.equal(f.learningCreated(),1);assert.equal(f.created(),1);
});
test('Mixed ProcessBoard keeps the original sidebar/cards/tabs without a second UI',async()=>{
	const f=boardFixture('kanban',[],mixed);await f.board.show();assert.equal(f.root.querySelectorAll('.po-kanban__card').length,2);assert.equal(f.root.querySelectorAll('.po-container').length,1);assert.equal(f.root.querySelectorAll('.po-tab').length,4);assert.equal(f.root.querySelectorAll('.po-chip').filter(e=>e.dataset.processType).length,3);
});
test('Process type and status chips combine and clear a hidden sidebar selection',async()=>{
	const items=[...mixed,{...mixed[1]!,key:'paused',status:'暂停' as const,process:{...mixed[1]!.process,status:'暂停' as const}}];
	const f=boardFixture('kanban',[],items);await f.board.show();f.root.querySelectorAll('.po-sidebar__item')[1]!.onclick();
	f.root.querySelectorAll('.po-chip').find(e=>e.dataset.processType==='project')!.onclick();f.root.querySelectorAll('.po-chip').find(e=>e.dataset.filter==='暂停')!.onclick();
	assert.equal(f.board.projectSelection,null);assert.equal(f.root.querySelectorAll('.po-kanban__card').length,1);assert.ok(f.root.querySelector('.po-kanban__card')!.all().some(e=>e.text==='项目 · 暂停 · 设计'));
});
test('Mixed cards show type and correct task progress and route to their own sources',async()=>{
	const f=boardFixture('kanban',[],mixed);await f.board.show();const cards=f.root.querySelectorAll('.po-kanban__card');cards.forEach(c=>c.onclick());assert.deepEqual(f.opened.map(p=>p.processType),['learning','project']);assert.ok(cards[0]!.all().some(e=>e.text==='任务 1 / 3'));assert.ok(cards[1]!.all().some(e=>e.text==='任务 1 / 2'));
});
test('Zero-task process cards and sidebar say 暂无任务, never 0%',async()=>{
	const f=boardFixture('kanban',[],processBoardItems(processes([learning],[],[])));await f.board.show();assert.ok(f.root.querySelector('.po-kanban__card')!.all().some(e=>e.text==='暂无任务'));assert.equal(f.root.querySelector('.po-count')!.text,'暂无任务');assert.equal(f.root.all().some(e=>e.text.includes('0%')),false);
});
test('One original process table includes type column, sorting and both sources',async()=>{
	const f=boardFixture('list',[],mixed);await f.board.show();assert.equal(f.root.querySelectorAll('.po-table').length,1);assert.equal(f.root.querySelectorAll('.po-data-row').length,2);assert.deepEqual(f.root.querySelectorAll('th').map(e=>e.text),['名称','类型','方向','状态','开始','截止','任务进度']);f.root.querySelectorAll('th').find(e=>e.dataset.sortKey==='processType')!.onclick();assert.equal(f.root.querySelectorAll('.po-data-row').length,2);
});
test('Gantt shows both process types, excludes undated processes and checkbox children',async()=>{
	const undated={...mixed[0]!,key:'undated',startDate:null,endDate:null};const f=boardFixture('gantt',[],[...mixed,undated]);await f.board.show();assert.equal(f.root.querySelectorAll('.po-gantt__bar').length,2);assert.equal(f.root.querySelectorAll('.po-gantt__label-row').length,2);assert.ok(f.root.querySelectorAll('.po-gantt__label-title').some(e=>e.text.startsWith('学习 · ')));assert.equal(f.root.querySelector('.po-gantt__label-add'),undefined);
});
test('Same-title learning and project processes do not duplicate Gantt rows',async()=>{
	const f=boardFixture('gantt',[],mixed.map(p=>({...p,name:'同名'})));await f.board.show();assert.equal(f.root.querySelectorAll('.po-gantt__label-row').length,2);assert.equal(f.root.querySelectorAll('.po-gantt__bar').length,2);
});
test('Calendar preserves original geometry and labels both process types',async()=>{
	const f=boardFixture('calendar',[],mixed);f.board.calYear=2026;f.board.calMonth=8;await f.board.show();assert.ok(f.root.querySelector('.po-cal'));const labels=f.root.querySelectorAll('.po-cal__mbar-seg').map(e=>e.text);assert.ok(labels.some(t=>t.startsWith('学习 · ')));assert.ok(labels.some(t=>t.startsWith('项目 · ')));assert.equal(f.root.querySelector('.po-cal__expand'),undefined);
});
test('Homepage timeline entry uses same Board and resets session-local filters only',async()=>{
	const f=boardFixture('kanban',[],mixed);f.board.projectFilter='暂停';f.board.processTypeFilter='project';await f.board.openView('calendar');assert.equal(f.board.currentView,'calendar');assert.equal(f.board.projectFilter,'全部');assert.equal(f.board.processTypeFilter,'all');assert.ok(f.root.querySelector('.po-cal'));
});
const viewCode=buildSync({entryPoints:[fileURLToPath(new URL('../views/ProjectView.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['obsidian']}).outputFiles[0]!.text;
for(const type of ['learning','project'] as const)test(`Click routing opens ${type} source in reused process view`,async()=>{
	const module:{exports:any}={exports:{}};runInNewContext(viewCode,{module,exports:module.exports,require:()=>({Component:class{},Modal:class{},ItemView:class{}})});
	const states:any[]=[];let created=0,active=0;const leaf={setViewState:async(s:any)=>states.push(s)};const app={workspace:{getLeavesOfType:()=>[leaf],getLeaf:()=>{created++;return leaf;},revealLeaf:async()=>{},setActiveLeaf:()=>active++}};
	const p=mixed.find(p=>p.process.processType===type)!.process;await module.exports.openProcess(app,p);assert.equal(created,0);assert.equal(active,1);assert.equal(states[0].type,'xove-dashboard-custom-projects');assert.equal(states[0].state.path,p.sourceFile);assert.equal(states[0].state.projectId,type==='learning'?'':p.id);
});
test('Missing project UUID falls back to source path, not a synthetic persisted ID',async()=>{
	const module:{exports:any}={exports:{}};runInNewContext(viewCode,{module,exports:module.exports,require:()=>({Component:class{},Modal:class{},ItemView:class{}})});let state:any;const leaf={setViewState:async(s:any)=>state=s};const app={workspace:{getLeavesOfType:()=>[leaf],revealLeaf:async()=>{},setActiveLeaf(){}}};const p=processes([],[{...project,id:''}],[])[0]!;await module.exports.openProcess(app,p);assert.equal(state.state.projectId,'');assert.equal(state.state.path,project.path);
});
const detailCode=buildSync({entryPoints:[fileURLToPath(new URL('../views/LearningProcessDetail.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['obsidian']}).outputFiles[0]!.text;
function learningDetail(){
	const module:{exports:any}={exports:{}};const changes:any[]=[];const modals:any[]=[];const opened:any[]=[];let back=0;
	class File {path=learning.path;} const file=new File();
	runInNewContext(detailCode,{module,exports:module.exports,require:()=>({TFile:File,Modal:class{open(){modals.push(this);}},Notice:class{}})});
	const app={vault:{getAbstractFileByPath:()=>file},workspace:{getLeaf:()=>({openFile:async(f:any)=>opened.push(f.path)})}};
	const root=new Element();const store={complete:async(t:any,v:boolean)=>changes.push([t.sourceFile,v])};module.exports.renderLearningProcessDetail(root,app,store,learning,[learning],learningBody,()=>back++);
	return{root,changes,modals,opened,back:()=>back};
}
test('Learning detail reuses author blocks and displays goal/tasks/resources/next/practice',()=>{
	const f=learningDetail();for(const label of ['学习目标','学习任务','当前资源','下一步','实践'])assert.ok(f.root.querySelectorAll('.ad-modal-title').some(e=>e.text===label));assert.equal(f.root.querySelectorAll('.mx-task-row').length,3);assert.ok(f.root.all().some(e=>e.text==='1 / 3'));assert.equal(f.root.querySelector('.ad-header'),undefined);
});
test('Learning detail completion writes the original Embedded Task source',async()=>{
	const f=learningDetail();const input:any=f.root.querySelectorAll('input')[1]!;input.checked=true;input.onchange();await Promise.resolve();assert.deepEqual(f.changes,[[learning.path,true]]);
});
test('Learning detail add-task action keeps the theme preset, not a task file',()=>{
	const f=learningDetail();f.root.querySelectorAll('button').find(e=>e.text==='添加学习任务')!.onclick();assert.equal(f.modals.length,1);assert.equal(f.modals[0].presetPath,learning.path);
});
test('Learning detail source edit and overview remain available',async()=>{
	const f=learningDetail();f.root.querySelectorAll('button').find(e=>e.text==='编辑学习笔记 →')!.onclick();await Promise.resolve();assert.deepEqual(f.opened,[learning.path]);f.root.querySelectorAll('button').find(e=>e.text==='全部进程 →')!.onclick();assert.equal(f.back(),1);
});
test('ProjectBoard card opens new project reference and create uses supplied new Modal action',async()=>{
	const f=boardFixture();await f.board.show();f.root.querySelector('.po-kanban__card')!.onclick();f.root.querySelector('.po-add-btn')!.onclick();assert.equal(f.opened[0],project);assert.equal(f.created(),1);
});
test('ProjectBoard status chips filter actual states and clear incompatible sidebar selection',async()=>{
	const paused={...project,path:'03-项目与作品/暂停/暂停.md',status:'暂停' as const};const f=boardFixture('kanban',[project,paused]);await f.board.show();
	f.root.querySelectorAll('.po-sidebar__item')[1]!.onclick();f.root.querySelectorAll('.po-chip').find(e=>e.text==='暂停')!.onclick();
	assert.equal(f.root.querySelectorAll('.po-kanban__card').length,1);assert.equal(f.board.projectSelection,null);assert.equal(f.root.querySelector('.po-kanban__col')!.dataset.status,'暂停');
});
test('ProjectBoard cards display Embedded counts, direction and dates',async()=>{
	const f=boardFixture();await f.board.show();const text=f.root.querySelector('.po-kanban__card')!.all().map(e=>e.text).join(' ');
	for(const value of ['设计项目','进行中 · 设计','2026-09-06','2026-10-01','任务 1 / 2'])assert.ok(text.includes(value),value);
});
test('ProjectBoard list retains original table and opens new detail',async()=>{
	const f=boardFixture('list');await f.board.show();assert.ok(f.root.querySelector('.po-table'));f.root.querySelector('.po-clickable')!.onclick();assert.equal(f.opened[0],project);
});
test('ProjectBoard table sorting retains the original sortable headers',async()=>{
	const f=boardFixture('list',[project,{...project,name:'A 项目',path:'03-项目与作品/A/A.md'}]);await f.board.show();
	f.root.querySelectorAll('.po-th--sortable').find(e=>e.dataset.sortKey==='name')!.onclick();
	const asc=f.root.querySelectorAll('.po-name-cell').map(e=>e.text);
	f.root.querySelectorAll('.po-th--sortable').find(e=>e.dataset.sortKey==='name')!.onclick();
	assert.deepEqual(f.root.querySelectorAll('.po-name-cell').map(e=>e.text),[...asc].reverse());
});
test('Original Gantt renders project date bars, no drag handles or legacy edit controls',async()=>{
	const f=boardFixture('gantt');await f.board.show();assert.equal(f.root.querySelectorAll('.po-gantt__bar').length,1);assert.equal(f.root.querySelector('.po-gantt__bar-handle'),undefined);assert.equal(f.root.querySelector('.po-gantt__label-add'),undefined);
	const row=f.root.querySelector('.po-gantt__label-row')!;assert.equal(row.draggable,false);row.events.click![0]!({});assert.equal(f.opened[0],project);
});
test('Project schedule drag/drop cannot reach legacy task file writers',async()=>{
	const f=boardFixture('gantt');await f.board.show();const row=f.root.querySelector('.po-gantt__label-row')!;
	let prevented=0;await row.events.drop![0]!({preventDefault:()=>prevented++,dataTransfer:{getData:()=>{throw Error('Legacy drag accessed');}}});
	row.events.dragstart![0]!({preventDefault:()=>prevented++});assert.equal(prevented,2);assert.deepEqual(f.opened,[]);
});
test('Original calendar renders project date range, not daily task execution controls',async()=>{
	const f=boardFixture('calendar');f.board.calYear=2026;f.board.calMonth=8;await f.board.show();assert.ok(f.root.querySelector('.po-cal'));assert.ok(f.root.querySelector('.po-cal__mbar'));assert.equal(f.root.querySelector('.po-cal__expand'),undefined);assert.equal(f.root.querySelector('.po-cal__new')!.text,'＋ 新建项目');
});
test('Projects due today are not shown overdue before the day has ended',async()=>{
	const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
	const f=boardFixture('calendar',[{...project,startDate:'',dueDate:today}]);await f.board.show();
	assert.ok(f.root.querySelector('.po-cal__chip'));assert.equal(f.root.querySelector('.is-overdue'),undefined);assert.equal(f.root.querySelector('.po-cal__over'),undefined);
});
test('Empty overview retains view tabs, status filter and original empty state',async()=>{
	const f=boardFixture('gantt',[]);await f.board.show();assert.ok(f.root.querySelector('.po-empty'));assert.equal(f.root.querySelectorAll('.po-tab').length,4);assert.equal(f.root.querySelectorAll('.po-chip').filter(e=>e.dataset.filter).length,6);assert.equal(f.root.querySelectorAll('.po-chip').filter(e=>e.dataset.processType).length,3);
});
test('ProjectView routes board callbacks to modern detail and restored new-project modal',()=>{
	const source=readFileSync(new URL('../views/ProjectView.ts',import.meta.url),'utf8');assert.ok(source.includes('openProjects(this.app, item.project)'));assert.ok(source.includes('create: () => new NewProjectModal(this.app).open()'));assert.equal(source.includes('mx-project-card'),false);assert.equal(source.includes('new Setting('),false);
});
test('First overview after direct detail navigation leaves only the original Board shell',async()=>{
	const code=buildSync({entryPoints:[fileURLToPath(new URL('../views/ProjectView.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['obsidian']}).outputFiles[0]!.text;
	const module:{exports:any}={exports:{}};
	runInNewContext(code,{module,exports:module.exports,require:()=>({Component:class{},Modal:class{},ItemView:class{contentEl=new Element();app={vault:{getMarkdownFiles:()=>[]}};}}),
		DOMParser:class{parseFromString(){return {documentElement:new Element('svg')};}},
	});
	const view=new module.exports.ProjectView({}, {all:()=>[]},()=> 'light');
	view.path='missing-project.md';await view.render();assert.ok(view.contentEl.querySelector('p'));
	view.path='';await view.render();assert.equal(view.contentEl.children.length,1);assert.ok(view.contentEl.querySelector('.po-container'));assert.equal(view.contentEl.querySelector('p'),undefined);
});
