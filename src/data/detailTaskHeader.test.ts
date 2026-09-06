import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { EmbeddedTaskIndex } from './embeddedTasks.ts';

class Element {
	children: Element[] = []; classes = new Set<string>(); attrs: Record<string, string> = {}; text = ''; value = ''; checked = false; disabled = false;
	onclick: () => void | Promise<void> = () => {}; onchange: () => void = () => {};
	tag: string;
	constructor(tag = 'div') { this.tag = tag; }
	get textContent(): string { return this.text + this.children.map(e => e.textContent).join(''); }
	createEl(tag: string, options: any = {}) { const e = new Element(tag); e.text = options.text ?? ''; e.value = options.value ?? ''; e.attrs = options.attr ?? {}; (options.cls ?? '').split(' ').filter(Boolean).forEach((c: string) => e.classes.add(c)); this.children.push(e); return e; }
	createDiv(o: any = {}) { return this.createEl('div', o); } createSpan(o: any = {}) { return this.createEl('span', o); }
	addClass(c: string) { this.classes.add(c); } removeClass(c: string) { this.classes.delete(c); } closest() { return this; } focus() {}
	empty() { this.children = []; } all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
	querySelectorAll(s: string) { return this.all().filter(e => s.startsWith('.') ? e.classes.has(s.slice(1)) : e.tag === s); }
	querySelector(s: string) { return this.querySelectorAll(s)[0]; }
}
const code = buildSync({ entryPoints: [fileURLToPath(new URL('../views/ProjectView.ts', import.meta.url))], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['obsidian'] }).outputFiles[0]!.text;
async function fixture(type: 'learning' | 'project', count = 0) {
	const label = type === 'learning' ? '学习任务' : '项目任务';
	const path = type === 'learning' ? '01-学习与资料/示例.md' : '03-项目与成果/示例/示例.md';
	const id = 'a495bc3e-ea60-4f04-9641-c05e5441d96b';
	const fm = { 类型: type === 'learning' ? '学习主题' : '项目', 项目ID: id, 状态: '进行中', 方向: '设计' };
	let content = `---\n类型: ${fm.类型}\n状态: 进行中\n---\n\n## ${label}\n${Array.from({ length: count }, (_, i) => `- [${i % 2 ? 'x' : ' '}] 任务${i + 1}`).join('\n')}\n\n## 备注\n保持正文\n`;
	const before = content, modals: any[] = [];
	const store = new EmbeddedTaskIndex({ paths: () => [path], read: async () => content, process: async (_path, update) => { assert.equal(_path, path); content = update(content); }, ensureDaily: async () => { throw Error('Must not create a daily task file'); } }, () => 'detail-test');
	class File { path = path; basename = '示例'; }
	const file = new File();
	const app = { vault: { getMarkdownFiles: () => [file], getAbstractFileByPath: (p: string) => p === path ? file : null, read: async () => content }, metadataCache: { getFileCache: () => ({ frontmatter: fm }) } };
	class Modal { app: any; contentEl = new Element(); containerEl = new Element(); constructor(a: any) { this.app = a; } open() { modals.push(this); (this as any).onOpen(); } close() { (this as any).onClose(); } }
	class ItemView { app = app; contentEl = new Element(); }
	const module: { exports: any } = { exports: {} };
	runInNewContext(code, { module, exports: module.exports, require: () => ({ ItemView, Modal, TFile: File, Component: class {}, Notice: class {} }) });
	const view = new module.exports.ProjectView({}, store);
	view.path = path; view.projectId = type === 'project' ? id : '';
	await view.render();
	return { root: view.contentEl as Element, view, modals, label, path, before, content: () => content };
}
for (const type of ['learning', 'project'] as const) for (const count of [0, 1, 12]) {
	test(`${type} detail with ${count} tasks uses one inline title/count/add row`, async () => {
		const f = await fixture(type, count), heads = f.root.querySelectorAll('.mx-detail-task-head');
		assert.equal(heads.length, 1);
		const head = heads[0]!, title = head.querySelector('h2')!, button = head.querySelector('button')!;
		assert.equal(title.textContent, `${f.label} · ${Math.floor(count / 2)} / ${count}`);
		assert.deepEqual(head.children, [title, button]);
		assert.equal(button.text, '＋ 添加'); assert.equal(button.attrs['aria-label'], `添加${f.label}`); assert.equal(button.attrs.type, 'button');
		assert.ok(button.classes.has('po-cal__seg-btn')); assert.equal(button.classes.has('ad-modal-btn'), false);
		assert.equal(f.root.querySelectorAll('.mx-task-row').length, count); assert.equal(f.content(), f.before);
	});
}
for (const type of ['learning', 'project'] as const) test(`${type} inline add opens existing preset Modal and writes through original EmbeddedTaskIndex`, async () => {
	const f = await fixture(type, 1);
	await f.root.querySelector('.mx-detail-task-head')!.querySelector('button')!.onclick();
	assert.equal(f.modals.length, 1); const modal = f.modals[0];
	assert.equal(modal.presetPath, f.path); assert.equal(f.content(), f.before);
	const form = modal.contentEl as Element;
	assert.equal(form.querySelectorAll('select').find(e => e.attrs['aria-label'] === '归属')!.value, type);
	form.querySelectorAll('input').find(e => e.attrs['aria-label'] === '任务内容')!.value = '新增验证任务';
	await form.querySelectorAll('button').find(e => e.text === '创建任务')!.onclick();
	assert.match(f.content(), /- \[ \] 新增验证任务 <!-- mx-task:detail-test -->/);
	assert.ok(f.content().startsWith(f.before.split(`## ${f.label}`)[0]!)); assert.ok(f.content().endsWith('## 备注\n保持正文\n'));
	await f.view.render(); assert.equal(f.root.querySelector('h2')!.textContent.includes('任务'), false);
	assert.equal(f.root.querySelector('.mx-detail-task-head')!.querySelector('h2')!.textContent, `${f.label} · 0 / 2`);
});
test('Both detail types share identical task heading DOM and class structure', async () => {
	const shape = (el: Element): any => ({ tag: el.tag, classes: [...el.classes], children: el.children.map(shape) });
	const learning = await fixture('learning'), project = await fixture('project');
	assert.deepEqual(shape(learning.root.querySelector('.mx-detail-task-head')!), shape(project.root.querySelector('.mx-detail-task-head')!));
});
test('Repeated detail renders retain exactly one add action and one Modal per click', async () => {
	const f = await fixture('learning');
	for (let i = 0; i < 3; i++) await f.view.render();
	const head = f.root.querySelector('.mx-detail-task-head')!; assert.equal(f.root.querySelectorAll('.mx-detail-task-head').length, 1);
	await head.querySelector('button')!.onclick(); assert.equal(f.modals.length, 1);
});
test('Detail header adds only wrapping/spacing overrides to the original neutral action', () => {
	const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
	assert.match(css, /\.mx-detail-task-head \{[^}]*flex-wrap: wrap;[^}]*border-bottom: 1px solid var\(--ad-line\)/);
	assert.match(css, /\.mx-detail-task-head > \.po-cal__seg-btn \{[^}]*margin-left: auto;[^}]*box-shadow: none/);
	assert.match(css, /\.mx-detail-task-head > \.po-cal__seg-btn \{[^}]*background: transparent;[^}]*color: var\(--ad-text-dim\)/);
	assert.match(css, /\.mx-detail-task-head > \.po-cal__seg-btn:hover \{ background: var\(--ad-h1\); color: var\(--ad-text\); \}/);
	assert.match(css, /\.po-cal__seg-btn \{[^}]*background: transparent;[^}]*font-size: 12px/);
	assert.match(css, /\.po-cal__seg-btn:hover \{ background: var\(--ad-h1\); color: var\(--ad-text\); \}/);
});
