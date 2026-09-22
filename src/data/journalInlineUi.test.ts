import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as calendar from './planWorkspace.ts';
import * as narrative from './longTermNarrative.ts';
import * as time from './timeTrace.ts';
import * as review from './journalReview.ts';
import * as inline from './journalInline.ts';
import { planTemplate } from './planning.ts';
import { journalTemplate } from './journal.ts';
class El {
 children: El[]=[]; attrs: Record<string,string>={}; classes=new Set<string>(); value=''; hidden=false; textContent=''; style: Record<string,string>={}; scrollHeight=40;
 listeners=new Map<string,((e:any)=>unknown)[]>(); onclick?:()=>unknown;
 createEl(_tag:string,o:any={}){const e=new El();e.textContent=o.text??'';e.attrs=o.attr??{};for(const c of (o.cls??'').split(' '))e.classes.add(c);this.children.push(e);return e;}
 createDiv(o:any={}){return this.createEl('div',o);}createSpan(o:any={}){return this.createEl('span',o);}
 addClass(c:string){c.split(' ').forEach(x=>this.classes.add(x));}
 setAttribute(k:string,v:string){this.attrs[k]=v;}
 querySelector(q:string){return this.all().find(e=>e.classes.has(q.slice(1)));}
 toggleClass(c:string,on:boolean){if(on)this.classes.add(c);else this.classes.delete(c);}empty(){this.children=[];}focus(){}
 addEventListener(k:string,fn:(e:any)=>unknown){this.listeners.set(k,[...(this.listeners.get(k)??[]),fn]);}
 fire(k:string,event:any={}){for(const f of this.listeners.get(k)??[])f(event);}
 all():El[]{return this.children.flatMap(c=>[c,...c.all()]);}
}
function load(file:string,imports:Record<string,any>={},globals:Record<string,any>={}){const exports:any={};runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText,{exports,require:(id:string)=>imports[id]??(id==='obsidian'?{Component:class{},ItemView:class{},TFile:class{},MarkdownRenderer:{render:async()=>{}}}:{}),setTimeout,clearTimeout,...globals});return exports;}
const monthShell=load('../components/timeTrace/MonthCalendar.ts',{'../../data/planWorkspace':calendar,'../../data/timeTrace':time});
const {JournalInlineEditor}=load('../components/journal/JournalInlineEditor.ts',{'../../data/journalInline':inline});
function fixture(){let text=journalTemplate('day',new Date('2036-04-18T12:00:00'));let writes=0;const doc=new inline.JournalInlineDocument({read:async()=>text,ensure:async()=>{},process:async fn=>{text=fn(text);writes++;}});return{doc,text:()=>text,writes:()=>writes};}
const settle=()=>new Promise(r=>setTimeout(r,15));
test('actual textarea blur and Cmd+Enter handlers flush Markdown and keep the element mounted',async()=>{const f=fixture(),root=new El();const editor=new JournalInlineEditor({}, {}, f.doc,()=>'',()=>{});await editor.mount(root,'day');const input=root.all().find(e=>e.attrs['data-journal-field']==='今日日记')!;input.value='中文 **Markdown**';input.fire('input');assert.equal(f.writes(),0);input.fire('blur');await settle();assert.equal(inline.sectionValue(f.text(),'今日日记'),'中文 **Markdown**');input.value='second';input.fire('input');let prevented=false;input.fire('keydown',{key:'Enter',metaKey:true,preventDefault:()=>prevented=true});await settle();assert.ok(prevented);assert.equal(inline.sectionValue(f.text(),'今日日记'),'second');assert.ok(root.all().includes(input));await editor.destroy();});
test('actual component destroy flushes all dirty section fields',async()=>{const f=fixture(),root=new El();const editor=new JournalInlineEditor({}, {}, f.doc,()=>'',()=>{});await editor.mount(root,'day');for(const e of root.all().filter(e=>['今日日记','今日回看'].includes(e.attrs['data-journal-field']??''))){e.value='pending';e.fire('input');}assert.equal(await editor.destroy(),true);assert.equal(inline.sectionValue(f.text(),'今日日记'),'pending');assert.equal(inline.sectionValue(f.text(),'今日回看'),'pending');});
test('actual focus navigation waits for successful flush and refuses conflict navigation',async()=>{const {PlanWorkspaceRenderer}=load('../views/PlanView.ts');const r=Object.create(PlanWorkspaceRenderer.prototype);let resolve!:(v:boolean)=>void;let changed=false;let rendered=0;r.inlineTransition=Promise.resolve();r.inlineEditor={flush:()=>new Promise<boolean>(x=>resolve=x),destroy:async()=>true};r.renderPlanContent=async()=>{rendered++;};r.navigateInline(()=>changed=true);await Promise.resolve();assert.equal(changed,false);resolve(false);await r.inlineTransition;assert.equal(changed,false);assert.equal(rendered,0);r.inlineEditor={flush:async()=>true,destroy:async()=>true};r.navigateInline(()=>changed=true);await r.inlineTransition;assert.equal(changed,true);assert.equal(rendered,1);});
test('overview actual 42-day Monday-first grid excludes all task rendering and only routes on click',async()=>{const {PlanWorkspaceRenderer}=load('../views/PlanView.ts',{'../components/timeTrace/JournalWeekFlow':{JournalWeekFlow:class { setCollapsed(){} constructor(parent:any,options:any){monthShell.renderMonthCalendar(parent,{...options.visible,journal:true,onSelect:options.onSelect,content:()=>{}});} }}});const r=Object.create(PlanWorkspaceRenderer.prototype);r.timeState={visible:{year:2036,month:4},focus:{kind:'day',date:'2036-04-18'}};r.generation=1;const root:any=new El();root.isConnected=true;let chosen:Date|undefined;r.setDayFocus=(d:Date)=>chosen=d;await r.renderJournalOverview(root,[],1);const days=root.all().filter((e:El)=>e.classes.has('mx-journal-overview-day'));assert.equal(days.length,42);assert.equal(new Date(days[0].attrs['data-date']+'T12:00:00').getDay(),1);assert.equal(root.all().some((e:El)=>/☐/.test(e.textContent)),false);days[8].onclick();assert.equal(chosen?.getDate(),Number(days[8].attrs['data-date'].slice(-2)));});
test('mobile overview and editors have scoped width/scroll styles without a fixed editor footer',()=>{const css=readFileSync(new URL('../../styles.css',import.meta.url),'utf8');assert.match(css,/body\.is-mobile\.is-phone \.mx-journal-overview-grid \{[^}]*width: 100%/);assert.match(css,/body\.is-mobile\.is-phone \.mx-journal-inline-input \{[^}]*font-size: 16px/);assert.match(css,/-webkit-line-clamp: 2/);assert.doesNotMatch(css,/\.mx-journal-inline-state \{[^}]*position: fixed/);});

for(const kind of ['week','month','quarter','year'] as const)test(`${kind} actual plan component mounts canonical fields and saves on blur`,async()=>{
 let text=planTemplate(kind,new Date('2038-06-18'));const doc=new inline.JournalInlineDocument({read:async()=>text,ensure:async()=>{},process:async fn=>{text=fn(text);}});
 const root=new El();const editor=new JournalInlineEditor({}, {}, doc,()=>'',()=>{});await editor.mount(root,kind,true);
 const fields=root.all().filter(e=>e.classes.has('mx-journal-inline-input'));assert.equal(fields.length,inline.editablePlanSections(kind).length);
 fields[0]!.value='MXPOL 中文计划';fields[0]!.fire('input');fields[0]!.fire('blur');await settle();assert.equal(inline.sectionValue(text,inline.editablePlanSections(kind)[0]!),fields[0]!.value);await editor.destroy();
});
test('inline grow follows initial value, long input and external refresh without a height cap',async()=>{
 let text=journalTemplate('day',new Date('2038-06-18'));const doc=new inline.JournalInlineDocument({read:async()=>text,ensure:async()=>{},process:async fn=>{text=fn(text);}});const root=new El();const editor=new JournalInlineEditor({}, {}, doc,()=>'',()=>{});await editor.mount(root,'day');
 const input=root.all().find(e=>e.attrs['data-journal-field']==='今日日记')!;assert.equal(input.style.height,'40px');input.scrollHeight=1200;input.value='long';input.fire('input');assert.equal(input.style.height,'1200px');await editor.flush();
 text=inline.patchJournalSection(text,'今日日记','external',inline.sectionSnapshot(text,'今日日记'));input.scrollHeight=900;await editor.refresh();assert.equal(input.value,'external');assert.equal(input.style.height,'900px');assert.ok(!root.all().some(e=>e.textContent==='记下'));await editor.destroy();
});
test('inline CSS removes form borders scrollbars resize and mobile height caps',()=>{
 const css=readFileSync(new URL('../../styles.css',import.meta.url),'utf8');const rule=css.match(/textarea\.mx-journal-inline-input \{([^}]+)\}/)![1]!;
 for(const property of ['background: transparent','border: none','resize: none','overflow-y: hidden','max-height: none','scrollbar-width: none'])assert.ok(rule.includes(property));assert.match(css,/textarea\.mx-journal-inline-input::-webkit-scrollbar \{ display: none/);
 const source=readFileSync(new URL('../components/journal/JournalInlineEditor.ts',import.meta.url),'utf8');assert.match(source,/ResizeObserver/);assert.match(source,/observer.disconnect/);assert.match(source,/removeEventListener\('resize'/);
});

test('resize observer and window resize regrow loaded editors and disconnect on destroy',async()=>{
 const observers:Array<{callback:(entries:any[])=>void,disconnected:boolean}>=[];const events=new Map<string,Set<()=>void>>();
 class Observer{disconnected=false;callback:(entries:any[])=>void;constructor(callback:(entries:any[])=>void){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 const {JournalInlineEditor:Editor}=load('../components/journal/JournalInlineEditor.ts',{'../../data/journalInline':inline},{ResizeObserver:Observer,window:{addEventListener:(k:string,f:()=>void)=>{if(!events.has(k))events.set(k,new Set());events.get(k)!.add(f);},removeEventListener:(k:string,f:()=>void)=>events.get(k)!.delete(f)}});
 const f=fixture(),root=new El();const editor=new Editor({}, {}, f.doc,()=>'',()=>{});await editor.mount(root,'day');const input=root.all().find(e=>e.attrs['data-journal-field']==='title')!;input.scrollHeight=800;observers[0]!.callback([{contentRect:{width:220}}]);assert.equal(input.style.height,'800px');input.scrollHeight=400;for(const callback of events.get('resize')!)callback();assert.equal(input.style.height,'400px');await editor.destroy();assert.ok(observers.every(o=>o.disconnected));assert.equal(events.get('resize')!.size,0);
});


test('Day title has a lightweight label and its existing autosave editor',async()=>{
 const f=fixture(),root=new El();const editor=new JournalInlineEditor({}, {}, f.doc,()=>'',()=>{});await editor.mount(root,'day');
 assert.equal(root.all().find(e=>e.classes.has('mx-journal-title-label'))?.textContent,'标题：');
 const title=root.all().find(e=>e.attrs['data-journal-field']==='title')!;title.value='MXPOL 新标题';title.fire('input');title.fire('blur');await settle();assert.ok(f.text().includes('MXPOL 新标题'));await editor.destroy();
});


for(const focus of [
 {kind:'day',date:'2026-09-22'},
 {kind:'week',isoYear:2026,isoWeek:39,anchorDate:'2026-09-21'},
 {kind:'month',year:2026,month:9},
 {kind:'quarter',year:2026,quarter:3},
 {kind:'year',year:2026},
] as const)test(`${focus.kind} actual record renders time and navigation in header with no body heading`,async()=>{
 const {PlanWorkspaceRenderer}=load('../views/PlanView.ts',{
  '../data/journalReview':{...review,discoverReviewRecords:async()=>[]},
  '../data/journalInline':inline,
  '../data/journal':{hasMeaningfulJournalContent:()=>true},
  '../components/journal/JournalInlineEditor':{JournalInlineEditor,journalInlineFiles:()=>({read:async()=>'',ensure:async()=>{},process:async()=>{}})},
 });
 const r=Object.create(PlanWorkspaceRenderer.prototype);Object.assign(r,{timeState:{focus,visible:{year:2026,month:9}},reviewView:'record',mode:'review',generation:1,existingFile:()=>undefined});
 const header=new El(),body:any=new El();body.isConnected=true;await r.renderReview(header,body,1);
 assert.equal(header.children[0]!.classes.has('mx-journal-review-time'),true);
 assert.equal(header.children[0]!.textContent,review.journalPlanningReviewHeaderTime({focus,visible:{year:2026,month:9}},'record'));
 assert.equal(header.children[1]!.classes.has('mx-journal-review-tools'),true);
 assert.deepEqual(header.children[1]!.children.map(e=>e.textContent),['日记一览','计划一览','最近记录','搜索','随机回顾','过去的今天']);
 assert.equal(body.all().some((e:El)=>e.classes.has('mx-journal-review-record-head')||e.classes.has('mx-journal-review-time')||e.textContent===review.journalPlanningReviewHeaderTime({focus,visible:{year:2026,month:9}},'record')),false);
 const content=body.children[0];assert.ok(content.children[0].classes.has(focus.kind==='day'?'is-reading':'mx-journal-review-compare'));
 await r.inlineEditor.destroy();await r.planInlineEditor?.destroy();
});

test('narrow header keeps time beside tools above the divider without a body placeholder',()=>{
 const css=readFileSync(new URL('../../styles.css',import.meta.url),'utf8');
 assert.match(css,/\.mx-journal-review-toolbar\.has-record-time \{ flex-wrap: nowrap; align-items: center; block-size: auto/);
 assert.match(css,/\.mx-journal-review-time \{[^}]*white-space: nowrap/);
 assert.match(css,/\.has-record-time \.mx-journal-review-tools \{[^}]*width: auto; margin-left: auto/);
 assert.match(css,/@container \(max-width: 720px\) \{\s*\.mx-journal-review-toolbar\.has-record-time[\s\S]*justify-content: flex-end/);
 assert.doesNotMatch(css,/mx-journal-review-record-head/);
});


for(const submode of ['overview','plans','recent','search','pastToday','record'] as const)test(`${submode} actual toolbar always includes shared time and random action`,()=>{
 const {PlanWorkspaceRenderer}=load('../views/PlanView.ts',{'../data/journalReview':review});const r=Object.create(PlanWorkspaceRenderer.prototype);
 r.timeState={visible:{year:2026,month:9},focus:{kind:'day',date:'2026-09-22'}};r.reviewView=submode;const header=new El();r.renderReviewToolbar(header,[]);
 assert.equal(header.children[0]!.textContent,submode==='overview'||submode==='plans'?'2026 年 9 月':'2026 年 9 月 22 日');
 assert.ok(header.children.find(e=>e.classes.has('mx-journal-review-tools'))!.children.some(e=>e.textContent==='随机回顾'));
 if(submode==='overview'){r.timeState.visible.month=10;const next=new El();r.renderReviewToolbar(next,[]);assert.equal(next.children[0]!.textContent,'2026 年 10 月');}
});

// Production file adapter exercised only with fake files and an in-memory Vault.
for(const kind of ['day','week','month','quarter','year'] as const)for(const plan of kind==='day'?[false]:[false,true])test(`production reader loads ${kind} ${plan?'plan':'review'} without fixture restrictions`,async()=>{
 class File{path='ordinary/document.md';}const file=new File();let reads=0;const raw=plan?planTemplate(kind as 'week'|'month'|'quarter'|'year',new Date('2038-06-18')):journalTemplate(kind,new Date('2038-06-18'));
 const {journalInlineFiles}=load('../components/journal/JournalInlineEditor.ts',{obsidian:{TFile:File}});
 const app={vault:{getAbstractFileByPath:()=>file,read:async(f:File)=>{assert.equal(f,file);reads++;return raw;}}};
 const doc=new inline.JournalInlineDocument(journalInlineFiles(app,()=>file.path,async()=>{}));const root=new El();const editor=new JournalInlineEditor(app,{},doc,()=>file.path,()=>{});await editor.mount(root,kind,plan);
 assert.ok(reads>0);assert.ok(root.all().some(e=>e.classes.has('mx-journal-inline-input')));assert.ok(!root.all().some(e=>e.classes.has('mx-journal-inline-error')));await editor.destroy();
});

test('fixture-only reader rejects unknown paths without modifying production app',async()=>{
 const {fixtureOnlyApp}=await import('./testing/fixtureReader.ts');let reads=0;const real={vault:{getMarkdownFiles:()=>[{path:'fixture.md'},{path:'other.md'}],read:async(_file?:{path:string})=>{reads++;return 'fake';},cachedRead:async(_file?:{path:string})=>{reads++;return 'fake';}}};const fixture=fixtureOnlyApp(real,new Set(['fixture.md']));
 assert.deepEqual(fixture.vault.getMarkdownFiles(),[{path:'fixture.md'}]);assert.equal(await fixture.vault.read({path:'fixture.md'}),'fake');assert.throws(()=>fixture.vault.read({path:'other.md'}),/Blocked non-fixture read/);assert.throws(()=>fixture.vault.cachedRead({path:'other.md'}),/Blocked non-fixture read/);assert.equal(reads,1);assert.notEqual(fixture,real);assert.equal(await real.vault.read(),'fake');
 const bundle=readFileSync(new URL('../../main.js',import.meta.url),'utf8');assert.doesNotMatch(bundle,/Blocked non-fixture read|fixtureOnlyApp/);
});

for(const value of ['😉准备收拾心情，重新出发','普通中文标题','English title','长标题第一行\n第二行继续'])test(`title shares one baseline row: ${value}`,async()=>{
 const f=fixture(),root=new El(),editor=new JournalInlineEditor({}, {}, f.doc,()=>'',()=>{});await editor.mount(root,'day');const row=root.all().find(e=>e.classes.has('mx-journal-title-row'))!;assert.equal(row.children[0]!.textContent,'标题：');const input=row.children[1]!;assert.equal(input.attrs['data-journal-field'],'title');input.value=value;input.scrollHeight=100;input.fire('input');assert.equal(input.style.height,'100px');await editor.destroy();
});
test('calendar flow baseline and overview scroll styles preserve the intended boundaries',()=>{
 const css=readFileSync(new URL('../../styles.css',import.meta.url),'utf8');const view=readFileSync(new URL('../views/PlanView.ts',import.meta.url),'utf8');
 assert.match(css,/\.mx-month-date-row \{ flex: 0 0 25px; min-height: 25px/);assert.match(css,/\.mx-month-calendar \.mx-month-date \{ position: static/);assert.match(css,/\.mx-month-cell-content \{[^}]*overflow: hidden/);assert.match(css,/\.mx-journal-overview-summary \{[^}]*-webkit-line-clamp: 2/);
 assert.match(css,/\.mx-journal-title-row \{ display: flex; align-items: baseline/);assert.match(css,/\.mx-journal-title-row textarea[^}]*padding-top: 0; margin-top: 0/);
 assert.match(css,/\.is-journal-overview > \.po-main > \.mx-time-trace-section-body \{[^}]*overflow-y: auto; overflow-x: hidden/);assert.match(css,/body\.is-mobile\.is-phone \.dashboard-plugin \.mx-time-trace-section-body,[\s\S]*?overflow: visible/);
 assert.match(view,/container\.toggleClass\('is-journal-overview', this\.mode === 'review' && this\.reviewView === 'overview'\)/);
 assert.match(view,/this\.renderSidebar\(container\);[\s\S]*const main = container\.createDiv[\s\S]*const header = main\.createDiv[\s\S]*const body = main\.createDiv/);
 assert.doesNotMatch(css,/\.mx-month-(?:day|cell-content)[^{]*\{[^}]*overflow-y: auto/);
});

test('overview chevron defaults expanded, toggles grid class and keeps time and tools without persistence',()=>{
 const {PlanWorkspaceRenderer}=load('../views/PlanView.ts',{'../data/timeTrace':time,'../data/planWorkspace':calendar,'../data/journalReview':review,'../data/longTermNarrative':narrative});
 const r=new PlanWorkspaceRenderer({},{});r.reviewView='overview';r.timeState={visible:{year:2026,month:9},focus:{kind:'day',date:'2026-09-22'}};
 const root=new El(),header=root.createDiv();r.workspaceEl=root;const states:boolean[]=[];r.overviewFlow={setCollapsed:(value:boolean)=>states.push(value)};r.renderReviewToolbar(header,[]);
 const toggle=root.querySelector('.mx-overview-toggle')!,title=header.children[0],tools=root.querySelector('.mx-journal-review-tools');assert.equal(toggle.attrs['aria-expanded'],'true');
 toggle.onclick!();assert.equal(root.classes.has('is-overview-collapsed'),true);assert.equal(toggle.attrs['aria-expanded'],'false');assert.equal(toggle.textContent,'⌄');assert.equal(header.children[0],title);assert.equal(root.querySelector('.mx-journal-review-tools'),tools);
 toggle.onclick!();assert.equal(root.classes.has('is-overview-collapsed'),false);assert.equal(toggle.attrs['aria-expanded'],'true');assert.deepEqual(states,[true,false]);
 const fresh=new PlanWorkspaceRenderer({},{});assert.equal(fresh.overviewCollapsed,false);
});
