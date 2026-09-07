import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addDirectionAbility, appendDirectionAbility, directionAbilityOptions, directionInfo, directionTemplate, ensureDirection, directionAbilities, directionTopics, directionResources, allLearningTopics, learningAbilityReferences, readDirectionAbilities, renameDirectionAbility, renameDirectionAbilityInMarkdown, replaceLearningAbilityProperty, syncLearningAbilityReferences } from './compass.ts';
import { learningNote, learningTemplate } from './learning.ts';
import { renderLifeCompass } from '../components/workbench/LifeCompass.ts';
import type { PlanFiles } from './planning';

for (const [name, priority] of [['设计','主攻'],['AI','主攻'],['3D','主攻'],['英语','辅助推进'],['阅读','持续维护']] as const) {
	test(`direction path and priority: ${name}`, () => {
		assert.deepEqual(directionInfo(name), { name, priority, path: `05-计划/01-人生方向/${name}.md` });
		assert.ok(directionTemplate(name).includes(`优先级: ${priority}`));
	});
}
function files(): PlanFiles & { store: Map<string,string> } {
	const store = new Map<string,string>(); const dirs = new Set<string>();
	return { store, kind: p => store.has(p) ? 'file' : dirs.has(p) ? 'folder' : undefined,
		read: async p => store.get(p)!, createFolder: async p => { dirs.add(p); },
		create: async (p,s) => { if(store.has(p)) throw Error('exists'); store.set(p,s); } };
}
function editableFiles() {
	const f = files();
	return { ...f, process: async (path: string, update: (content: string) => string) => { f.store.set(path, update(f.store.get(path)!)); } };
}
test('existing direction never overwritten', async () => { const f=files(); f.store.set(directionInfo('设计').path,'用户正文'); await ensureDirection(f,'设计'); assert.equal(f.store.get(directionInfo('设计').path),'用户正文'); });
test('missing direction creates only requested blank note', async () => { const f=files(); await ensureDirection(f,'设计'); assert.equal(f.store.size,1); assert.equal(f.store.get(directionInfo('设计').path),directionTemplate('设计')); });
test('concurrent direction creation is safe', async () => { const f=files(); await Promise.all([ensureDirection(f,'设计'),ensureDirection(f,'设计')]); assert.equal(f.store.size,1); });
test('unsafe and unknown names rejected', () => { for(const n of ['../设计','设计/目标','','未知','AI\n坏']) assert.throws(()=>directionInfo(n)); });
test('direction template contains only empty sections', () => { const s=directionTemplate('设计'); assert.equal((s.match(/^## /gm)||[]).length,4); assert.ok(!s.includes('3D 产品视觉')); assert.ok(s.includes('状态: 进行中')); });
test('long term abilities reuse section reader', () => assert.deepEqual(directionAbilities('## 长期能力\n- 能力一\n- 能力二\n## 备注\n不读取'),['能力一','能力二']));
test('empty abilities safe', () => assert.deepEqual(directionAbilities(directionTemplate('设计')),[]));
test('missing or malformed section safe', () => assert.deepEqual(directionAbilities('---\n不完整'),[]));
test('direction abilities read independently from their own Markdown', async () => {
	const f=editableFiles(); f.store.set(directionInfo('设计').path,'## 长期能力\n- 3D 产品视觉\n- 商业视觉'); f.store.set(directionInfo('英语').path,'## 长期能力\n- 口语');
	assert.deepEqual(await readDirectionAbilities(f,'设计'),['3D 产品视觉','商业视觉']); assert.deepEqual(await readDirectionAbilities(f,'英语'),['口语']);
});
test('missing direction note returns an empty ability selector source',async()=>assert.deepEqual(await readDirectionAbilities(editableFiles(),'设计'),[]));
test('append ability replaces only the empty list placeholder',()=>{const raw=directionTemplate('设计');const result=appendDirectionAbility(raw,'3D 产品视觉');assert.equal(result.added,true);assert.deepEqual(directionAbilities(result.markdown),['3D 产品视觉']);assert.ok(result.markdown.includes('## 当前阶段'));});
test('append ability preserves existing section entries and following body',()=>{const raw='## 长期能力\n\n- 商业视觉\n\n## 当前阶段\n用户正文';const result=appendDirectionAbility(raw,'设计判断力');assert.deepEqual(directionAbilities(result.markdown),['商业视觉','设计判断力']);assert.ok(result.markdown.endsWith('## 当前阶段\n用户正文'));});
test('missing long-term ability section is appended without overwriting body',()=>{const raw='# 设计\n\n用户正文';const result=appendDirectionAbility(raw,'AI 视觉');assert.ok(result.markdown.startsWith(raw));assert.deepEqual(directionAbilities(result.markdown),['AI 视觉']);});
test('ability duplicate ignores whitespace and case and returns existing spelling',()=>{const raw='## 长期能力\n- Blender';const result=appendDirectionAbility(raw,'  blender  ');assert.equal(result.markdown,raw);assert.deepEqual(result,{markdown:raw,ability:'Blender',added:false});});
test('invalid ability cannot inject another Markdown line',()=>{for(const name of ['', '能力\n## 覆盖'])assert.throws(()=>appendDirectionAbility(directionTemplate('设计'),name));});
test('adding an ability writes only its direction note',async()=>{const f=editableFiles();const other=directionInfo('英语').path;f.store.set(other,'英语正文');const result=await addDirectionAbility(f,'设计','3D 产品视觉');assert.equal(result.path,directionInfo('设计').path);assert.equal(result.added,true);assert.deepEqual(directionAbilities(f.store.get(result.path)!),['3D 产品视觉']);assert.equal(f.store.get(other),'英语正文');});
test('concurrent duplicate addition remains one ability',async()=>{const f=editableFiles();await Promise.all([addDirectionAbility(f,'设计','3D 产品视觉'),addDirectionAbility(f,'设计',' 3d 产品视觉 ')]);const abilities=directionAbilities(f.store.get(directionInfo('设计').path)!);assert.equal(abilities.length,1);assert.equal(abilities[0]?.toLocaleLowerCase('zh-CN'),'3d 产品视觉');});
test('legacy free-text ability remains selectable but is visibly marked',()=>assert.deepEqual(directionAbilityOptions(['商业视觉'],'旧能力'),[{value:'商业视觉',label:'商业视觉',legacy:false},{value:'旧能力',label:'旧能力（未加入方向能力）',legacy:true}]));
test('ability options de-duplicate direction values safely',()=>assert.deepEqual(directionAbilityOptions([' Blender ','blender','商业视觉']),[{value:'Blender',label:'Blender',legacy:false},{value:'商业视觉',label:'商业视觉',legacy:false}]));
test('existing free-text learning ability remains readable without changing direction abilities',()=>{const n=learningNote('旧主题.md','旧主题',{类型:'学习主题',方向:'设计',所属能力:['旧能力']})!;assert.deepEqual(n.abilities,['旧能力']);assert.deepEqual(directionAbilities('## 长期能力\n- 商业视觉'),['商业视觉']);});
test('ability rename updates exactly one direction Markdown entry and preserves surrounding content',async()=>{
	const f=editableFiles(),path=directionInfo('英语').path,raw='# 英语\r\n\r\n## 长期能力\r\n\r\n- 英文信息获取\r\n- 口语\r\n\r\n## 备注\r\n用户正文';f.store.set(path,raw);
	const result=await renameDirectionAbility(f,'英语','英文信息获取','英文信息检索');
	assert.deepEqual(result,{path,ability:'英文信息检索',changed:true});assert.deepEqual(directionAbilities(f.store.get(path)!),['英文信息检索','口语']);assert.ok(f.store.get(path)!.endsWith('## 备注\r\n用户正文'));
});
test('ability rename rejects a same-direction duplicate without changing Markdown',()=>{
	const raw='## 长期能力\n- 阅读\n- 写作';assert.throws(()=>renameDirectionAbilityInMarkdown(raw,'阅读','写作'),/该能力已存在/);assert.deepEqual(directionAbilities(raw),['阅读','写作']);
});
const yaml=(source:string):Record<string,unknown>=>{const out:Record<string,unknown>={},lines=source.split(/\r?\n/);for(let i=0;i<lines.length;i++){const match=/^([^\s:#][^:]*):\s*(.*)$/.exec(lines[i]??'');if(!match)continue;const key=match[1]!.trim(),raw=match[2]??'';if(!raw){const values:string[]=[];while(/^\s+-\s+(.+)$/.test(lines[i+1]??'')){i++;values.push(/^\s+-\s+(.+)$/.exec(lines[i]!)![1]!);}out[key]=values;continue;}try{out[key]=JSON.parse(raw);}catch{out[key]=raw;}}return out;};
test('learning ability reference scan is direction-scoped and excludes non-learning content',()=>{
	const notes=[learningNote('a.md','a',{类型:'学习资源',方向:'英语',所属能力:['英文信息获取']})!,learningNote('b.md','b',{类型:'学习主题',方向:'设计',所属能力:['英文信息获取']})!,learningNote('c.md','c',{类型:'知识与思考',方向:'英语',所属能力:['英文信息获取']})!];
	assert.deepEqual(learningAbilityReferences(notes,'英语','英文信息获取'),['a.md']);
});
test('learning ability property replacement changes only the matching Property',()=>{
	const raw='---\n类型: 学习资源\n方向: 英语\n所属能力:\n  - 英文信息获取\n  - 口语\n状态: 进行中\n---\n\n## 学习任务\n\n正文';
	const result=replaceLearningAbilityProperty(raw,'英语','英文信息获取','英文信息检索',yaml);assert.equal(result.changed,true);assert.ok(result.markdown.includes('所属能力: ["英文信息检索","口语"]'));assert.ok(result.markdown.endsWith('## 学习任务\n\n正文'));assert.ok(result.markdown.includes('状态: 进行中'));
});
test('multiple learning references sync while the same ability in another direction is untouched',async()=>{
	const f=editableFiles(),a='01-学习与资料/课程/a.md',b='01-学习与资料/书籍/b.md',other='01-学习与资料/课程/c.md';
	for(const [path,type,direction] of [[a,'学习资源','英语'],[b,'学习主题','英语'],[other,'学习资源','设计']] as const)f.store.set(path,`---\n类型: ${type}\n方向: ${direction}\n所属能力: ["英文信息获取"]\n---\n\n正文`);
	assert.equal(await syncLearningAbilityReferences(f,[a,b],'英语','英文信息获取','英文信息检索',yaml),2);assert.ok(f.store.get(a)!.includes('英文信息检索'));assert.ok(f.store.get(b)!.includes('英文信息检索'));assert.ok(f.store.get(other)!.includes('英文信息获取'));
});
const topic=(name:string,direction='',status='学习中')=>learningNote(`${name}.md`,name,{类型:'学习主题',方向:direction,状态:status,所属能力:['能力一'],优先级:'主攻'})!;
test('topics filter by direction and active first', () => { const a=topic('暂停','设计','暂停'),b=topic('当前','设计'),c=topic('别的','英语'); assert.deepEqual(directionTopics([a,c,b],'设计'),[b,a]); });
test('old topics with no direction compatible', () => { const n=topic('旧主题'); assert.equal(n.direction,''); assert.deepEqual(directionTopics([n],'设计'),[]); assert.deepEqual(n.abilities,['能力一']); });
test('resource explicit direction filtering', () => { const n=learningNote('r.md','资源',{类型:'学习资源',方向:'设计'})!; assert.deepEqual(directionResources([n,topic('主题','设计')],'设计'),[n]); });
test('resource without direction not guessed through topic', () => { const n=learningNote('r.md','资源',{类型:'学习资源',关联主题:['[[主题]]']})!; assert.deepEqual(directionResources([n,topic('主题','设计')],'设计'),[]); });
test('all topics list includes inactive and unlinked', () => { const a=topic('旧','', '暂停'),b=topic('新','设计'); assert.deepEqual(allLearningTopics([a,b]),[b,a]); });
test('empty detail datasets safe', () => { assert.deepEqual(directionTopics([],'设计'),[]); assert.deepEqual(directionResources([],'设计'),[]); });
test('new learning templates direction remains optional', () => { for(const k of ['学习主题','学习资源'] as const) assert.ok(learningTemplate(k,'笔记').includes('方向: ""')); });
test('homepage current learning is a summary, not a second navigation', () => { const s=readFileSync(new URL('../components/workbench/LearningCard.ts',import.meta.url),'utf8'); assert.ok(!s.includes('查看学习主题')); assert.ok(!s.includes('学习队列')); assert.ok(!s.includes('能力地图')); });
test('direction detail reads long-term abilities only from the direction Markdown section',()=>{const s=readFileSync(new URL('../views/DirectionView.ts',import.meta.url),'utf8');assert.ok(s.includes('directionAbilities(markdown)'));assert.equal(s.includes('abilityNotes('),false);});
test('all ten compass names click correct direction; badges are inert', () => {
	const nodes:any[]=[]; const clicked:string[]=[];
	const make=(tag:string,opts:any={})=>{ const n:any={tag,...opts,createEl:make,createSpan:(o:any)=>make('span',o),createDiv:(o:any)=>make('div',o)}; nodes.push(n); return n; };
	renderLifeCompass(make('div'),n=>clicked.push(n));
	const buttons=nodes.filter(n=>n.tag==='button'); buttons.forEach(n=>n.onclick());
	assert.deepEqual(clicked,['设计','AI','3D','英语','自媒体','阅读','绘画','摄影','理财','生活']);
	const badges=nodes.filter(n=>n.cls==='wb-compass__label'); assert.equal(badges.length,3); badges.forEach(n=>assert.equal(n.onclick,undefined));
});
