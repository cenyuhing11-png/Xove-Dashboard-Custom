import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { beginListModal, closeListModal, listEntry } from '../views/viewPrimitives.ts';

class Element {
	children: Element[]=[]; parent?:Element; classes=new Set<string>(); dataset:Record<string,string>={}; attrs:Record<string,string>={}; text=''; style:Record<string,string>={}; events:Record<string,(()=>void)[]>={};
	tag:string; constructor(tag='div'){this.tag=tag;}
	get firstChild():Element|null{return this.children[0]??null;} get parentElement():Element|undefined{return this.parent;}
	get textContent():string{return this.text+this.children.map(e=>e.textContent).join('');} set textContent(t:string){this.text=t;this.children=[];}
	createEl(tag:string,o:any={}){const e=new Element(tag);e.text=o.text??'';e.classes=new Set((o.cls??'').split(' ').filter(Boolean));for(const[k,v]of Object.entries(o.attr??{}))e.setAttribute(k,String(v));this.appendChild(e);return e;}
	createDiv(o:any={}){return this.createEl('div',o);} createSpan(o:any={}){return this.createEl('span',o);}
	appendChild(e:Element){e.remove();e.parent=this;this.children.push(e);return e;}
	replaceChildren(...elements:Element[]){this.empty();elements.forEach(e=>this.appendChild(e));}
	insertBefore(e:Element,other:Element){e.remove();e.parent=this;this.children.splice(this.children.indexOf(other),0,e);}
	after(e:Element){const p=this.parent!;e.remove();e.parent=p;p.children.splice(p.children.indexOf(this)+1,0,e);}
	remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=undefined;}
	empty(){this.children.forEach(e=>e.parent=undefined);this.children=[];}
	all():Element[]{return[this,...this.children.flatMap(e=>e.all())];}
	querySelectorAll(s:string){return this.all().filter(e=>s.split(',').some(v=>e.classes.has(v.trim().slice(1))));} querySelector(s:string){return this.querySelectorAll(s)[0];}
	setAttribute(k:string,v:string){this.attrs[k]=v;} removeAttribute(k:string){delete this.attrs[k];}
	addClass(c:string){this.classes.add(c);}removeClass(c:string){this.classes.delete(c);}toggleClass(c:string,on:boolean){on?this.addClass(c):this.removeClass(c);}
	addEventListener(k:string,fn:()=>void){(this.events[k]??=[]).push(fn);}click(){this.events.click?.forEach(fn=>fn());}
	setCssProps(){}getContext(){return null;}
	closest(){return this;}
}
const code=buildSync({entryPoints:[fileURLToPath(new URL('../components/workbench/WorkbenchShell.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['obsidian']}).outputFiles[0]!.text;
function fixture(){
	const timers=new Set<number>(),refs=new Set<any>();let sequence=0;const actions:string[]=[];let writes=0;
	class Component{private cleanups:Array<()=>void>=[];register(fn:()=>void){this.cleanups.push(fn);}registerEvent(ref:any){this.register(()=>refs.delete(ref));}registerInterval(id:number){this.register(()=>timers.delete(id));}load(){(this as any).onload();}unload(){(this as any).onunload();this.cleanups.forEach(fn=>fn());this.cleanups=[];}}
	const module:{exports:any}={exports:{}};const light={value:true};
	runInNewContext(code,{module,exports:module.exports,require:()=>({Component,Modal:class{},Notice:class{}}),DOMParser:class{parseFromString(){return{documentElement:new Element('svg')};}},
		document:{body:{classList:{contains:()=>light.value}}},window:{setInterval:()=>{const id=++sequence;timers.add(id);return id;},cancelAnimationFrame:()=>{},requestAnimationFrame:()=>0},
	});
	const events={on:(_name:string,fn:()=>void)=>{const ref={fn};refs.add(ref);return ref;}};
	const now=Date.now();const plugin={app:{vault:{...events,getMarkdownFiles:()=>[{stat:{ctime:now}}]},workspace:events},manifest:{version:'0.4.0-dev.1'},settings:{banner:{enabled:true,imageDataUrl:'',offsetY:0},theme:'auto',dashboardTitle:'我的工作台',boardEnabled:true},pageShells:new Set<any>(),shellTaskStore:{invalidate(){},scanAllTasks:async()=>[{status:'待办'},{status:'已完成'}]},saveSettings:async()=>{writes++;}};
	function shell(active='home'){const root=new Element();const body=root.createDiv({cls:'test-body'});const instance=new module.exports.WorkbenchShell(plugin,root,(action:string)=>actions.push(action),active);instance.load();return{root,body,instance};}
	return{plugin,light,shell,timers,refs,actions,writes:()=>writes};
}
test('Shared shell preserves original banner/pulse/header/nav order before page body',()=>{
	const f=fixture(),s=f.shell();const order=s.root.children.filter(e=>!['input','canvas'].includes(e.tag));assert.deepEqual(order.map(e=>[...e.classes][0]),['ad-banner','ad-pulse','ad-header','ad-toolbar','test-body']);s.instance.unload();
});
test('Home and project use identical brand/date/progress/pulse data and cover setting',async()=>{
	const f=fixture(),home=f.shell(),project=f.shell('all');await Promise.all([home.instance.updatePulse(),project.instance.updatePulse()]);
	for(const cls of ['ad-header','ad-pulse','ad-banner'])assert.equal(home.root.querySelector('.'+cls)!.textContent,project.root.querySelector('.'+cls)!.textContent);
	assert.ok(home.root.querySelector('.ad-pulse')!.textContent.includes('1 待处理'));assert.ok(home.root.querySelector('.ad-title')!.textContent.includes('夏知之 · 梦序'));
	home.instance.unload();project.instance.unload();
});
test('Eight shared navigation labels remain in the approved order',()=>{
	const f=fixture(),s=f.shell();assert.deepEqual(s.root.querySelectorAll('.ad-toolbar__btn').map(e=>e.textContent),['首页','时迹','进程','收件箱','新建日记','新建任务','新建进程','▦更多工具']);s.instance.unload();
});
test('Home, inbox and project active navigation are independent and persistent',()=>{
	const f=fixture(),home=f.shell(),project=f.shell('all');home.instance.setActive('opportunity');
	assert.equal(home.root.querySelectorAll('.ad-toolbar__btn').filter(e=>e.attrs['aria-current']==='page')[0]!.dataset.action,'opportunity');
	assert.equal(project.root.querySelectorAll('.ad-toolbar__btn').filter(e=>e.attrs['aria-current']==='page')[0]!.dataset.action,'all');home.instance.unload();project.instance.unload();
});
test('Repeated nav refresh never duplicates DOM or click callbacks',()=>{
	const f=fixture(),s=f.shell('all');for(let i=0;i<10;i++)s.instance.refreshNav();
	assert.equal(s.root.querySelectorAll('.ad-toolbar').length,1);assert.equal(s.root.querySelectorAll('.ad-header').length,1);
	s.root.querySelectorAll('.ad-toolbar__btn').find(e=>e.dataset.action==='task')!.click();assert.deepEqual(f.actions,['task']);s.instance.unload();
});
test('Shell unload and remount release listeners and clock intervals, preserving body',()=>{
	const f=fixture(),s=f.shell();const count=f.refs.size;assert.equal(count,5);assert.equal(f.timers.size,1);
	for(let i=0;i<5;i++){s.instance.unload();assert.equal(f.refs.size,0);assert.equal(f.timers.size,0);assert.deepEqual(s.root.children,[s.body]);s.instance.load();assert.equal(f.refs.size,count);assert.equal(f.timers.size,1);}
	s.instance.unload();assert.equal(f.plugin.pageShells.size,0);
});
test('Repeated banner off/on updates use one file picker without writing settings',()=>{
	const f=fixture(),s=f.shell();for(let i=0;i<4;i++){f.plugin.settings.banner.enabled=false;s.instance.refreshBanner();assert.equal(s.root.querySelectorAll('.ad-banner__fileinput').length,0);f.plugin.settings.banner.enabled=true;s.instance.refreshBanner();}
	assert.equal(s.root.querySelectorAll('.ad-banner').length,1);assert.equal(s.root.querySelectorAll('.ad-banner__fileinput').length,1);assert.equal(f.writes(),0);s.instance.unload();
});
test('Settings refresh uses shared theme/title/cover, not separate project formulas',()=>{
	const f=fixture(),s=f.shell();f.light.value=false;f.plugin.settings.dashboardTitle='夏知之 · 梦序';s.instance.refreshSettings();assert.equal(s.root.attrs['data-theme'],'dark');assert.equal(s.root.querySelectorAll('.ad-header').length,1);assert.equal(f.writes(),0);s.instance.unload();
});
test('Async pulse response cannot recreate DOM after shell is closed',async()=>{
	const f=fixture();let resolve:(v:unknown[])=>void=()=>{};f.plugin.shellTaskStore.scanAllTasks=()=>new Promise<any[]>(r=>resolve=r);const s=f.shell();s.instance.unload();resolve([{status:'待办'}]);await Promise.resolve();assert.deepEqual(s.root.children,[s.body]);
});
test('Only top-level project overview mounts shared shell, never project detail',()=>{
	const view=readFileSync(new URL('../views/ProjectView.ts',import.meta.url),'utf8');assert.ok(view.includes("'all');"));assert.ok(view.includes('this.removeChild(this.shell)'));assert.equal(view.includes("cls: 'ad-header'"),false);
	const home=readFileSync(new URL('../views/DashboardView.ts',import.meta.url),'utf8');assert.equal(home.includes('private renderHeader('),false);assert.equal(home.includes('private renderActions('),false);
});
test('Shared navigation reuses existing home leaf and explicitly transfers keyboard focus',()=>{
	const source=readFileSync(new URL('../main.ts',import.meta.url),'utf8');
	assert.ok(source.includes("getLeavesOfType(VIEW_TYPE)[0] ?? this.app.workspace.getLeaf('tab')"));
	assert.ok(source.includes('this.app.workspace.setActiveLeaf(leaf, { focus: true })'));
});
test('New list dialogs reuse author modal shell and title without Setting API',()=>{
	const modal={contentEl:new Element(),containerEl:new Element()};beginListModal(modal as any,'学习队列');
	assert.ok(modal.contentEl.classes.has('ad-task-modal'));assert.ok(modal.containerEl.classes.has('dashboard-modal'));assert.equal(modal.contentEl.querySelector('.ad-modal-title')!.textContent,'学习队列');closeListModal(modal as any);assert.equal(modal.contentEl.children.length,0);assert.equal(modal.containerEl.classes.has('dashboard-modal'),false);
});
test('Shared list entry keeps full metadata and original open callback',()=>{
	const parent=new Element();let opened=0;listEntry(parent as any,'【测试】主题','方向：设计 · 状态：学习中',()=>opened++);
	assert.equal(parent.querySelector('.ad-modal-hint')!.textContent,'方向：设计 · 状态：学习中');(parent.querySelector('.ad-modal-btn') as any).onclick();assert.equal(opened,1);assert.ok(parent.querySelector('.ad-update-block'));
});
test('Repeated modal render replaces title and content instead of stacking shells',()=>{
	const modal={contentEl:new Element(),containerEl:new Element()};for(let i=0;i<5;i++)beginListModal(modal as any,'全部任务');assert.equal(modal.contentEl.querySelectorAll('.ad-modal-title').length,1);
});
test('New list presentation preserves learning and journal selectors and source task completion',()=>{
	const learning=readFileSync(new URL('../views/LearningModals.ts',import.meta.url),'utf8');for(const call of ['ensureLearningNote(learningFiles(this.app), this.kind, input.value, resourceType)','queuedResources(scanLearning(this.app))','allLearningTopics(scanLearning(this.app))'])assert.ok(learning.includes(call));
	const journal=readFileSync(new URL('../views/JournalHistoryModal.ts',import.meta.url),'utf8');assert.ok(journal.includes('journalHistory(entries, this.mode)'));
	const tasks=readFileSync(new URL('../views/EmbeddedTaskModal.ts',import.meta.url),'utf8');const checkbox=readFileSync(new URL('../components/tasks/EmbeddedTaskCheckbox.ts',import.meta.url),'utf8');assert.ok(tasks.includes('renderEmbeddedTaskCheckbox(row, task, store)'));assert.ok(checkbox.includes('store.complete(task, check.checked)'));assert.ok(tasks.includes('this.store.bySource(this.path)'));assert.ok(tasks.includes('this.unsubscribe = undefined'));
});
