import test from 'node:test';
import assert from 'node:assert/strict';
import { ensurePlan, planInfo, planTemplate } from './planning.ts';
import { ensureJournal, journalInfo, journalTemplate, journalEntry } from './journal.ts';
import { ensureDirection, directionInfo } from './compass.ts';
import type { PlanFiles } from './planning';

const date = new Date(2026,8,6);
const cases = [
	...(['year','quarter','month','week'] as const).map(p=>({path:planInfo(p,date).path,open:(f:PlanFiles)=>ensurePlan(f,p,date)})),
	...(['day','week','month','quarter','year'] as const).map(p=>({path:journalInfo(p,date).path,open:(f:PlanFiles)=>ensureJournal(f,p,date)})),
	{path:directionInfo('设计').path,open:(f:PlanFiles)=>ensureDirection(f,'设计')},
];
for (const c of cases) test(`renamed existing note found without overwrite: ${c.path}`,async()=>{
	const files:PlanFiles={kind:p=>p===c.path?'file':undefined,read:async()=> '用户正文',create:async()=>{throw Error('不得新建');},createFolder:async()=>{throw Error('不得建目录');}};
	assert.equal(await c.open(files),c.path);
});
test('folder prefixes never enter names or metadata',()=>{
	for(const p of ['year','quarter','month','week'] as const){assert.ok(!planInfo(p,date).name.includes('02-年度'));assert.ok(!/^周期: \d\d-/m.test(planTemplate(p,date)));}
	for(const p of ['day','week','month','quarter','year'] as const) assert.ok(!journalTemplate(p,date).includes('复盘/0'));
	assert.ok(journalTemplate('week',date).includes('[[2026-W36 周计划]]'));
});
test('history recognizes moved diary and review',()=>{
	assert.ok(journalEntry(journalInfo('day',date).path,'日记',{类型:'日记',日期:'2026-09-06'}));
	assert.ok(journalEntry(journalInfo('month',date).path,'复盘',{类型:'复盘',周期:'月度',期间:'2026-09'}));
});
