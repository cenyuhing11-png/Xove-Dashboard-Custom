import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { PROJECT_ROOT } from './vaultPaths.ts';

class Element {
	children: Element[] = []; text=''; cls=''; events: Record<string, ()=>void>={};
	createEl(_:string,o:any={}){const e=new Element();e.text=o.text??'';e.cls=o.cls??'';this.children.push(e);return e;}
	createDiv(o:any={}){return this.createEl('div',o);}addClass(){}focus(){}empty(){this.children=[];}
	addEventListener(event:string,fn:()=>void){this.events[event]=fn;}
	all():Element[]{return[this,...this.children.flatMap(e=>e.all())];}
}
const code=buildSync({entryPoints:[fileURLToPath(new URL('../views/ProcessStatusAction.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['obsidian']}).outputFiles[0]!.text;
function fixture(){
	const path=`${PROJECT_ROOT}/示例/示例.md`;let content='---\n类型: 项目\n项目ID: test-id\n状态: 进行中\n---\n## 项目任务\n- [ ] A\n';let writes=0;
	const modals:any[]=[];
	class File{path:string;constructor(path:string){this.path=path;}}const file=new File(path);
	class Modal{contentEl=new Element();open(){modals.push(this);(this as any).onOpen();}close(){(this as any).onClose();}}
	const yaml=(s:string)=>Object.fromEntries(s.split('\n').filter(Boolean).map(l=>{const i=l.indexOf(':');if(i<0)throw Error('fixture YAML');return[l.slice(0,i),l.slice(i+1).trim()];}));
	const app={vault:{getAbstractFileByPath:(p:string)=>p===file.path?file:undefined,read:async()=>content,process:async(_:File,update:(c:string)=>string)=>{const changed=update(content);content=changed;writes++;}}};
	const module:{exports:any}={exports:{}};runInNewContext(code,{module,exports:module.exports,require:(id:string)=>{assert.equal(id,'obsidian');return{Modal,TFile:File,parseYaml:yaml};}});
	const source={sourceFile:path,processType:'project',projectId:'test-id'};const change=(status:string)=>module.exports.requestProcessStatusChange(app,source,status) as Promise<void>;
	return{change,file,modals,content:()=>content,writes:()=>writes};
}
const tick=()=>new Promise(r=>setImmediate(r));
function button(m:any,text:string){const e=m.contentEl.all().find((e:Element)=>e.text===text);assert.ok(e,text);e.events.click();}
test('Completion uses the original confirmation shell with exact count and non-danger action',async()=>{
	const f=fixture(),p=f.change('已完成');await tick();const m=f.modals[0];assert.ok(m.contentEl.all().some((e:Element)=>e.text==='还有 1 项任务未完成，仍标记为已完成吗？'));assert.ok(m.contentEl.all().some((e:Element)=>e.text==='仍然完成'&&e.cls.includes('--primary')));button(m,'仍然完成');await p;assert.equal(f.writes(),1);assert.ok(f.content().includes('状态: 已完成'));assert.ok(f.content().includes('- [ ] A'));
});
test('Confirmation cancel closes without writing and releases the per-file lock',async()=>{
	const f=fixture(),before=f.content(),p=f.change('已完成');await tick();button(f.modals[0],'取消');await p;assert.equal(f.writes(),0);assert.equal(f.content(),before);await f.change('暂停');assert.equal(f.writes(),1);
});
test('Esc or outside-close is cancellation, not an unresolved status operation',async()=>{
	const f=fixture(),p=f.change('已完成');await tick();f.modals[0].close();await p;assert.equal(f.writes(),0);await f.change('归档');assert.equal(f.writes(),1);
});
test('A second action cannot bypass an outstanding completion confirmation',async()=>{
	const f=fixture(),p=f.change('已完成');await tick();await assert.rejects(f.change('归档'),/正在修改/);assert.equal(f.writes(),0);f.modals[0].close();await p;
});
test('Moved source during confirmation is never written at its stale path',async()=>{
	const f=fixture(),p=f.change('已完成');await tick();f.file.path+='-moved';button(f.modals[0],'仍然完成');await assert.rejects(p,/移动或替换/);assert.equal(f.writes(),0);
});
test('Archive never opens confirmation and preserves all task checkboxes',async()=>{
	const f=fixture(),before=f.content();await f.change('归档');assert.equal(f.modals.length,0);assert.equal(f.content(),before.replace('状态: 进行中','状态: 归档'));
});
test('Existing metadata subscriptions refresh all ProjectViews and the home after a status write',()=>{
	for(const file of ['../views/ProjectView.ts','../views/DashboardView.ts']){const s=readFileSync(new URL(file,import.meta.url),'utf8');assert.ok(s.includes("metadataCache.on('changed'"));assert.ok(s.includes("metadataCache.on('resolved'"));}
	const action=readFileSync(new URL('../views/ProcessStatusAction.ts',import.meta.url),'utf8');assert.ok(action.includes('app.vault.process'));assert.equal(action.includes('saveSettings'),false);assert.equal(action.includes('trashFile'),false);
});
