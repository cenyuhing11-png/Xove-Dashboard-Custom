import test from 'node:test';
import assert from 'node:assert/strict';
import { JournalInlineDocument, JournalInlineDraft, JournalEditConflict, editableJournalSections, sectionSnapshot, sectionValue, patchJournalSection, patchJournalTitle, titleSnapshot, titleValue } from './journalInline.ts';
import { ensureJournal, journalInfo, journalTemplate, hasMeaningfulJournalContent } from './journal.ts';
import type { JournalKind } from './journal.ts';
import { journalOverviewSummary } from './journalOverview.ts';
const date = new Date('2036-04-18T12:00:00');
const source = journalTemplate('day', date).replace('## 今日任务\n', '## 今日任务\n\n- [ ] fictional task 📅 2036-04-18 <!-- mx-task:fixture-uuid -->\n').replace('## 今日日记\n','## 今日日记\n\nold **body**\n') + '## Unknown\nkeep this exactly\n';
function fixture(kind: JournalKind = 'day', initial?: string) {
	const info = journalInfo(kind, date); const notes = new Map<string, string>(initial === undefined ? [] : [[info.path, initial]]); const dirs = new Set<string>(); let writes = 0;
	const files = { kind: (p: string): 'file' | 'folder' | undefined => notes.has(p) ? 'file' : dirs.has(p) ? 'folder' : undefined, read: async (p: string) => notes.get(p)!, createFolder: async (p: string) => { dirs.add(p); }, create: async (p: string, s: string) => { assert.ok(!notes.has(p)); notes.set(p,s); } };
	const adapter = { read: async () => notes.get(info.path) ?? '', ensure: async () => { await ensureJournal(files, kind, date); }, process: async (fn: (s: string) => string) => { notes.set(info.path, fn(notes.get(info.path)!)); writes++; } };
	const doc = new JournalInlineDocument(adapter, () => date);
	return { notes, doc, adapter, info, text: () => notes.get(info.path)!, writes: () => writes };
}
for (const title of ['随时记','今日日记','今日回看']) test(`section ${title} patches only its body, preserving YAML/tasks/unknown sections`, () => {
	const before = sectionSnapshot(source,title), next = patchJournalSection(source,title,'中文 **bold** [link](https://example.test)\n- item\n> quote',before);
	assert.equal(sectionValue(next,title),'中文 **bold** [link](https://example.test)\n- item\n> quote');
	assert.equal(next.replace('## '+title+'\n'+sectionSnapshot(next,title)!,'## '+title+'\n'),source.replace('## '+title+'\n'+before!,'## '+title+'\n'));
	assert.ok(next.includes('<!-- mx-task:fixture-uuid -->')); assert.equal(titleSnapshot(next),titleSnapshot(source));
});
test('CRLF BOM fences comments and nested headings preserve untouched bytes', () => {
	const body='\uFEFF---\r\n标题: old\r\n---\r\n## 今日日记\r\n\r\nold\r\n```md\r\n## fake\r\n```\r\n### sub\r\n<!--\r\n## fake2\r\n-->\r\n\r\n## Other\r\nkeep\r\n';
	const next=patchJournalSection(body,'今日日记','new\n### sub',sectionSnapshot(body,'今日日记'));
	assert.equal(next,'\uFEFF---\r\n标题: old\r\n---\r\n## 今日日记\r\n\r\nnew\r\n### sub\r\n\r\n## Other\r\nkeep\r\n');
});
test('duplicate target headings and structural headings in editor input fail closed', () => {
	assert.throws(()=>sectionSnapshot('## 今日日记\na\n## 今日日记\nb','今日日记'),/同名/);
	assert.throws(()=>patchJournalSection(source,'今日日记','## 今日任务\nnew',sectionSnapshot(source,'今日日记')),/三级/);
});
test('missing section appends without rebuilding existing sections or reordering them', () => {
	const next=patchJournalSection(source,'extra','new',null); assert.ok(next.startsWith(source)); assert.equal(sectionValue(next,'extra'),'new');
});
test('title changes only its field; YAML special syntax is safely quoted', () => {
	const next=patchJournalTitle(source,'hello: #world',titleSnapshot(source));assert.equal(titleValue(next),'hello: #world');
	assert.equal(next.replace(titleSnapshot(next)!,''),source.replace(titleSnapshot(source)!,''));
});
test('multiline title patch preserves subsequent fields and body', () => {
	const text='---\n标题: |\n  first\n  second\nother: unchanged\n---\nbody';assert.equal(titleValue(text),'first\nsecond');
	assert.equal(patchJournalTitle(text,'new',titleSnapshot(text)),'---\n标题: new\nother: unchanged\n---\nbody');
});
test('title conflicts and duplicate attributes are rejected', () => {
	assert.throws(()=>patchJournalTitle(source.replace('标题:','标题: external'),'draft',titleSnapshot(source)),JournalEditConflict);
	assert.throws(()=>titleSnapshot('---\n标题: a\n标题: b\n---'),/重复/);
});
test('clearing a title preserves other fields and narrative', () => {const next=patchJournalTitle(source,'',titleSnapshot(source));assert.equal(titleValue(next),'');assert.ok(next.endsWith('keep this exactly\n'));});
test('missing Journal is not created by mounting but is ensured on first save',async()=>{const f=fixture();const d=new JournalInlineDraft(f.doc,{kind:'section',title:'今日日记'},'');assert.equal(f.notes.size,0);d.input('first');assert.equal(await d.flush(),true);assert.equal(f.notes.size,1);assert.equal(sectionValue(f.text(),'今日日记'),'first');assert.deepEqual(editableJournalSections('day'),['随时记','今日日记','今日回看']);});
test('task-only existing Journal is reused and becomes meaningful after editing',async()=>{const original=source.replace('old **body**','').replace('## Unknown\nkeep this exactly\n','');assert.equal(hasMeaningfulJournalContent(original),false);const f=fixture('day',original);const d=new JournalInlineDraft(f.doc,{kind:'section',title:'今日回看'},original);d.input('reflection');await d.flush();assert.equal(f.notes.size,1);assert.equal(hasMeaningfulJournalContent(f.text()),true);assert.equal(sectionSnapshot(f.text(),'今日任务'),sectionSnapshot(original,'今日任务'));});
test('debounce coalesces keystrokes into one write',async()=>{const f=fixture('day',source);const d=new JournalInlineDraft(f.doc,{kind:'section',title:'今日日记'},source,()=>{},20);d.input('a');d.input('ab');d.input('abc');assert.equal(f.writes(),0);await new Promise(r=>setTimeout(r,50));assert.equal(f.writes(),1);assert.equal(sectionValue(f.text(),'今日日记'),'abc');});
for(const trigger of ['blur','focus-switch','destroy'])test(`${trigger} flushes pending save without waiting for debounce`,async()=>{const f=fixture('day',source);const d=new JournalInlineDraft(f.doc,{kind:'section',title:'今日日记'},source);d.input(trigger);assert.equal(await (trigger==='destroy'?d.destroy():d.flush()),true);assert.equal(f.writes(),1);assert.equal(sectionValue(f.text(),'今日日记'),trigger);});
test('external non-target modifications survive atomic latest-content patch',async()=>{const f=fixture('day',source);const d=new JournalInlineDraft(f.doc,{kind:'section',title:'今日日记'},source);d.input('my draft');f.notes.set(f.info.path,source.replace('keep this exactly','external text'));await d.flush();assert.ok(f.text().includes('external text'));assert.equal(sectionValue(f.text(),'今日日记'),'my draft');});
test('target conflict blocks overwrite, retains draft and can explicitly reload external content',async()=>{const f=fixture('day',source);const d=new JournalInlineDraft(f.doc,{kind:'section',title:'今日日记'},source);d.input('local');f.notes.set(f.info.path,source.replace('old **body**','external'));assert.equal(await d.flush(),false);assert.equal(d.state,'conflict');assert.equal(d.value,'local');assert.equal(f.writes(),0);d.input('still local');assert.equal(await d.flush(),false);await d.reload();assert.equal(d.value,'external');assert.equal(d.dirty,false);});
test('save failure retains input and explicit retry saves it',async()=>{const f=fixture('day',source);const original=f.adapter.process;f.adapter.process=async()=>{throw Error('offline');};const d=new JournalInlineDraft(f.doc,{kind:'section',title:'今日日记'},source);d.input('keep');assert.equal(await d.flush(),false);assert.equal(d.value,'keep');assert.equal(d.state,'error');f.adapter.process=original;assert.equal(await d.flush(),true);});
test('typing while a write is in flight is serialized and saved last',async()=>{const f=fixture('day',source);const original=f.adapter.process;let release!:()=>void;const gate=new Promise<void>(r=>release=r);f.adapter.process=async fn=>{await gate;await original(fn);};const d=new JournalInlineDraft(f.doc,{kind:'section',title:'今日日记'},source);d.input('one');const pending=d.flush();await Promise.resolve();d.input('two');release();await pending;assert.equal(sectionValue(f.text(),'今日日记'),'two');assert.equal(d.dirty,false);});
test('IME composition never saves intermediate text',async()=>{const f=fixture('day',source);const d=new JournalInlineDraft(f.doc,{kind:'section',title:'今日日记'},source,()=>{},10);d.composition(true);d.input('zhong');await new Promise(r=>setTimeout(r,30));assert.equal(f.writes(),0);assert.equal(await d.flush(),false);d.input('中文');d.composition(false);await d.flush();assert.equal(sectionValue(f.text(),'今日日记'),'中文');});
test('quick composer appends ordered structured entries and preserves concurrent QuickJournal content',async()=>{const f=fixture('day',source.replace('## 随时记\n','## 随时记\n\n- 09:00 first\n  continuation\n'));const d=new JournalInlineDraft(f.doc,{kind:'quick'},f.text());d.input('new\nsecond line');f.notes.set(f.info.path,f.text().replace('- 09:00 first','- 08:00 external\n- 09:00 first'));await d.flush(true);assert.ok(f.text().includes('- 08:00 external\n- 09:00 first\n  continuation'));assert.ok(f.text().includes('- 12:00 new\n  second line'));assert.equal(d.value,'');});
for(const kind of ['week','month','quarter','year'] as const)for(const title of editableJournalSections(kind))test(`${kind} missing review ensures canonical file and saves ${title}`,async()=>{const f=fixture(kind);const d=new JournalInlineDraft(f.doc,{kind:'section',title},'');d.input('fictional review');await d.flush();assert.equal(f.notes.size,1);assert.equal(sectionValue(f.text(),title),'fictional review');const headers=f.text().match(/^## .+$/gm);assert.deepEqual(headers,journalTemplate(kind,date).match(/^## .+$/gm));});
for(const [label,body,expected] of [
 ['title','标题: chosen\n---\n## 随时记\n- 09:00 quick','chosen'],
 ['quick','标题:\n---\n## 随时记\n- 09:00 one\n  continuation\n- 10:00 two\n## 今日日记\nbody','随时记 · 2条'],
 ['diary','标题:\n---\n## 今日日记\n**first line**\nsecond','first line'],
 ['reflection','标题:\n---\n## 今日回看\n> reflect','reflect'],
 ['task-only','标题:\n---\n## 今日任务\n- [ ] private task <!-- mx-task:test -->',null],
 ['legacy H1 ignored','标题:\n---\n# legacy\n## 今日日记\nactual','actual'],
] as const)test(`overview ${label} fallback`,()=>assert.equal(journalOverviewSummary('---\n'+body),expected));

test('quick autosave extends one entry across pauses instead of fragmenting entries',async()=>{const f=fixture('day',source);const d=new JournalInlineDraft(f.doc,{kind:'quick'},source);d.input('first');await d.flush();d.input('first complete');await d.flush();assert.equal((sectionValue(f.text(),'随时记').match(/- 12:00/g)??[]).length,1);assert.ok(f.text().includes('first complete'));await d.flush(true);assert.equal(d.value,'');d.input('another');await d.flush(true);assert.equal((sectionValue(f.text(),'随时记').match(/- 12:00/g)??[]).length,2);});

test('a delayed background refresh cannot overwrite newer local input',async()=>{const f=fixture('day',source);let resolve!:(s:string)=>void;f.adapter.read=()=>new Promise<string>(r=>resolve=r);const d=new JournalInlineDraft(f.doc,{kind:'section',title:'今日日记'},source);const refresh=d.refresh();d.input('new local');resolve(source);await refresh;assert.equal(d.value,'new local');await d.flush();});
test('unfinished Markdown fences/comments cannot swallow following sections',()=>{for(const value of ['```md\ntext','<!-- unfinished'])assert.throws(()=>patchJournalSection(source,'今日日记',value,sectionSnapshot(source,'今日日记')),/闭合/);});
test('failed quick write can retry without treating its uncommitted entry as an external conflict',async()=>{const f=fixture('day',source);const real=f.adapter.process;let fail=true;f.adapter.process=async fn=>{if(fail){fn(f.text());throw Error('disk');}return real(fn);};const d=new JournalInlineDraft(f.doc,{kind:'quick'},source);d.input('entry');assert.equal(await d.flush(),false);fail=false;assert.equal(await d.flush(true),true);assert.ok(f.text().includes('entry'));});

test('numeric and YAML boolean-looking titles are stored as strings',()=>{for(const value of ['123','true','2036-04-18']){const next=patchJournalTitle(source,value,titleSnapshot(source));assert.ok(next.includes('标题: '+JSON.stringify(value)));assert.equal(titleValue(next),value);}});
test('CRLF quick autosave edits one entry and clearing removes only that new entry',async()=>{const f=fixture('day',source.replace(/\n/g,'\r\n'));const d=new JournalInlineDraft(f.doc,{kind:'quick'},f.text());d.input('one\ntwo');await d.flush();d.input('updated\ncontinuation');assert.equal(await d.flush(),true);assert.ok(f.text().includes('updated\r\n  continuation'));d.input('');await d.flush(true);assert.equal(sectionValue(f.text(),'随时记'),'');assert.ok(f.text().includes('<!-- mx-task:fixture-uuid -->'));});
