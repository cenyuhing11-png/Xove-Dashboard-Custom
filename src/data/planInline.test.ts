import test from 'node:test';
import assert from 'node:assert/strict';
import { planTemplate, ensurePlan, planInfo } from './planning.ts';
import { editablePlanSections, JournalInlineDocument, JournalInlineDraft, fieldSnapshot, fieldValue, patchInlineSection, sectionValue } from './journalInline.ts';
import type { EditorField } from './journalInline.ts';
const date=new Date('2038-06-18T12:00:00');
for(const kind of ['week','month','quarter','year'] as const){
 for(const title of editablePlanSections(kind))test(`${kind} plan exact patch preserves other sections: ${title}`,()=>{
  const source=planTemplate(kind,date)+'\n## MXPOL extra\nkeep this exact\n';const f:EditorField={kind:'section',title};const value='MXPOL 中文 **内容**\nsecond line';
  const result=patchInlineSection(source,f,value,fieldSnapshot(source,f));assert.equal(sectionValue(result,title),value);
  assert.equal(result.slice(0,result.indexOf('## ')),source.slice(0,source.indexOf('## ')));assert.ok(result.endsWith('## MXPOL extra\nkeep this exact\n'));
  for(const other of editablePlanSections(kind).filter(x=>x!==title))assert.equal(sectionValue(result,other),sectionValue(source,other));
 });
 test(`${kind} missing plan creates lazily through canonical ensure on first input`,async()=>{
  const notes=new Map<string,string>();const dirs=new Set<string>();const path=planInfo(kind,date).path;
  const files={kind:(p:string):'file'|'folder'|undefined=>notes.has(p)?'file':dirs.has(p)?'folder':undefined,read:async(p:string)=>notes.get(p)!,createFolder:async(p:string)=>{dirs.add(p);},create:async(p:string,v:string)=>{notes.set(p,v);}};
  const doc=new JournalInlineDocument({read:async()=>notes.get(path)??'',ensure:async()=>{await ensurePlan(files,kind,date);},process:async fn=>{notes.set(path,fn(notes.get(path)!));}});
  const draft=new JournalInlineDraft(doc,{kind:'section',title:editablePlanSections(kind)[0]!},await doc.read());assert.equal(notes.size,0);
  draft.input('MXPOL lazily saved');assert.equal(await draft.flush(),true);assert.equal(notes.size,1);assert.equal(sectionValue(notes.get(path)!,editablePlanSections(kind)[0]!),draft.value);
 });
 test(`${kind} external target conflict retains local input while unrelated edits survive`,async()=>{
  let text=planTemplate(kind,date);const title=editablePlanSections(kind)[0]!;const f:EditorField={kind:'section',title};
  const doc=new JournalInlineDocument({read:async()=>text,ensure:async()=>{},process:async fn=>{text=fn(text);}});const draft=new JournalInlineDraft(doc,f,text);
  text+='\n## MXPOL external\nkeep\n';draft.input('local');assert.equal(await draft.flush(),true);assert.ok(text.endsWith('keep\n'));
  draft.input('local pending');text=patchInlineSection(text,f,'outside',fieldSnapshot(text,f));assert.equal(await draft.flush(),false);assert.equal(draft.state,'conflict');assert.equal(draft.value,'local pending');assert.equal(sectionValue(text,title),'outside');await draft.reload();assert.equal(draft.value,'outside');
 });
}
const annual:EditorField={kind:'section',title:'今年最想实现的突破',fallbackTitle:'年度核心突破'};
test('legacy annual heading reads fallback and converts only that heading in place',()=>{
 const source='---\ncustom: keep\n---\n## before\nA\n## 年度核心突破\nold\n## after\nB\n';assert.equal(fieldValue(source,annual),'old');const result=patchInlineSection(source,annual,'new',fieldSnapshot(source,annual));assert.equal(result,source.replace('年度核心突破','今年最想实现的突破').replace('old','\nnew'));assert.equal(fieldValue(result,annual),'new');
});
test('legacy annual external change conflicts and canonical empty value stays empty',()=>{
 const source='## 年度核心突破\nold\n';assert.throws(()=>patchInlineSection(source.replace('old','external'),annual,'local',fieldSnapshot(source,annual)));
 const both='## 今年最想实现的突破\n\n## 年度核心突破\nold\n';assert.equal(fieldValue(both,annual),'');
});
