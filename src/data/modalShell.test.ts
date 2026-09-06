import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DAILY_TASK_FILE, EmbeddedTaskIndex, parseEmbeddedTasks } from './embeddedTasks.ts';

// A small Obsidian DOM/API double exercises the actual modal event handlers.
// Browser layout/theme checks are performed separately in Obsidian.
class Element {
	children: Element[] = []; classes = new Set<string>(); attr: Record<string, string> = {};
	value = ''; text = ''; disabled = false; focused = false;
	onclick: () => unknown = () => {}; onchange: () => void = () => {}; oninput: () => void = () => {};
	readonly tag: string;
	constructor(tag = 'div') { this.tag = tag; }
	createEl(tag: string, opts: any = {}): Element {
		const el = new Element(tag); el.text = opts.text ?? ''; el.attr = opts.attr ?? {};
		for (const cls of (opts.cls ?? '').split(' ').filter(Boolean)) el.addClass(cls);
		el.value = opts.value ?? ''; this.children.push(el); return el;
	}
	createDiv(opts: any = {}): Element { return this.createEl('div', opts); }
	addClass(cls: string): void { this.classes.add(cls); }
	removeClass(cls: string): void { this.classes.delete(cls); }
	closest(): Element { return this; }
	empty(): void { this.children = []; }
	focus(): void { this.focused = true; }
	all(): Element[] { return [this, ...this.children.flatMap(el => el.all())]; }
}
class File { readonly path: string; constructor(path: string) { this.path = path; } }
class Folder { readonly path: string; constructor(path: string) { this.path = path; } }
class Modal {
	contentEl = new Element(); containerEl = new Element(); closed = false;
	readonly app: any;
	constructor(app: any) { this.app = app; }
	close(): void { this.closed = true; (this as any).onClose(); }
}
const code = buildSync({
	stdin: { contents: "export { NewEmbeddedTaskModal } from './src/views/EmbeddedTaskModal'; export { NewProjectModal } from './src/views/ProjectView';", resolveDir: fileURLToPath(new URL('../../', import.meta.url)) },
	bundle: true, platform: 'node', format: 'cjs', write: false, external: ['obsidian'],
}).outputFiles[0]!.text;

function fixture() {
	const files = new Map<string, string>(); const dirs = new Set<string>(); const notices: string[] = []; const opened: any[] = [];
	const project = '03-项目与作品/已有项目/已有项目.md';
	const learning = '01-学习与资料/书籍/学习资料.md';
	files.set(project, '---\n类型: 项目\n---\n## 项目任务\n');
	files.set(learning, '---\n类型: 学习资源\n---\n## 学习任务\n');
	files.set(DAILY_TASK_FILE, '## 日常待办\n');
	dirs.add('03-项目与作品');
	const app = {
		vault: {
			getMarkdownFiles: () => [...files.keys()].map(path => new File(path)),
			getAbstractFileByPath: (path: string) => files.has(path) ? new File(path) : dirs.has(path) ? new Folder(path) : undefined,
			read: async (file: File) => files.get(file.path)!,
			createFolder: async (path: string) => { assert.ok(!dirs.has(path) && !files.has(path)); dirs.add(path); },
			create: async (path: string, text: string) => { assert.ok(!files.has(path)); files.set(path, text); },
		},
		metadataCache: { getFileCache: (file: File) => ({ frontmatter: { 类型: file.path === project ? '项目' : '学习资源' } }) },
		workspace: { getLeavesOfType: () => [], getLeaf: () => ({ setViewState: async (state: any) => opened.push(state) }), revealLeaf: async () => {} },
	};
	const module: { exports: any } = { exports: {} };
	runInNewContext(code, { module, exports: module.exports, crypto: { randomUUID }, require: (id: string) => {
		assert.equal(id, 'obsidian'); return { Modal, ItemView: class {}, TFile: File, TFolder: Folder, Notice: class { constructor(text: string) { notices.push(text); } } };
	} });
	const store = new EmbeddedTaskIndex({ paths: () => [...files.keys()], read: async p => files.get(p)!, process: async (p, update) => { files.set(p, update(files.get(p)!)); }, ensureDaily: async () => {} }, randomUUID);
	return { files, dirs, app, store, notices, opened, project, learning, Task: module.exports.NewEmbeddedTaskModal, Project: module.exports.NewProjectModal };
}
function control(modal: Modal, label: string): Element { const el = modal.contentEl.all().find(e => e.attr['aria-label'] === label); assert.ok(el, label); return el; }
function set(modal: Modal, label: string, value: string): void { const el = control(modal, label); el.value = value; el.oninput(); el.onchange(); }
function button(modal: Modal, text: string): Element { const el = modal.contentEl.all().find(e => e.tag === 'button' && e.text === text); assert.ok(el, text); return el; }

for (const kind of ['Task', 'Project'] as const) {
	test(`${kind} restores original shell, field classes and cancel/primary footer`, () => {
		const f = fixture(); const m = new f[kind](f.app, f.store); m.onOpen();
		assert.ok(m.contentEl.classes.has('ad-task-modal')); assert.ok(m.containerEl.classes.has('dashboard-modal'));
		const elements: Element[] = m.contentEl.all();
		assert.equal(elements.filter(e => e.tag === 'h3' && e.classes.has('ad-modal-title')).length, 1);
		for (const el of elements.filter(e => ['input', 'select', 'textarea'].includes(e.tag))) assert.ok(el.classes.has('ad-modal-input'));
		assert.ok(elements.some(e => e.classes.has('ad-modal-row'))); assert.ok(elements.some(e => e.classes.has('ad-modal-col')));
		const footer = elements.find(e => e.classes.has('ad-modal-btns'))!;
		assert.equal(footer.children.length, 2); assert.ok(footer.children[1]!.classes.has('ad-modal-btn--primary'));
		assert.equal(elements.some(e => e.classes.has('setting-item')), false);
	});
	test(`${kind} cancel closes original shell without writes`, async () => {
		const f = fixture(); const before = [...f.files]; const m = new f[kind](f.app, f.store); m.onOpen();
		await button(m, '取消').onclick(); assert.deepEqual([...f.files], before); assert.equal(m.closed, true);
		assert.equal(m.containerEl.classes.has('dashboard-modal'), false); assert.equal(m.contentEl.children.length, 0);
	});
}
for (const [type, key] of [['daily', DAILY_TASK_FILE], ['project', 'project'], ['learning', 'learning']] as const) {
	test(`task ${type} source writes Embedded Task with date, never a task file`, async () => {
		const f = fixture(); const m = new f.Task(f.app, f.store); m.onOpen();
		set(m, '任务内容', '具体行动'); set(m, '归属', type); set(m, '日期（可选）', '2026-09-06');
		await button(m, '创建任务').onclick();
		const path = key === DAILY_TASK_FILE ? key : f[key]; const tasks = parseEmbeddedTasks(path, f.files.get(path)!);
		assert.equal(tasks.length, 1); assert.equal(tasks[0]!.text, '具体行动'); assert.equal(tasks[0]!.date, '2026-09-06');
		assert.equal(f.files.size, 3); assert.equal(m.closed, true);
	});
}
test('task optional date and preset project retained through the original controls', async () => {
	const f = fixture(); const m = new f.Task(f.app, f.store, f.project); m.onOpen();
	assert.equal(control(m, '归属').value, 'project'); assert.equal(control(m, '项目笔记').value, f.project);
	set(m, '任务内容', '无日期行动'); await button(m, '创建任务').onclick();
	assert.ok(!parseEmbeddedTasks(f.project, f.files.get(f.project)!)[0]!.date);
});
test('task switching back to daily clears stale project destination', async () => {
	const f = fixture(); const m = new f.Task(f.app, f.store, f.project); m.onOpen();
	set(m, '归属', 'learning'); set(m, '归属', 'daily'); set(m, '任务内容', '日常行动'); await button(m, '创建任务').onclick();
	assert.equal(parseEmbeddedTasks(DAILY_TASK_FILE, f.files.get(DAILY_TASK_FILE)!).length, 1); assert.equal(parseEmbeddedTasks(f.project, f.files.get(f.project)!).length, 0);
});
test('task missing source and invalid content leave modal open and re-enable create', async () => {
	const f = fixture(); const m = new f.Task(f.app, f.store); m.onOpen();
	await button(m, '创建任务').onclick(); assert.equal(m.closed, false); assert.equal(button(m, '创建任务').disabled, false);
	f.files.delete(f.project); set(m, '归属', 'project'); set(m, '任务内容', '行动');
	await button(m, '创建任务').onclick(); assert.equal(m.closed, false); assert.ok(f.notices.some(n => n.includes('选择来源')));
});
test('project original controls save all Mengxu fields and stable UUID to one project note', async () => {
	const f = fixture(); const m = new f.Project(f.app); m.onOpen();
	set(m, '项目名称', '新项目'); set(m, '方向（可选）', '设计'); set(m, '状态', '进行中');
	set(m, '开始日期（可选）', '2026-09-06'); set(m, '截止日期（可选）', '2026-09-30'); set(m, '项目目标（可选）', '明确结果');
	await button(m, '创建项目').onclick();
	const path = '03-项目与作品/新项目/新项目.md'; const raw = f.files.get(path)!;
	for (const text of ['类型: 项目', '方向: "设计"', '状态: 进行中', '开始日期: "2026-09-06"', '截止日期: "2026-09-30"', '明确结果', '## 项目任务']) assert.ok(raw.includes(text), text);
	assert.match(raw, /项目ID: [0-9a-f-]{36}/); assert.equal(f.files.size, 4); assert.equal(m.closed, true); assert.equal(f.opened[0].state.path, path);
});
test('project optional fields stay optional and default status remains planned', async () => {
	const f = fixture(); const m = new f.Project(f.app); m.onOpen(); set(m, '项目名称', '最小项目');
	await button(m, '创建项目').onclick(); const raw = f.files.get('03-项目与作品/最小项目/最小项目.md')!;
	assert.ok(raw.includes('状态: 计划中')); assert.equal(m.closed, true);
});
test('project validation failure re-enables create without writing or closing', async () => {
	const f = fixture(); const m = new f.Project(f.app); m.onOpen(); const before = [...f.files];
	set(m, '项目名称', '../错误路径'); await button(m, '创建项目').onclick();
	assert.deepEqual([...f.files], before); assert.equal(m.closed, false); assert.equal(button(m, '创建项目').disabled, false); assert.ok(f.notices.length);
});
