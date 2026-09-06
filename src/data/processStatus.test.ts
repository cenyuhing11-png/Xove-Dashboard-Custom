import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeProcessStatus } from './processStatus.ts';
import type { ProcessStatusSource } from './processStatus';
import { PROJECT_ROOT } from './vaultPaths.ts';

// Test fixtures use flat scalar Properties. Production uses Obsidian's YAML parser.
export function fixtureYaml(yaml: string): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const line of yaml.split(/\r?\n/)) {
		if (!line.trim() || line.startsWith('#')) continue;
		const match = /^(?:"([^"]+)"|'([^']+)'|([^:]+)):\s*(.*)$/.exec(line);
		if (!match) throw Error('Invalid fixture YAML');
		const key = match[1] || match[2] || match[3]!; const value = match[4]!.replace(/\s+#.*$/, '').trim();
		out[key] = value.startsWith('"') || value.startsWith('[') ? JSON.parse(value) : value.startsWith("'") ? value.slice(1,-1) : value || null;
	}
	return out;
}
function fixture(type: 'learning' | 'project' = 'project', status = '进行中', body = '## 项目任务\n- [ ] A <!-- mx-task:a -->\n- [x] B <!-- mx-task:b -->\n## 最终成果\n- [ ] 不计入') {
	const source: ProcessStatusSource = { sourceFile: type === 'project' ? `${PROJECT_ROOT}/示例/示例.md` : '01-学习与资料/示例.md', processType: type, ...(type === 'project' ? { projectId: 'project-uuid' } : {}) };
	let content = `---\n类型: ${type === 'project' ? '项目' : '学习主题'}\n项目ID: project-uuid\n状态: ${status}\n方向: 设计\n---\n\n${body}`; let writes = 0;
	let beforeWrite = () => {};
	const api = { read: async () => content, process: async (_: string, update: (c: string) => string) => { beforeWrite(); const changed = update(content); content = changed; writes++; } };
	return { source, api, content: () => content, set: (s: string) => { content = s; }, writes: () => writes, beforeWrite: (fn: () => void) => { beforeWrite = fn; } };
}
for (const type of ['learning', 'project'] as const) test(`${type} status writes only its source Markdown Property`, async () => {
	const f = fixture(type, type === 'learning' ? '学习中' : '进行中'), before = f.content();
	assert.equal(await changeProcessStatus(f.api, f.source, '暂停', fixtureYaml, async () => assert.fail('confirmation')), true);
	assert.equal(f.content(), before.replace(`状态: ${type === 'learning' ? '学习中' : '进行中'}`, '状态: 暂停')); assert.equal(f.writes(), 1);
});
test('Completing counts unfinished source tasks, not tasks in unrelated sections', async () => {
	const f = fixture(), counts: number[] = [], before = f.content();
	await changeProcessStatus(f.api, f.source, '已完成', fixtureYaml, async n => { counts.push(n); return true; });
	assert.deepEqual(counts, [1]); assert.equal(f.content(), before.replace('状态: 进行中', '状态: 已完成'));
});
test('Learning completion confirmation uses only learning tasks', async () => {
	const f = fixture('learning', '学习中', '## 学习任务\n- [ ] A\n- [ ] B\n## 实践\n- [ ] C'); let count = 0;
	await changeProcessStatus(f.api, f.source, '已完成', fixtureYaml, async n => { count = n; return false; }); assert.equal(count, 2); assert.equal(f.writes(), 0);
});
test('Cancel completion never invokes a write', async () => {
	const f = fixture(), before = f.content(); assert.equal(await changeProcessStatus(f.api, f.source, '已完成', fixtureYaml, async () => false), false);
	assert.equal(f.writes(), 0); assert.equal(f.content(), before);
});
test('Completed-to-completed is a no-op even when tasks remain', async () => {
	const f = fixture('project', '已完成'); assert.equal(await changeProcessStatus(f.api, f.source, '已完成', fixtureYaml, async () => assert.fail('confirmation')), false); assert.equal(f.writes(), 0);
});
test('Completion without pending tasks needs no confirmation', async () => {
	const f = fixture('project', '进行中', '## 项目任务\n- [x] A'); await changeProcessStatus(f.api, f.source, '已完成', fixtureYaml, async () => assert.fail('confirmation')); assert.ok(f.content().includes('状态: 已完成'));
});
test('Archive changes status only and cannot delete files or complete tasks', async () => {
	const f = fixture(), before = f.content(); await changeProcessStatus(f.api, f.source, '归档', fixtureYaml, async () => assert.fail('confirmation'));
	assert.equal(f.content(), before.replace('状态: 进行中', '状态: 归档')); assert.equal(f.writes(), 1);
});
test('Quoted status, inline comments, BOM, CRLF and body horizontal rules are preserved', async () => {
	const f = fixture(); f.set('\uFEFF---\r\n类型: 项目\r\n项目ID: project-uuid\r\n"状态": "进行中" # 状态说明\r\n方向: 设计\r\n---\r\n正文\r\n---\r\n状态: 正文不能改\r\n---\r\n'); const before = f.content();
	await changeProcessStatus(f.api, f.source, '暂停', fixtureYaml, async () => true);
	assert.equal(f.content(), before.replace('"状态": "进行中"', '"状态": 暂停'));
});
test('Missing status is added only to frontmatter, not body', async () => {
	const f = fixture(); f.set(f.content().replace('状态: 进行中\n', '')); const before = f.content();
	await changeProcessStatus(f.api, f.source, '暂停', fixtureYaml, async () => true); assert.equal(f.content(), before.replace('方向: 设计\n---', '方向: 设计\n状态: 暂停\n---'));
});
test('Invalid type, path, UUID, YAML or target rejects without writes', async () => {
	for (const mode of ['type', 'path', 'id', 'yaml', 'status']) {
		const f = fixture(); if (mode === 'type') f.set(f.content().replace('类型: 项目', '类型: 学习资源')); if (mode === 'path') f.source.sourceFile = '其他/示例.md'; if (mode === 'id') f.source.projectId = 'changed'; if (mode === 'yaml') f.set('no Properties');
		await assert.rejects(changeProcessStatus(f.api, f.source, mode === 'status' ? '未知' as any : '暂停', fixtureYaml, async () => true)); assert.equal(f.writes(), 0);
	}
});
test('Status changed during confirmation is not overwritten', async () => {
	const f = fixture(); await assert.rejects(changeProcessStatus(f.api, f.source, '已完成', fixtureYaml, async () => { f.set(f.content().replace('状态: 进行中','状态: 暂停')); return true; }), /已变化/); assert.equal(f.writes(),0); assert.ok(f.content().includes('状态: 暂停'));
});
test('Pending count changed before atomic save requires a fresh confirmation', async () => {
	const f = fixture(); f.beforeWrite(() => f.set(f.content().replace('## 项目任务','## 项目任务\n- [ ] 新任务')));
	await assert.rejects(changeProcessStatus(f.api, f.source, '已完成', fixtureYaml, async () => true), /已变化/); assert.equal(f.writes(), 0);
});
test('Concurrent unrelated body edits survive the status-only patch', async () => {
	const f = fixture(); f.beforeWrite(() => f.set(f.content() + '\n刚编辑的正文')); await changeProcessStatus(f.api, f.source, '暂停', fixtureYaml, async () => true); assert.ok(f.content().endsWith('刚编辑的正文'));
});
test('Ambiguous repeated status properties reject rather than rewrite both', async () => {
	const f = fixture(); f.set(f.content().replace('方向: 设计','状态: 进行中\n方向: 设计')); await assert.rejects(changeProcessStatus(f.api, f.source, '暂停', fixtureYaml, async () => true), /格式不明确/); assert.equal(f.writes(), 0);
});
test('Anchored or block-scalar status is not destructively reformatted', async () => {
	for (const value of ['&state 进行中', '|', '>']) { const f = fixture(); f.set(f.content().replace('状态: 进行中', `状态: ${value}`)); await assert.rejects(changeProcessStatus(f.api, f.source, '暂停', fixtureYaml, async () => true)); assert.equal(f.writes(),0); }
});
