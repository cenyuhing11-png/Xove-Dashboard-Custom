import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendQuickJournalContent, QuickJournalService, quickJournalEntry } from './quickJournal.ts';
import type { QuickJournalFiles } from './quickJournal.ts';
import { journalInfo, journalTemplate } from './journal.ts';

const date = new Date(2026, 8, 8, 14, 36);

function store(initial: Record<string, string> = {}) {
	const notes = new Map(Object.entries(initial));
	const folders = new Set<string>();
	let creates = 0;
	let processes = 0;
	const files: QuickJournalFiles = {
		kind: path => notes.has(path) ? 'file' : folders.has(path) ? 'folder' : undefined,
		read: async path => notes.get(path) ?? '',
		createFolder: async path => { folders.add(path); },
		create: async (path, content) => { if (notes.has(path)) throw new Error('exists'); creates++; notes.set(path, content); },
		process: async (path, update) => {
			const current = notes.get(path); if (current === undefined) throw new Error('missing');
			processes++; notes.set(path, update(current));
		},
	};
	return { notes, folders, files, creates: () => creates, processes: () => processes };
}

test('quick journal entry uses HH:mm and keeps multiline input in one list item', () => {
	assert.equal(quickJournalEntry('今天出去走了走\n感觉状态比昨天好', '14:32'), '- 14:32 今天出去走了走\n  感觉状态比昨天好');
});
test('empty or whitespace-only input produces no entry', () => {
	assert.equal(quickJournalEntry('', '14:32'), null);
	assert.equal(quickJournalEntry(' \n\t ', '14:32'), null);
});
test('special Markdown characters remain user-authored text without over-escaping', () => {
	const text = '#状态 - [链接]（测试）😀 https://example.com';
	assert.equal(quickJournalEntry(text, '09:08'), `- 09:08 ${text}`);
});
test('existing quick journal section receives the entry before the next H2', () => {
	const source = '## 今日任务\n\n保留\n\n## 随时记\n\n- 09:00 第一条\n\n## 今日日记\n\n正文\n';
	const next = appendQuickJournalContent(source, '- 14:36 第二条');
	assert.match(next, /## 随时记\n\n- 09:00 第一条\n\n- 14:36 第二条\n\n## 今日日记/);
	assert.match(next, /## 今日任务\n\n保留/);
	assert.match(next, /## 今日日记\n\n正文/);
});
test('missing quick section is inserted after 今日任务', () => {
	const next = appendQuickJournalContent('## 今日任务\n\n- [ ] 保留\n\n## 今日日记\n\n正文\n', '- 14:36 记录');
	assert.match(next, /## 今日任务\n\n- \[ \] 保留\n\n## 随时记\n\n- 14:36 记录\n\n## 今日日记/);
});
test('without 今日任务 the quick section is inserted before 今日日记', () => {
	const next = appendQuickJournalContent('---\n标题: 保留\n---\n\n## 今日日记\n\n正文\n', '- 14:36 记录');
	assert.match(next, /---\n\n## 随时记\n\n- 14:36 记录\n\n## 今日日记/);
});
test('nonstandard journal gets a safe section at the end', () => {
	assert.equal(appendQuickJournalContent('旧正文\n', '- 14:36 记录'), '旧正文\n\n## 随时记\n\n- 14:36 记录\n');
});
test('frontmatter and fenced heading examples are never mistaken for the real section', () => {
	const source = '---\n示例: "## 随时记"\n---\n\n```md\n## 随时记\n```\n\n## 今日日记\n';
	const next = appendQuickJournalContent(source, '- 14:36 记录');
	assert.equal((next.match(/^## 随时记$/gm) ?? []).length, 2);
	assert.match(next, /```\n\n## 随时记\n\n- 14:36 记录\n\n## 今日日记/);
});
test('CRLF journals retain CRLF while appending', () => {
	const next = appendQuickJournalContent('## 随时记\r\n\r\n- 09:00 A\r\n\r\n## 今日日记\r\n', '- 14:36 B');
	assert.equal(next.replace(/\r\n/g, '').includes('\n'), false);
	assert.match(next, /- 09:00 A\r\n\r\n- 14:36 B\r\n\r\n## 今日日记/);
});
test('missing daily journal is created from the existing official template and only once', async () => {
	const s = store(); const service = new QuickJournalService(s.files, () => date);
	const first = await service.appendQuickJournalEntry('第一条');
	const second = await service.appendQuickJournalEntry('第二条');
	const path = journalInfo('day', date).path; const content = s.notes.get(path) ?? '';
	assert.equal(first.created, true); assert.equal(second.created, false); assert.equal(s.creates(), 1);
	assert.ok(content.startsWith(journalTemplate('day', date).slice(0, 45)));
	assert.match(content, /## 随时记\n\n- 14:36 第一条\n\n- 14:36 第二条\n\n## 今日日记/);
});
test('existing journal appends without changing title, tasks, diary or review', async () => {
	const path = journalInfo('day', date).path;
	const source = '---\n类型: 日记\n日期: 2026-09-08\n标题: 保留标题\n---\n\n## 今日任务\n\n- [ ] 保留任务\n\n## 随时记\n\n## 今日日记\n\n保留正文\n\n## 今日回看\n\n保留回看\n';
	const s = store({ [path]: source });
	await new QuickJournalService(s.files, () => date).appendQuickJournalEntry('新增记录');
	const next = s.notes.get(path) ?? '';
	for (const value of ['标题: 保留标题', '- [ ] 保留任务', '保留正文', '保留回看']) assert.ok(next.includes(value));
	assert.equal(s.creates(), 0); assert.equal(s.processes(), 1);
});
test('legacy suffixed daily journal is reused instead of creating a duplicate', async () => {
	const legacy = '04-日记与复盘/01-日记/2026-09-08 日记.md';
	const s = store({ [legacy]: '## 今日日记\n\n旧正文\n' });
	const result = await new QuickJournalService(s.files, () => date).appendQuickJournalEntry('记录');
	assert.equal(result.path, legacy); assert.equal(result.created, false); assert.equal(s.creates(), 0);
	assert.match(s.notes.get(legacy) ?? '', /## 随时记\n\n- 14:36 记录/);
});
test('service uses local calendar date and local HH:mm rather than UTC conversion', async () => {
	const local = new Date(2026, 0, 1, 0, 7); const s = store();
	const result = await new QuickJournalService(s.files, () => local).appendQuickJournalEntry('跨日边界');
	assert.equal(result.date, '2026-01-01'); assert.equal(result.time, '00:07');
	assert.ok(s.notes.has('04-日记与复盘/01-日记/2026-01-01.md'));
});
test('empty input never creates or modifies a journal', async () => {
	const s = store();
	await assert.rejects(new QuickJournalService(s.files, () => date).appendQuickJournalEntry(' \n '), /不能为空/);
	assert.equal(s.creates(), 0); assert.equal(s.processes(), 0); assert.equal(s.notes.size, 0);
});
test('rapid consecutive writes are serialized and neither entry is lost', async () => {
	const path = journalInfo('day', date).path; const s = store({ [path]: journalTemplate('day', date) });
	let active = 0; let maxActive = 0;
	const original = s.files.process;
	s.files.process = async (file, update) => { active++; maxActive = Math.max(maxActive, active); await new Promise(resolve => setTimeout(resolve, 5)); await original(file, update); active--; };
	const service = new QuickJournalService(s.files, () => date);
	await Promise.all([service.appendQuickJournalEntry('第一条'), service.appendQuickJournalEntry('第二条')]);
	assert.equal(maxActive, 1);
	assert.match(s.notes.get(path) ?? '', /- 14:36 第一条[\s\S]*- 14:36 第二条/);
});
test('a failed save does not poison the write queue', async () => {
	const path = journalInfo('day', date).path; const s = store({ [path]: journalTemplate('day', date) }); let fail = true;
	const process = s.files.process;
	s.files.process = async (file, update) => { if (fail) { fail = false; throw new Error('iCloud unavailable'); } return process(file, update); };
	const service = new QuickJournalService(s.files, () => date);
	await assert.rejects(service.appendQuickJournalEntry('失败'));
	await service.appendQuickJournalEntry('重试成功');
	assert.match(s.notes.get(path) ?? '', /- 14:36 重试成功/);
});

test('shared shell places quick journal beside new diary in the approved navigation order', () => {
	const shell = readFileSync(new URL('../components/workbench/WorkbenchShell.ts', import.meta.url), 'utf8');
	const diary = shell.indexOf("action: 'diary'"); const quick = shell.indexOf("action: 'quickJournal'"); const task = shell.indexOf("action: 'task'");
	assert.ok(diary >= 0 && diary < quick && quick < task); assert.match(shell, /label: '随时记'/);
});
test('Modal delegates writing to the service and preserves the current workbench route', () => {
	const modal = readFileSync(new URL('../views/QuickJournalModal.ts', import.meta.url), 'utf8');
	assert.match(modal, /service\.appendQuickJournalEntry\(input\.value\)/);
	assert.match(modal, /已记入今日日记/); assert.match(modal, /随时记保存失败，请重试/);
	assert.doesNotMatch(modal, /openFile|openLinkText|setViewState|navigateWorkbench|currentSection/);
});
test('Modal keeps multiline Enter and reserves Cmd or Ctrl Enter for save', () => {
	const modal = readFileSync(new URL('../views/QuickJournalModal.ts', import.meta.url), 'utf8');
	assert.match(modal, /event\.metaKey \|\| event\.ctrlKey/);
	assert.match(modal, /!input\.value\.trim\(\)/);
	assert.match(modal, /rows: '4'/); assert.match(modal, /今天想记点什么……/);
});
test('command and both shell dispatch paths open the same Modal without a new View', () => {
	const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
	const dashboard = readFileSync(new URL('../views/DashboardView.ts', import.meta.url), 'utf8');
	assert.match(main, /id: 'quick-journal'/); assert.match(main, /name: '梦序：随时记'/);
	assert.match(main, /openQuickJournal\(\)/); assert.match(dashboard, /action === 'quickJournal'\) this\.plugin\.openQuickJournal\(\)/);
	assert.doesNotMatch(main.match(/openQuickJournal\(\)[\s\S]*?\n\t}/)?.[0] ?? '', /setViewState|getLeaf|openFile/);
});
test('time trace continues refreshing journal rows through existing create and modify listeners', () => {
	const plan = readFileSync(new URL('../views/PlanView.ts', import.meta.url), 'utf8');
	assert.match(plan, /vault\.on\('create', refresh\)/);
	assert.match(plan, /vault\.on\('modify', file => \{ if \(this\.active && \(file\.path\.startsWith\('05-计划\/'\) \|\| \(this\.mode === 'calendar' && !!journalDateFromPath\(file\.path\)\)\)\) void this\.renderPlanContent\(\); \}\)/);
});
