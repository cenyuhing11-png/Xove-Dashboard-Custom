import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { EmbeddedTaskIndex } from './embeddedTasks.ts';
import { renderTaskProgressPill, updateTaskProgressPill } from '../views/ProcessTaskProgress.ts';

class Element {
	children:Element[]=[];parent?:Element;classes=new Set<string>();text='';dataset:Record<string,string>={};attrs:Record<string,string>={};events:Record<string,Function[]>={};scrollTop=0;disabled=false;checked=false;open=false;title='';tag:string;
	onclick:(e?:any)=>void=()=>{};onchange:()=>void=()=>{};ontoggle:()=>void=()=>{};onkeydown:(e:any)=>void=()=>{};
	constructor(tag='div'){this.tag=tag;}
	get parentElement(){return this.parent;}
	get textContent():string{return this.text+this.children.map(e=>e.textContent).join(' ');}
	createEl(tag:string,o:any={}){const e=new Element(tag);e.text=o.text??'';for(const c of(o.cls??'').split(' ').filter(Boolean))e.classes.add(c);for(const[k,v]of Object.entries(o.attr??{}))e.setAttribute(k,String(v));this.appendChild(e);return e;}
	createDiv(o:any={}){return this.createEl('div',o);}createSpan(o:any={}){return this.createEl('span',o);}
	appendChild(e:Element){e.parent=this;this.children.push(e);return e;}addClass(c:string){this.classes.add(c);}removeClass(c:string){this.classes.delete(c);}closest(){return this;}
	setText(text:string){this.text=text;}setAttribute(k:string,v:string){this.attrs[k]=v;}addEventListener(k:string,fn:Function){(this.events[k]??=[]).push(fn);}
	empty(){this.children.forEach(e=>e.parent=undefined);this.children=[];}all():Element[]{return[this,...this.children.flatMap(e=>e.all())];}
	querySelectorAll(selector:string){return this.all().filter(e=>selector.startsWith('.')?e.classes.has(selector.slice(1)):e.tag===selector);}querySelector(selector:string){return this.querySelectorAll(selector)[0];}
}
const code=buildSync({entryPoints:[fileURLToPath(new URL('../views/ProcessTasksModal.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['obsidian']}).outputFiles[0]!.text;
async function fixture(type:'learning'|'project'='learning',empty=false){
	const path=type==='learning'?'01-学习与资料/示例.md':'03-项目与作品/示例/示例.md';
	const heading=type==='learning'?'学习任务':'项目任务';
	let content=`---\n类型: ${type==='learning'?'学习主题':'项目'}\n---\n\n## ${heading}\n${empty?'':'- [ ] 待完成一\n- [ ] 待完成二\n- [x] 已完成一\n'}\n## 备注\n不得更改\n`;
	let ids=0,full=0;const opened:string[]=[];const listeners=new Set<()=>void>();
	const index=new EmbeddedTaskIndex({paths:()=>[path],read:async()=>content,process:async(_p,update)=>{content=update(content);},ensureDaily:async()=>{throw Error('Must not create a daily file');}},()=>`test-${++ids}`);
	const store={bySource:(p:string)=>index.bySource(p),subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);},refresh:async()=>{await index.refresh();listeners.forEach(fn=>fn());},complete:async(t:any,done:boolean)=>{await index.complete(t,done);listeners.forEach(fn=>fn());}};
	await store.refresh();
	class File {path=path;}
	const app={vault:{getAbstractFileByPath:()=>new File()},workspace:{getLeaf:()=>({openFile:async(f:any)=>opened.push(f.path)})}};
	class Modal {app:any;contentEl=new Element();containerEl=new Element();constructor(a:any){this.app=a;}open(){(this as any).onOpen();}close(){(this as any).onClose();}}
	const module:{exports:any}={exports:{}};runInNewContext(code,{module,exports:module.exports,require:()=>({Modal,TFile:File,Notice:class{}})});
	const modal=new module.exports.ProcessTasksModal(app,store,{name:'示例进程',processType:type,sourceFile:path},()=>full++);modal.open();await store.refresh();
	return{modal,store,path,root:modal.contentEl as Element,listeners,opened,content:()=>content,full:()=>full};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('Progress pill shows 3 / 8 without percentage, checkmark or large progress bar',()=>{const root=new Element();const pill=renderTaskProgressPill(root as any,'示例','a.md',8,3,()=>{}) as any;assert.equal(pill.text,'3 / 8');assert.ok(pill.classes.has('po-count'));assert.ok(pill.classes.has('ad-modal-btn'));assert.equal(pill.disabled,false);});
test('Completed pill shows 8 / 8 and remains clickable',()=>{let opened=0;const pill=renderTaskProgressPill(new Element() as any,'示例','a.md',8,8,()=>opened++) as any;pill.onclick({stopPropagation(){}});assert.equal(pill.text,'8 / 8');assert.equal(opened,1);});
test('Zero-task pill is disabled and never opens a preview',()=>{let opened=0;const pill=renderTaskProgressPill(new Element() as any,'示例','a.md',0,0,()=>opened++) as any;pill.onclick({stopPropagation(){}});assert.equal(pill.text,'暂无任务');assert.equal(pill.disabled,true);assert.equal(opened,0);});
test('Pill pointer and keyboard interactions stop card detail bubbling',()=>{let opens=0,stops=0;const pill=renderTaskProgressPill(new Element() as any,'示例','a.md',8,3,()=>opens++) as any;pill.onclick({stopPropagation:()=>stops++});pill.onkeydown({key:'Enter',stopPropagation:()=>stops++});assert.equal(opens,1);assert.equal(stops,2);});
test('Progress update patches the same button and its accessibility label',()=>{const pill=renderTaskProgressPill(new Element() as any,'示例','a.md',8,3,()=>{}) as any;updateTaskProgressPill(pill,'示例',8,4);assert.equal(pill.text,'4 / 8');assert.ok(pill.attrs['aria-label'].includes('4 / 8'));});
for(const type of ['learning','project'] as const)test(`Quick modal reads ${type} Embedded Tasks only and uses author shell`,async()=>{const f=await fixture(type);assert.ok(f.root.classes.has('ad-task-modal'));assert.ok(f.modal.containerEl.classes.has('dashboard-modal'));assert.equal(f.root.querySelectorAll('.mx-task-row').length,3);assert.ok(f.root.textContent.includes('任务进度：1 / 3'));assert.equal(f.root.textContent.includes('不得更改'),false);f.modal.close();});
test('Pending task group is expanded with all pending rows',async()=>{const f=await fixture();const pending=f.root.querySelectorAll('.ad-update-block')[0]!;assert.ok(pending.textContent.includes('待完成 2'));assert.equal(pending.querySelectorAll('input').length,2);f.modal.close();});
test('Completed tasks are folded by default and can be expanded',async()=>{const f=await fixture();const details=f.root.querySelector('details')!;assert.equal(details.open,false);assert.ok(details.querySelector('summary')!.text.includes('已完成 1'));details.open=true;details.ontoggle();await f.store.refresh();assert.equal(f.root.querySelector('details')!.open,true);f.modal.close();});
test('Quick checkbox uses the real EmbeddedTaskIndex to write original Markdown',async()=>{const f=await fixture();const check=f.root.querySelectorAll('input')[0]!;check.checked=true;check.onchange();await flush();assert.match(f.content(),/- \[x\] 待完成一 <!-- mx-task:test-1 -->/);assert.ok(f.content().endsWith('## 备注\n不得更改\n'));assert.ok(f.root.textContent.includes('任务进度：2 / 3'));f.modal.close();});
test('Checkbox refresh moves a task into the completed group without opening detail',async()=>{const f=await fixture();const check=f.root.querySelectorAll('input')[0]!;check.checked=true;check.onchange();await flush();assert.ok(f.root.querySelectorAll('.ad-update-block')[0]!.textContent.includes('待完成 1'));assert.ok(f.root.querySelector('summary')!.text.includes('已完成 2'));assert.equal(f.full(),0);assert.equal(f.root.querySelector('details')!.open,false);f.modal.close();});
test('Unchecking an expanded completed task restores pending state',async()=>{const f=await fixture();const detail=f.root.querySelector('details')!;detail.open=true;detail.ontoggle();const check=detail.querySelector('input')!;check.checked=false;check.onchange();await flush();assert.ok(f.root.textContent.includes('任务进度：0 / 3'));assert.ok(f.root.textContent.includes('待完成 3'));assert.equal(f.root.querySelector('details')!.open,true);f.modal.close();});
test('Task text opens its source Markdown and closes only the preview',async()=>{const f=await fixture();f.root.querySelector('.mx-task-link')!.onclick();await flush();assert.deepEqual(f.opened,[f.path]);assert.equal(f.listeners.size,0);assert.equal(f.full(),0);});
test('Full detail footer closes preview and invokes supplied existing detail route',async()=>{const f=await fixture();f.root.querySelectorAll('button').find(e=>e.text==='打开完整详情 →')!.onclick();assert.equal(f.full(),1);assert.equal(f.listeners.size,0);});
test('Quick modal contains no goals, resources, Properties or date editing controls',async()=>{const f=await fixture();for(const label of ['学习目标','项目目标','项目资料','当前资源','过程记录','最终成果','Properties','开始日期','截止日期'])assert.equal(f.root.textContent.includes(label),false);assert.equal(f.root.querySelectorAll('textarea').length,0);f.modal.close();});
test('Empty tasks safely show 暂无任务 and empty groups, no file writes',async()=>{const f=await fixture('project',true);const before=f.content();assert.ok(f.root.textContent.includes('暂无任务'));assert.ok(f.root.textContent.includes('待完成 0'));assert.ok(f.root.textContent.includes('已完成 0'));assert.equal(f.root.querySelectorAll('input').length,0);assert.equal(f.content(),before);f.modal.close();});
test('Closing and reopening quick modal releases listeners and resets collapse',async()=>{const f=await fixture();for(let i=0;i<4;i++){const d=f.root.querySelector('details')!;d.open=true;d.ontoggle();f.modal.close();assert.equal(f.listeners.size,0);f.modal.open();assert.equal(f.listeners.size,1);assert.equal(f.root.querySelector('details')!.open,false);}f.modal.close();await f.store.refresh();assert.equal(f.root.children.length,0);});
test('Task refresh preserves scroll position within the modal',async()=>{const f=await fixture();f.root.querySelector('.mx-quick-tasks__body')!.scrollTop=125;await f.store.refresh();assert.equal(f.root.querySelector('.mx-quick-tasks__body')!.scrollTop,125);f.modal.close();});
test('Quick tasks have bounded internal scrolling and fixed outer sections',()=>{const css=readFileSync(new URL('../../styles.css',import.meta.url),'utf8');assert.ok(css.includes('.ad-task-modal.mx-quick-tasks { overflow: hidden; }'));assert.ok(/\.mx-quick-tasks__body \{[^}]*min-height: 0;[^}]*overflow-y: auto/.test(css));assert.ok(css.includes('.mx-quick-tasks > :not(.mx-quick-tasks__body) { flex-shrink: 0; }'));assert.ok(css.includes('max-height: 80vh'));});
