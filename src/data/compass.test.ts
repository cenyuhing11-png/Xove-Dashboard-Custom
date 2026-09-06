import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { directionInfo, directionTemplate, ensureDirection, directionAbilities, directionTopics, directionResources, allLearningTopics } from './compass.ts';
import { learningNote, learningTemplate } from './learning.ts';
import { renderLifeCompass } from '../components/workbench/LifeCompass.ts';
import type { PlanFiles } from './planning';

for (const [name, priority] of [['设计','主攻'],['AI','主攻'],['3D','主攻'],['英语','辅助推进'],['阅读','持续维护']] as const) {
	test(`direction path and priority: ${name}`, () => {
		assert.deepEqual(directionInfo(name), { name, priority, path: `05-计划/人生方向/${name}.md` });
		assert.ok(directionTemplate(name).includes(`优先级: ${priority}`));
	});
}
function files(): PlanFiles & { store: Map<string,string> } {
	const store = new Map<string,string>(); const dirs = new Set<string>();
	return { store, kind: p => store.has(p) ? 'file' : dirs.has(p) ? 'folder' : undefined,
		read: async p => store.get(p)!, createFolder: async p => { dirs.add(p); },
		create: async (p,s) => { if(store.has(p)) throw Error('exists'); store.set(p,s); } };
}
test('existing direction never overwritten', async () => { const f=files(); f.store.set(directionInfo('设计').path,'用户正文'); await ensureDirection(f,'设计'); assert.equal(f.store.get(directionInfo('设计').path),'用户正文'); });
test('missing direction creates only requested blank note', async () => { const f=files(); await ensureDirection(f,'设计'); assert.equal(f.store.size,1); assert.equal(f.store.get(directionInfo('设计').path),directionTemplate('设计')); });
test('concurrent direction creation is safe', async () => { const f=files(); await Promise.all([ensureDirection(f,'设计'),ensureDirection(f,'设计')]); assert.equal(f.store.size,1); });
test('unsafe and unknown names rejected', () => { for(const n of ['../设计','设计/目标','','未知','AI\n坏']) assert.throws(()=>directionInfo(n)); });
test('direction template contains only empty sections', () => { const s=directionTemplate('设计'); assert.equal((s.match(/^## /gm)||[]).length,4); assert.ok(!s.includes('3D 产品视觉')); assert.ok(s.includes('状态: 进行中')); });
test('long term abilities reuse section reader', () => assert.deepEqual(directionAbilities('## 长期能力\n- 能力一\n- 能力二\n## 备注\n不读取'),['能力一','能力二']));
test('empty abilities safe', () => assert.deepEqual(directionAbilities(directionTemplate('设计')),[]));
test('missing or malformed section safe', () => assert.deepEqual(directionAbilities('---\n不完整'),[]));
const topic=(name:string,direction='',status='学习中')=>learningNote(`${name}.md`,name,{类型:'学习主题',方向:direction,状态:status,所属能力:['能力一'],优先级:'主攻'})!;
test('topics filter by direction and active first', () => { const a=topic('暂停','设计','暂停'),b=topic('当前','设计'),c=topic('别的','英语'); assert.deepEqual(directionTopics([a,c,b],'设计'),[b,a]); });
test('old topics with no direction compatible', () => { const n=topic('旧主题'); assert.equal(n.direction,''); assert.deepEqual(directionTopics([n],'设计'),[]); assert.deepEqual(n.abilities,['能力一']); });
test('resource explicit direction filtering', () => { const n=learningNote('r.md','资源',{类型:'学习资源',方向:'设计'})!; assert.deepEqual(directionResources([n,topic('主题','设计')],'设计'),[n]); });
test('resource without direction not guessed through topic', () => { const n=learningNote('r.md','资源',{类型:'学习资源',关联主题:['[[主题]]']})!; assert.deepEqual(directionResources([n,topic('主题','设计')],'设计'),[]); });
test('all topics list includes inactive and unlinked', () => { const a=topic('旧','', '暂停'),b=topic('新','设计'); assert.deepEqual(allLearningTopics([a,b]),[b,a]); });
test('empty detail datasets safe', () => { assert.deepEqual(directionTopics([],'设计'),[]); assert.deepEqual(directionResources([],'设计'),[]); });
test('new learning templates direction remains optional', () => { for(const k of ['学习主题','学习资源'] as const) assert.ok(learningTemplate(k,'笔记').includes('方向: ""')); });
test('homepage replaces ability map with topic list', () => { const s=readFileSync(new URL('../components/workbench/LearningCard.ts',import.meta.url),'utf8'); assert.ok(s.includes('查看学习主题')); assert.ok(!s.includes('能力地图')); assert.ok(s.includes("actions.list('topics')")); });
test('all ten compass names click correct direction; badges are inert', () => {
	const nodes:any[]=[]; const clicked:string[]=[];
	const make=(tag:string,opts:any={})=>{ const n:any={tag,...opts,createEl:make,createSpan:(o:any)=>make('span',o),createDiv:(o:any)=>make('div',o)}; nodes.push(n); return n; };
	renderLifeCompass(make('div'),n=>clicked.push(n));
	const buttons=nodes.filter(n=>n.tag==='button'); buttons.forEach(n=>n.onclick());
	assert.deepEqual(clicked,['设计','AI','3D','英语','自媒体','阅读','绘画','摄影','理财','生活']);
	const badges=nodes.filter(n=>n.cls==='wb-compass__label'); assert.equal(badges.length,3); badges.forEach(n=>assert.equal(n.onclick,undefined));
});
