import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceFolder, learningFolder, learningNote, ensureLearningNote } from './learning.ts';
import type { PlanFiles } from './planning';

for (const [type, folder] of [['书籍','书籍'],['课程','课程'],['视频','视频'],['文章','文章与网页'],['网页','文章与网页'],['文档','文档资料'],['PDF','文档资料'],['未知','文档资料'],['../非法','文档资料']] as const) {
	test(`resource type routes safely: ${type}`, async () => {
		assert.equal(resourceFolder(type),`01-学习与资料/${folder}`);
		const dirs=new Set<string>(); const notes=new Map<string,string>();
		const files:PlanFiles={kind:p=>dirs.has(p)?'folder':notes.has(p)?'file':undefined, read:async p=>notes.get(p)!,createFolder:async p=>{dirs.add(p);},create:async(p,s)=>{notes.set(p,s);}};
		const path=await ensureLearningNote(files,'学习资源','测试',type);
		assert.equal(path,`${resourceFolder(type)}/测试.md`);
		assert.ok(notes.get(path)?.includes(`资源类型: ${JSON.stringify(type)}`));
		assert.ok(!dirs.has('01-学习与资料/学习资源'));
	});
}
test('logical kinds do not create dedicated directories',()=>{for(const k of ['能力','学习主题'] as const) assert.equal(learningFolder(k),'01-学习与资料');});
test('prototype keys are unknown resource types',()=>{for(const t of ['constructor','__proto__','toString'])assert.equal(resourceFolder(t),'01-学习与资料/文档资料');});
test('metadata recognizes learning outside learning folders',()=>{for(const p of ['00-收件箱/主题.md','任意路径/主题.md'])assert.equal(learningNote(p,'主题',{类型:'学习主题'})?.kind,'学习主题');});
test('property aliases remain readable',()=>{const n=learningNote('资料.md','资料',{类型:'学习资源',能力:['A'],学习主题:['T']})!;assert.deepEqual(n.abilities,['A']);assert.deepEqual(n.topics,['T']);});
