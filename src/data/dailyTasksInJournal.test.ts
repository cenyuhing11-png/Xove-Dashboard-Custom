import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EmbeddedTaskIndex, dailyTaskPath, embeddedSource, LEGACY_DAILY_TASK_FILE, parseEmbeddedTasks, todayTaskDate, groupEmbeddedForDisplay, taskSourceSubtitle } from './embeddedTasks.ts';
import { ensureCanonicalDailyJournal, ensureJournal, hasMeaningfulJournalContent, journalCalendarEntry, journalTemplate, meaningfulJournalDates } from './journal.ts';
import { QuickJournalService } from './quickJournal.ts';
import { reviewRecordFromSource, discoverReviewRecords, recentReviewRecords, randomReviewRecord, pastTodayReviewRecords, searchReviewRecords } from './journalReview.ts';
import { incompleteTaskCountOnDate, tasksOnDate } from './planWorkspace.ts';
import { planDailyTaskMigration, applyDailyTaskMigration } from './dailyTaskMigration.ts';
import type { MigrationFiles } from './dailyTaskMigration.ts';
const day = '2026-09-22', future = '2026-09-25';
const taskRow = (id = 'id-1', date = day, checked = false, text = '买东西') => `- [${checked ? 'x' : ' '}] ${text} 📅 ${date} <!-- mx-task:${id} -->`;
function fixture() {
	const notes = new Map<string, string>(), dirs = new Set<string>(), reads: string[] = [];
	const files = {
		kind: (p: string): 'file' | 'folder' | undefined => notes.has(p) ? 'file' : dirs.has(p) ? 'folder' : undefined,
		paths: () => [...notes.keys()],
		read: async (p: string) => { reads.push(p); if (!notes.has(p)) throw Error('missing'); return notes.get(p)!; },
		createFolder: async (p: string) => { dirs.add(p); },
		create: async (p: string, text: string) => { if (notes.has(p)) throw Error('exists'); notes.set(p, text); },
		process: async (p: string, fn: (s: string) => string) => { if (!notes.has(p)) throw Error('missing'); notes.set(p, fn(notes.get(p)!)); },
		ensureDaily: async (date: string) => { await ensureCanonicalDailyJournal(files, date); },
	};
	let id = 0; const index = new EmbeddedTaskIndex(files, () => `uuid-${++id}`);
	return { notes, files, index, reads };
}
const template = () => journalTemplate('day', new Date(`${day}T12:00:00`));
const taskOnly = () => template().replace('## 今日任务', `## 今日任务\n${taskRow()}`);
const record = (markdown: string) => reviewRecordFromSource({ path: dailyTaskPath(day), basename: day, markdown, properties: { 类型: '日记', 日期: day } });

test('only canonical Journal paths are daily sources; old central source is retired', () => {
	assert.equal(embeddedSource(dailyTaskPath(day)), 'daily'); assert.equal(embeddedSource(LEGACY_DAILY_TASK_FILE), undefined);
	assert.equal(embeddedSource('04-日记与复盘/01-日记/2026-02-30.md'), undefined);
});
test('today daily creation uses canonical template date and persistent UUID', async () => {
	const f = fixture(); await f.index.addDaily('今天');
	const task = f.index.all()[0]!; assert.equal(task.sourceFile, dailyTaskPath(todayTaskDate())); assert.equal(task.sourceHeading, '今日任务');
	assert.equal(task.date, todayTaskDate()); assert.equal(task.id, 'uuid-1'); assert.ok(f.notes.get(task.sourceFile)!.includes('## 随时记'));
});
test('future daily task ensures future journal and retains explicit date', async () => {
	const f = fixture(); await f.index.addDaily('去医院', future); assert.equal(f.index.all()[0]!.sourceFile, dailyTaskPath(future));
	assert.ok(f.notes.get(dailyTaskPath(future))!.includes(`📅 ${future}`)); assert.equal(f.notes.has(LEGACY_DAILY_TASK_FILE), false);
});
test('daily checkbox changes only source row state and preserves UUID date and prose', async () => {
	const f = fixture(); await f.index.addDaily('买东西', day); const task = f.index.all()[0]!;
	const before = f.notes.get(task.sourceFile)!; await f.index.complete(task, true);
	assert.equal(f.notes.get(task.sourceFile), before.replace('- [ ]', '- [x]')); assert.equal(f.index.all()[0]!.id, task.id);
});
test('date change physically moves a checked row without changing UUID or text', async () => {
	const f = fixture(); await f.index.addDaily('买东西', day); await f.index.complete(f.index.all()[0]!, true);
	const before = f.index.all()[0]!; await f.index.changeDate(before, future);
	assert.equal(parseEmbeddedTasks(dailyTaskPath(day), f.notes.get(dailyTaskPath(day))!).length, 0);
	const after = f.index.all()[0]!; assert.equal(after.sourceFile, dailyTaskPath(future)); assert.equal(after.id, before.id); assert.equal(after.text, before.text); assert.equal(after.completed, true); assert.equal(after.date, future);
});
test('same date move does not duplicate task', async () => { const f = fixture(); await f.index.addDaily('a', day); const before = [...f.notes]; await f.index.changeDate(f.index.all()[0]!, day); assert.deepEqual([...f.notes], before); });
test('failed old-source removal rolls back target row and keeps original', async () => {
	const f = fixture(); await f.index.addDaily('a', day); const before = f.notes.get(dailyTaskPath(day)); const process = f.files.process;
	f.files.process = async (path, fn) => { if (path === dailyTaskPath(day)) throw Error('locked'); return process(path, fn); };
	await assert.rejects(f.index.changeDate(f.index.all()[0]!, future), /locked/);
	assert.equal(f.notes.get(dailyTaskPath(day)), before); assert.equal(parseEmbeddedTasks(dailyTaskPath(future), f.notes.get(dailyTaskPath(future))!).length, 0);
});
test('stale edited task is not moved', async () => {
	const f = fixture(); await f.index.addDaily('a', day); const task = f.index.all()[0]!; f.notes.set(task.sourceFile, f.notes.get(task.sourceFile)!.replace('a 📅','changed 📅'));
	await assert.rejects(f.index.changeDate(task, future), /变化/); assert.equal(f.notes.has(dailyTaskPath(future)), false);
});
test('overdue tasks stay in original journals while home includes them', async () => { const f = fixture(); await f.index.addDaily('逾期', '2026-09-20'); const before = [...f.notes]; assert.equal(f.index.today(day).length, 1); assert.equal(f.index.overdue(day).length, 1); assert.deepEqual([...f.notes], before); });
test('Journal only recognizes ID-bearing rows in 今日任务', () => {
	const body = `## 今日任务\n- [ ] 普通任务\n${taskRow()}\n## 今日日记\n${taskRow('elsewhere')}`;
	assert.deepEqual(parseEmbeddedTasks(dailyTaskPath(day), body).map(t => t.id), ['id-1']);
});
test('incremental modify reads only changed source and retains other tasks', async () => {
	const f = fixture(); await f.index.addDaily('a', day); await f.index.addDaily('b', future); f.reads.length = 0;
	await f.index.refresh([dailyTaskPath(day)]); assert.deepEqual(f.reads, [dailyTaskPath(day)]); assert.equal(f.index.all().length, 2);
});
test('incremental delete purges tasks without rereading unrelated journals', async () => {
	const f = fixture(); await f.index.addDaily('a', day); await f.index.addDaily('b', future); f.notes.delete(dailyTaskPath(day)); f.reads.length = 0;
	await f.index.refresh([dailyTaskPath(day)]); assert.deepEqual(f.reads, []); assert.equal(f.index.all().length, 1);
});
test('incremental rename removes old key and indexes the affected destination', async () => {
	const f = fixture(); await f.index.addDaily('a', day); f.notes.set(dailyTaskPath(future), f.notes.get(dailyTaskPath(day))!); f.notes.delete(dailyTaskPath(day)); f.reads.length = 0;
	await f.index.refresh([dailyTaskPath(day), dailyTaskPath(future)]); assert.deepEqual(f.reads, [dailyTaskPath(future)]); assert.equal(f.index.bySource(dailyTaskPath(day)).length, 0);
});
test('learning creation and project task sources and optional dates are unchanged', () => {
	for (const [path, heading] of [['01-学习与资料/书.md','学习任务'],['02-知识与思考/创作.md','创作任务'],['03-项目与成果/项目.md','项目任务']]) assert.equal(parseEmbeddedTasks(path!, `## ${heading}\n- [ ] 行动`)[0]!.text, '行动');
});
test('month and week use original daily dates and count only incomplete tasks', async () => {
	const f = fixture(); await f.index.addDaily('a', day); await f.index.addDaily('b', day); await f.index.addDaily('future', future); await f.index.complete(f.index.all()[0]!, true);
	assert.equal(incompleteTaskCountOnDate(f.index.all(), day), 1); assert.equal(tasksOnDate(f.index.all(), future).length, 1);
});
test('all-task and quick-preview display grouping retains daily without redundant subtitle', async () => { const f = fixture(); await f.index.addDaily('a', day); assert.equal(groupEmbeddedForDisplay(f.index.all()).daily.length, 1); assert.equal(taskSourceSubtitle(f.index.all()[0]!), null); });
for (const [name, body, properties, expected] of [
	['template', template(), {}, false], ['tasks', taskOnly(), {}, false], ['title', template(), { 标题: '标题' }, true],
	['quick', '## 随时记\n- 12:00 记事', {}, true], ['diary', '## 今日日记\n正文', {}, true], ['reflection', '## 今日回看\n回看', {}, true],
	['metadata', '---\n日期: 2026-09-22\n标题:\n---\n## 今日任务', {}, false],
	['comments and placeholders', '## 随时记\n<!-- 内部 -->\n-\n## 今日日记\n### 空标题\n{{content}}', {}, false],
	['checkboxes outside tasks', '## 今日日记\n- [ ] 不计入\n- [x] 完成', {}, false],
] as const) test(`meaningful journal: ${name}`, () => assert.equal(hasMeaningfulJournalContent(body, properties), expected));
test('task-only has no calendar marker, recent random past-today or search record', () => {
	assert.equal(journalCalendarEntry(dailyTaskPath(day), taskOnly(), {}), null); assert.equal(record(taskOnly()), null);
	const records = [record(taskOnly())].filter((r): r is NonNullable<typeof r> => !!r);
	assert.deepEqual(recentReviewRecords(records), []); assert.equal(randomReviewRecord(records), undefined); assert.deepEqual(pastTodayReviewRecords(records, new Date('2027-09-22T12:00:00')), []); assert.deepEqual(searchReviewRecords(records, '买东西'), []);
});
test('daily content search excludes tasks even when the journal is meaningful', () => { const r = record(taskOnly() + '\n## 今日日记\n写了正文')!; assert.ok(r); assert.deepEqual(searchReviewRecords([r], '买东西'), []); assert.equal(searchReviewRecords([r], '正文').length, 1); });
test('QuickJournal reuses task container and immediately makes it meaningful', async () => {
	const f = fixture(); await f.index.addDaily('a', day); const service = new QuickJournalService(f.files);
	await service.appendQuickJournalEntry('记下一刻', new Date(`${day}T12:00:00`)); assert.equal(f.notes.size, 1); assert.ok(hasMeaningfulJournalContent(f.notes.get(dailyTaskPath(day))!)); assert.equal(parseEmbeddedTasks(dailyTaskPath(day), f.notes.get(dailyTaskPath(day))!).length, 1);
});
test('new Journal reuses existing task container byte-for-byte', async () => { const f = fixture(); await f.index.addDaily('a', day); const before = [...f.notes]; assert.equal(await ensureJournal(f.files, 'day', new Date(`${day}T12:00:00`)), dailyTaskPath(day)); assert.deepEqual([...f.notes], before); });
const central = (rows: string) => `---\n类型: 日常任务\n---\n\n# 日常任务\n\n## 日常待办\n${rows}\n\n## 定期事项\n\n- [ ]\n`;
function migrationFixture(source: string) {
	const notes = new Map([[LEGACY_DAILY_TASK_FILE, source]]);
	const adapter: MigrationFiles = { read: async p => notes.get(p), write: async (p, body, expected) => { assert.equal(notes.get(p), expected); notes.set(p, body); }, remove: async (p, expected) => { assert.equal(notes.get(p), expected); notes.delete(p); } };
	return { notes, adapter };
}
test('migration preserves counts UUIDs dates text and checkbox states and deletes only after verification', async () => {
	const source = central(`${taskRow()}\n${taskRow('id-2', future, true, '**原文本**')}`); const plan = planDailyTaskMigration(source, new Map()); const f = migrationFixture(source);
	assert.equal(plan.canDelete, true); assert.equal(plan.complete, 1); assert.equal(plan.incomplete, 1); await applyDailyTaskMigration(plan, f.adapter);
	assert.equal(f.notes.has(LEGACY_DAILY_TASK_FILE), false);
	const tasks = [...f.notes].flatMap(([p,c]) => parseEmbeddedTasks(p,c)); assert.equal(tasks.length, 2);
	assert.deepEqual(tasks.map(t => [t.id,t.text,t.date,t.completed]), plan.tasks.map(t => [t.id,t.text,t.date,t.completed]));
});
test('duplicate central UUID blocks migration and deletion', () => { const p = planDailyTaskMigration(central(`${taskRow()}\n${taskRow()}`), new Map()); assert.equal(p.canDelete,false); assert.ok(p.duplicateIds.length); });
test('missing dates remain unresolved and are never guessed as today', () => { const p = planDailyTaskMigration(central('- [ ] 无日期 <!-- mx-task:id -->'),new Map()); assert.equal(p.missingDate,1); assert.equal(p.canDelete,false); assert.equal(p.writes.length,0); });
test('missing UUID remains unresolved and no new UUID is invented', () => { const p = planDailyTaskMigration(central(`- [ ] 无 ID 📅 ${day}`),new Map()); assert.equal(p.missingId,1); assert.equal(p.canDelete,false); });
test('non-task user body prevents central retirement', async () => { const source=central(taskRow())+'用户正文'; const p=planDailyTaskMigration(source,new Map()); assert.ok(p.nonTaskBody.length); const f=migrationFixture(source); await assert.rejects(applyDailyTaskMigration(p,f.adapter)); assert.ok(f.notes.has(LEGACY_DAILY_TASK_FILE)); });
test('same existing UUID and content is idempotently skipped', () => { const p=planDailyTaskMigration(central(taskRow()),new Map([[dailyTaskPath(day),taskOnly()]])); assert.equal(p.canDelete,true); assert.equal(p.existingIds,1); assert.equal(p.writes.length,0); });
test('same UUID but different text is a conflict', () => { const p=planDailyTaskMigration(central(taskRow()),new Map([[dailyTaskPath(day),taskOnly().replace('买东西','别的任务')]])); assert.equal(p.canDelete,false); assert.ok(p.conflicts.length); });
test('UUID found outside target section or on another date is a conflict', () => { for(const [path,body] of [[dailyTaskPath(day),'## 今日日记\n'+taskRow()],[dailyTaskPath(future),taskOnly()]]) assert.equal(planDailyTaskMigration(central(taskRow()),new Map([[path!,body!]])).canDelete,false); });
test('failed migration write keeps old central source', async () => { const source=central(taskRow()); const f=migrationFixture(source); f.adapter.write=async()=>{throw Error('disk');}; await assert.rejects(applyDailyTaskMigration(planDailyTaskMigration(source,new Map()),f.adapter),/disk/); assert.equal(f.notes.get(LEGACY_DAILY_TASK_FILE),source); });
test('concurrent destination changes abort migration without overwriting user text', async () => { const source=central(taskRow()); const f=migrationFixture(source); const p=planDailyTaskMigration(source,new Map()); f.notes.set(dailyTaskPath(day),'后来写的内容'); await assert.rejects(applyDailyTaskMigration(p,f.adapter),/目标已变化/); assert.equal(f.notes.get(dailyTaskPath(day)),'后来写的内容'); assert.ok(f.notes.has(LEGACY_DAILY_TASK_FILE)); });
test('empty standard legacy template can safely retire without creating journals', () => { const p=planDailyTaskMigration(central('- [ ]'),new Map()); assert.equal(p.canDelete,true); assert.equal(p.tasks.length,0); assert.equal(p.writes.length,0); });
test('Journal dynamic aggregate excludes daily while real rows use the shared checkbox', () => {
	const renderer=readFileSync(new URL('../components/journal/JournalTaskRenderer.ts',import.meta.url),'utf8'); assert.match(renderer,/tasks.filter\(task => task.sourceType !== 'daily'\)/); assert.match(renderer,/renderJournalDailyTask[\s\S]*renderEmbeddedTaskCheckbox/);
	const live=readFileSync(new URL('../components/journal/JournalTaskLivePreview.ts',import.meta.url),'utf8'); assert.match(live,/Decoration.replace/); assert.match(live,/editorLivePreviewField/);
});
test('cached journal discovery and mini calendar both exclude task-only and include authored content', async () => {
	const files=[{path:dailyTaskPath(day),basename:day,stat:{mtime:1,size:1},body:taskOnly()},{path:dailyTaskPath(future),basename:future,stat:{mtime:1,size:1},body:'## 随时记\n记录'}]; let reads=0;
	const app={vault:{getMarkdownFiles:()=>files,cachedRead:async(f:typeof files[number])=>{reads++;return f.body;}},metadataCache:{getFileCache:(f:typeof files[number])=>({frontmatter:{类型:'日记',日期:f.basename}})}};
	assert.deepEqual([...(await meaningfulJournalDates(app as never))],[future]); assert.equal((await discoverReviewRecords(app as never)).length,1); assert.equal(reads,2);
	files[0]!.body += '\n## 今日回看\n有效'; files[0]!.stat.mtime++;
	assert.equal((await meaningfulJournalDates(app as never)).size,2); assert.equal(reads,3);
});

test('empty and placeholder frontmatter titles do not create journal records', () => {
	for (const value of ['" "', "' '", 'null', '~', '{{title}}', '# comment']) assert.equal(hasMeaningfulJournalContent(`---\n标题: ${value}\n---\n\n## 今日任务`), false);
	assert.equal(hasMeaningfulJournalContent('---\n标题: 有效标题\n---'), true);
	assert.equal(hasMeaningfulJournalContent('---\n标题: 123\n---', { 标题: 123 }), false);
});
test('CRLF task date move preserves checked text and UUID with LF destination', async () => {
	const f = fixture(); f.notes.set(dailyTaskPath(day), `## 今日任务\r\n${taskRow('crlf',day,true)}\r\n`); await f.index.refresh();
	await f.index.changeDate(f.index.all()[0]!, future); const task=f.index.all()[0]!;
	assert.equal(task.id,'crlf'); assert.equal(task.completed,true); assert.equal(task.text,'买东西'); assert.equal(task.date,future);
});
test('CRLF failed move rolls back an LF target without leaving a duplicate', async () => {
	const f=fixture(); f.notes.set(dailyTaskPath(day),`## 今日任务\r\n${taskRow()}\r\n`); await f.index.refresh(); const process=f.files.process;
	f.files.process=async(path,fn)=>{if(path===dailyTaskPath(day))throw Error('locked');return process(path,fn);};
	await assert.rejects(f.index.changeDate(f.index.all()[0]!,future),/locked/);
	assert.equal(parseEmbeddedTasks(dailyTaskPath(future),f.notes.get(dailyTaskPath(future))!).length,0);
});
test('migration rejects a duplicate marker injected outside the target task section before deletion', async () => {
	const source=central(taskRow()); const f=migrationFixture(source); const write=f.adapter.write;
	f.adapter.write=async(path,body,expected)=>write(path,body+'\n## 其它\n<!-- mx-task:id-1 -->',expected);
	await assert.rejects(applyDailyTaskMigration(planDailyTaskMigration(source,new Map()),f.adapter),/校验失败/); assert.ok(f.notes.has(LEGACY_DAILY_TASK_FILE));
});

test('legacy journal prevents creating a second container for the same day', async () => {
	const f=fixture(); const legacy=dailyTaskPath(day).replace('.md',' 日记.md'); f.notes.set(legacy,'旧日记正文');
	await assert.rejects(f.index.addDaily('a',day),/旧格式日记/); assert.equal(f.notes.size,1); assert.equal(f.notes.get(legacy),'旧日记正文');
});
test('migration reports legacy target conflict rather than creating a second journal', () => {
	const p=planDailyTaskMigration(central(taskRow()),new Map([[dailyTaskPath(day).replace('.md',' 日记.md'),'旧日记']]));
	assert.equal(p.canDelete,false); assert.equal(p.writes.length,0); assert.ok(p.conflicts.length);
});
