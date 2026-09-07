import test from 'node:test';
import assert from 'node:assert/strict';
import { RESOURCE_TYPES, resourceFolder, learningFolder, learningNote, ensureLearningNote } from './learning.ts';
import type { PlanFiles } from './planning';

for (const [type, expected] of [['课程','01-学习与资料/课程'],['电影','01-学习与资料/电影'],['书籍','01-学习与资料/书籍'],['视频','01-学习与资料/视频'],['文章','01-学习与资料/文章'],['网页','01-学习与资料/文章'],['文档','00-收件箱'],['PDF','00-收件箱'],['其他资料','00-收件箱'],['未知','00-收件箱'],['../非法','00-收件箱']] as const) {
	test(`resource type routes safely: ${type}`, async () => {
		assert.equal(resourceFolder(type), expected);
		const dirs=new Set<string>(); const notes=new Map<string,string>();
		const files:PlanFiles={kind:p=>dirs.has(p)?'folder':notes.has(p)?'file':undefined, read:async p=>notes.get(p)!,createFolder:async p=>{dirs.add(p);},create:async(p,s)=>{notes.set(p,s);}};
		const path=await ensureLearningNote(files,'学习资源','测试',type);
		assert.equal(path,`${resourceFolder(type)}/测试.md`);
		assert.ok(notes.get(path)?.includes(`资源类型: ${JSON.stringify(type)}`));
		assert.ok(!dirs.has('01-学习与资料/学习资源'));
	});
}
test('creation choices expose the five permanent learning categories',()=>assert.deepEqual(RESOURCE_TYPES,['课程','电影','书籍','视频','文章']));
test('logical kinds do not create dedicated directories',()=>{for(const k of ['能力','学习主题'] as const) assert.equal(learningFolder(k),'01-学习与资料');});
test('prototype keys are unknown resource types',()=>{for(const t of ['constructor','__proto__','toString'])assert.equal(resourceFolder(t),'00-收件箱');});
test('metadata recognizes learning outside learning folders',()=>{for(const p of ['00-收件箱/主题.md','任意路径/主题.md'])assert.equal(learningNote(p,'主题',{类型:'学习主题'})?.kind,'学习主题');});
test('property aliases remain readable',()=>{const n=learningNote('资料.md','资料',{类型:'学习资源',能力:['A'],学习主题:['T']})!;assert.deepEqual(n.abilities,['A']);assert.deepEqual(n.topics,['T']);});
