import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProcessRow } from '../views/ProcessRow.ts';
import { readFileSync } from 'node:fs';

class Node {
	tag: string; cls=''; text=''; dataset:Record<string,string>={}; attrs:Record<string,string>={}; children:Node[]=[]; onclick?: (e: any)=>void; onkeydown?: (e: any)=>void;
	constructor(tag='div'){this.tag=tag;}
	createEl(tag:string,options:any={}){const child=new Node(tag);child.cls=options.cls??'';child.text=options.text??'';child.attrs=options.attr??{};this.children.push(child);return child;}
}
for(const layout of ['table','inline'] as const)test(`shared ${layout} row preserves fields, identity and keyboard navigation`,()=>{
	const root=new Node();let opened=0;const fields=['meta','date','schedule','progress','menu'];
	const row=renderProcessRow(root as unknown as HTMLElement,{layout,key:'note.md',name:'进程',open:()=>opened++,fields:fields.map(key=>({key,render:cell=>{cell.createEl('span',{text:key});}}))}) as unknown as Node;
	assert.equal(row.tag,layout==='table'?'tr':'div');assert.equal(row.dataset.projectPath,'note.md');assert.deepEqual(row.children.slice(1).map(c=>c.children[0]!.text),fields);
	const name=row.children[0]!.children[0]!;assert.equal(name.tag,'a');assert.equal(name.text,'进程');const event={preventDefault(){},stopPropagation(){},key:'Enter'};name.onclick!(event);name.onkeydown!(event);assert.equal(opened,2);
});
test('shared rows omit optional fields and never invent a long-plan subtitle',()=>{const root=new Node();const row=renderProcessRow(root as unknown as HTMLElement,{layout:'inline',key:'x',name:'n',open(){},fields:[]}) as unknown as Node;assert.equal(row.children.length,1);assert.equal(row.children[0]!.children.length,1);});
test('table-only name extras remain separate from the primary link',()=>{const root=new Node();const row=renderProcessRow(root as unknown as HTMLElement,{layout:'table',key:'x',name:'n',open(){},fields:[],nameExtra:cell=>{cell.createEl('a',{text:'↳ 长期计划'});}}) as unknown as Node;assert.deepEqual(row.children[0]!.children.map(x=>x.text),['n','↳ 长期计划']);});
test('narrative menus expose edit only and retain existing Markdown writer',()=>{const source=readFileSync(new URL('../views/PlanView.ts',import.meta.url),'utf8');const menu=source.slice(source.indexOf('menuButton.onclick'),source.indexOf('const stages='));assert.match(menu,/编辑内容/);assert.doesNotMatch(menu,/删除|重命名|上移|下移/);assert.match(menu,/updateLongTermPlanMarkdown/);assert.match(menu,/updateNarrativeMarkdown/);});
test('primary long-plan row action locates process while detail remains in its menu',()=>{const source=readFileSync(new URL('../views/PlanView.ts',import.meta.url),'utf8');const row=source.slice(source.indexOf('private renderStageProcess'),source.indexOf('private renderUnassignedProcess'));assert.match(row,/locateProcess/);assert.match(row,/setTitle\('打开详情'\)/);assert.doesNotMatch(row,/查看进程|mx-process-long-term-link/);});
test('process list and kanban share the same lightweight long-plan link',()=>{const source=readFileSync(new URL('../views/ProjectBoard.ts',import.meta.url),'utf8');assert.match(source,/this\.renderLongTermLink\(card, item\)/);assert.match(source,/nameExtra: name => this\.renderLongTermLink\(name, item\)/);assert.match(source,/createEl\('a', \{ cls: 'mx-process-long-term-link'/);});
