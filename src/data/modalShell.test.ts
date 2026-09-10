import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DAILY_TASK_FILE, EmbeddedTaskIndex, parseEmbeddedTasks } from './embeddedTasks.ts';
import { readFileSync } from 'node:fs';

// A small Obsidian DOM/API double exercises the actual modal event handlers.
// Browser layout/theme checks are performed separately in Obsidian.
class Element {
	children: Element[] = []; classes = new Set<string>(); attr: Record<string, string> = {};
	parent?: Element;
	value = ''; text = ''; disabled = false; focused = false;
	onclick: (...args: any[]) => unknown = () => {}; onchange: () => void = () => {}; oninput: () => void = () => {}; onkeydown: (event: any) => void = () => {};
	readonly tag: string;
	constructor(tag = 'div') { this.tag = tag; }
	createEl(tag: string, opts: any = {}): Element {
		const el = new Element(tag); el.text = opts.text ?? ''; el.attr = opts.attr ?? {};
		for (const cls of (opts.cls ?? '').split(' ').filter(Boolean)) el.addClass(cls);
		el.value = opts.value ?? ''; el.parent = this; this.children.push(el); return el;
	}
	createDiv(opts: any = {}): Element { return this.createEl('div', opts); }
	addClass(cls: string): void { this.classes.add(cls); }
	removeClass(cls: string): void { this.classes.delete(cls); }
	toggleClass(cls: string, active: boolean): void { if (active) this.classes.add(cls); else this.classes.delete(cls); }
	setAttribute(name: string, value: string): void { this.attr[name] = value; }
	setText(text: string): void { this.text = text; }
	closest(): Element { return this; }
	empty(): void { this.children = []; }
	remove(): void { if (this.parent) this.parent.children = this.parent.children.filter(e => e !== this); }
	focus(): void { this.focused = true; }
	setSelectionRange(): void {}
	addEventListener(type: string, callback: (...args: any[]) => unknown): void { if (type === 'click') this.onclick = callback; }
	click(): unknown { return this.onclick(); }
	all(): Element[] { return [this, ...this.children.flatMap(el => el.all())]; }
}
class File { readonly path: string; constructor(path: string) { this.path = path; } get basename() { return this.path.split('/').pop()!.replace(/\.md$/, ''); } }
class Folder { readonly path: string; constructor(path: string) { this.path = path; } }
class Modal {
	contentEl = new Element(); containerEl = new Element(); closed = false;
	readonly app: any;
	constructor(app: any) { this.app = app; }
	open(): void { openedModals.push(this); (this as any).onOpen(); }
	close(): void { this.closed = true; (this as any).onClose(); }
}
let openedModals: Modal[] = [];
function parseYaml(source: string): Record<string, unknown> {
	const result: Record<string, unknown> = {}, lines = source.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const match = /^([^\s:#][^:]*):\s*(.*)$/.exec(lines[index] ?? ''); if (!match) continue;
		const key = match[1]!.replace(/^['"]|['"]$/g, ''), raw = match[2] ?? '';
		if (!raw) {
			const values: string[] = []; let next = index + 1;
			while (next < lines.length) { const item = /^\s+-\s+(.+)$/.exec(lines[next] ?? ''); if (!item) break; values.push(item[1]!.replace(/^['"]|['"]$/g, '')); next++; }
			result[key] = values; index = next - 1; continue;
		}
		try { result[key] = JSON.parse(raw); } catch { result[key] = raw.replace(/^['"]|['"]$/g, ''); }
	}
	return result;
}
const code = buildSync({
	stdin: { contents: "export { NewEmbeddedTaskModal } from './src/views/EmbeddedTaskModal'; export { UnifiedProcessModal } from './src/views/UnifiedProcessModal'; export { DirectionAbilityModal } from './src/views/DirectionAbilityModal'; export { PlanModal } from './src/views/PlanModal'; export { LongTermPlanDirectionModal } from './src/views/LongTermPlanDirectionModal';", resolveDir: fileURLToPath(new URL('../../', import.meta.url)) },
	bundle: true, platform: 'node', format: 'cjs', write: false, external: ['obsidian'],
}).outputFiles[0]!.text;

function fixture() {
	openedModals = [];
	const files = new Map<string, string>(); const dirs = new Set<string>(); const notices: string[] = []; const opened: any[] = [];
	const project = '03-项目与成果/已有项目/已有项目.md';
	const learning = '01-学习与资料/已有项目.md';
	files.set(project, '---\n类型: 项目\n---\n## 项目任务\n');
	files.set(learning, '---\n类型: 学习主题\n---\n## 学习任务\n');
	files.set(DAILY_TASK_FILE, '## 日常待办\n');
	dirs.add('03-项目与成果');
	const app = {
		vault: {
			getMarkdownFiles: () => [...files.keys()].map(path => new File(path)),
			getAbstractFileByPath: (path: string) => files.has(path) ? new File(path) : dirs.has(path) ? new Folder(path) : undefined,
			read: async (file: File) => files.get(file.path)!,
			createFolder: async (path: string) => { assert.ok(!dirs.has(path) && !files.has(path)); dirs.add(path); },
			create: async (path: string, text: string) => { assert.ok(!files.has(path)); files.set(path, text); },
			process: async (file: File, update: (text: string) => string) => { files.set(file.path, update(files.get(file.path)!)); },
		},
		metadataCache: { getFileCache: (file: File) => {
			const raw = files.get(file.path) ?? '';
			const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw), frontmatter = block ? parseYaml(block[1]!) : {};
			if (!frontmatter['方向']) frontmatter['方向'] = '设计';
			return { frontmatter, headings: [...raw.matchAll(/^##\s+(.+)$/gm)].map(match => ({ heading: match[1] })) };
		} },
		workspace: { getLeavesOfType: () => [], getLeaf: () => ({ setViewState: async (state: any) => opened.push(state), openFile: async (file:File) => opened.push({file:file.path}) }), revealLeaf: async () => {}, setActiveLeaf(){} },
	};
	const module: { exports: any } = { exports: {} };
	runInNewContext(code, { module, exports: module.exports, crypto: { randomUUID }, require: (id: string) => {
		assert.equal(id, 'obsidian'); return { Modal, ItemView: class {}, TFile: File, TFolder: Folder, parseYaml, Notice: class { constructor(text: string) { notices.push(text); } } };
	} });
	const store = new EmbeddedTaskIndex({ paths: () => [...files.keys()], read: async p => files.get(p)!, process: async (p, update) => { files.set(p, update(files.get(p)!)); }, ensureDaily: async () => {} }, randomUUID);
	return { files, dirs, app, store, notices, opened, project, learning, Task: module.exports.NewEmbeddedTaskModal, Project: (class extends module.exports.UnifiedProcessModal { constructor(app:any) { super(app, 'creation'); } onOpen(){ super.onOpen(); button(this as any, '项目与成果').onclick(); } }) as any, Unified: module.exports.UnifiedProcessModal, Ability: module.exports.DirectionAbilityModal, Plan: module.exports.PlanModal, LongTermDirection: module.exports.LongTermPlanDirectionModal, openedModal: () => openedModals.at(-1) };
}
function control(modal: Modal, label: string): Element { const el = modal.contentEl.all().find(e => e.attr['aria-label'] === label); assert.ok(el, label); return el; }
function set(modal: Modal, label: string, value: string): void { const el = control(modal, label); el.value = value; el.oninput(); el.onchange(); }
function button(modal: Modal, text: string): Element { const el = modal.contentEl.all().find(e => e.tag === 'button' && e.text === text); assert.ok(el, text); return el; }
function direction(f: ReturnType<typeof fixture>, name: string, abilities: string[]): void { f.files.set(`05-计划/01-人生方向/${name}.md`, `# ${name}\n\n## 长期能力\n\n${abilities.map(value => `- ${value}`).join('\n')}\n\n## 备注\n`); }
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

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
		set(m, '任务内容', '具体行动'); set(m, '归属', type === 'daily' ? 'daily' : 'process'); set(m, '日期（可选）', '2026-09-06');
		if (type !== 'daily') set(m, '所属进程', f[type]);
		await button(m, '创建任务').onclick();
		const path = key === DAILY_TASK_FILE ? key : f[key]; const tasks = parseEmbeddedTasks(path, f.files.get(path)!);
		assert.equal(tasks.length, 1); assert.equal(tasks[0]!.text, '具体行动'); assert.equal(tasks[0]!.date, '2026-09-06');
		assert.equal(tasks[0]!.sourceHeading, type === 'daily' ? '日常待办' : type === 'learning' ? '学习任务' : '项目任务');
		assert.equal(f.files.size, 3); assert.equal(m.closed, true);
	});
}
test('task optional date and preset project retained through the original controls', async () => {
	const f = fixture(); const m = new f.Task(f.app, f.store, f.project); m.onOpen();
	assert.equal(control(m, '归属').value, 'process'); assert.equal(control(m, '所属进程').value, f.project);
	set(m, '任务内容', '无日期行动'); await button(m, '创建任务').onclick();
	assert.ok(!parseEmbeddedTasks(f.project, f.files.get(f.project)!)[0]!.date);
});
test('task switching back to daily clears stale project destination', async () => {
	const f = fixture(); const m = new f.Task(f.app, f.store, f.project); m.onOpen();
	set(m, '所属进程', f.learning); set(m, '归属', 'daily'); set(m, '任务内容', '日常行动'); await button(m, '创建任务').onclick();
	assert.equal(parseEmbeddedTasks(DAILY_TASK_FILE, f.files.get(DAILY_TASK_FILE)!).length, 1); assert.equal(parseEmbeddedTasks(f.project, f.files.get(f.project)!).length, 0);
});
test('task missing source and invalid content leave modal open and re-enable create', async () => {
	const f = fixture(); const m = new f.Task(f.app, f.store); m.onOpen();
	await button(m, '创建任务').onclick(); assert.equal(m.closed, false); assert.equal(button(m, '创建任务').disabled, false);
	f.files.delete(f.project); set(m, '归属', 'process'); set(m, '任务内容', '行动');
	await button(m, '创建任务').onclick(); assert.equal(m.closed, false); assert.ok(f.notices.some(n => n.includes('所属进程'))); assert.equal(button(m, '创建任务').disabled, true);
});
test('Task assignment exposes only daily/process, and daily has no source picker', () => {
	const f = fixture(), m = new f.Task(f.app, f.store); m.onOpen();
	assert.deepEqual(control(m, '归属').children.map(e => [e.value, e.text]), [['daily', '日常'], ['process', '进程']]);
	assert.equal(control(m, '归属').value, 'daily');
	assert.equal(m.contentEl.all().some((e: Element) => e.attr['aria-label'] === '所属进程'), false);
});
test('Process selection starts with an explicit placeholder and cannot guess the first source', async () => {
	const f = fixture(), m = new f.Task(f.app, f.store); m.onOpen(); set(m, '归属', 'process');
	assert.equal(control(m, '所属进程').value, ''); assert.equal(control(m, '所属进程').children[0]!.text, '选择进程…');
	assert.equal(button(m, '创建任务').disabled, true); const before = [...f.files]; set(m, '任务内容', '不能猜归属');
	await button(m, '创建任务').onclick(); assert.deepEqual([...f.files], before); assert.equal(m.closed, false);
});
for (const kind of ['书籍', '课程', '电影', '视频', '文章', '网页', '文档', 'PDF']) test(`Ordinary ${kind} learning resource is excluded from process task candidates`, () => {
	const f = fixture(), path = `01-学习与资料/文章/${kind}.md`;
	f.files.set(path, `---\n类型: 学习资源\n资源类型: ${kind}\n---\n## 笔记\n`);
	const m = new f.Task(f.app, f.store); m.onOpen(); set(m, '归属', 'process');
	assert.deepEqual(new Set(control(m, '所属进程').children.filter(e => e.value).map(e => e.value)), new Set([f.learning, f.project]));
});
test('Same-name learning/creation candidates retain distinct subtype labels and source paths', async () => {
	const f = fixture(), m = new f.Task(f.app, f.store); m.onOpen(); set(m, '归属', 'process');
	const options = control(m, '所属进程').children.filter(e => e.value);
	assert.deepEqual(options.map(e => e.text), ['[学习·学习主题] 已有项目 · 设计', '[创作·项目] 已有项目 · 设计']);
	assert.notEqual(options[0]!.value, options[1]!.value); set(m, '所属进程', f.learning); set(m, '任务内容', '学习同名任务');
	await button(m, '创建任务').onclick(); assert.equal(parseEmbeddedTasks(f.learning, f.files.get(f.learning)!).length, 1); assert.equal(parseEmbeddedTasks(f.project, f.files.get(f.project)!).length, 0);
});
for (const type of ['learning', 'project'] as const) test(`${type} detail context preselects process assignment and exact process`, () => {
	const f = fixture(), m = new f.Task(f.app, f.store, f[type]); m.onOpen();
	assert.equal(control(m, '归属').value, 'process'); assert.equal(control(m, '所属进程').value, f[type]); assert.equal(button(m, '创建任务').disabled, false);
});
test('Resource or stale context never silently falls back to daily or another process', () => {
	const f = fixture(), resource = '01-学习与资料/书籍/资料.md'; f.files.set(resource, '---\n类型: 学习资源\n---\n');
	for (const path of [resource, '03-项目与成果/已删除/已删除.md']) {
		const m = new f.Task(f.app, f.store, path); m.onOpen(); assert.equal(control(m, '归属').value, 'process'); assert.equal(control(m, '所属进程').value, ''); assert.equal(button(m, '创建任务').disabled, true);
	}
});
test('Process candidates exclude abilities, legacy projects and notes outside formal roots', () => {
	const f = fixture();
	for (const [path, kind] of [['01-学习与资料/能力笔记.md', '能力'], ['Projects/旧项目.md', '项目'], ['其他/学习.md', '学习主题'], ['03-项目与成果/普通笔记.md', '普通笔记']]) f.files.set(path!, `---\n类型: ${kind}\n---\n`);
	const m = new f.Task(f.app, f.store); m.onOpen(); set(m, '归属', 'process');
	assert.deepEqual(new Set(control(m, '所属进程').children.filter(e => e.value).map(e => e.value)), new Set([f.learning, f.project]));
});
for (const change of ['delete', 'resource'] as const) test(`Save revalidates process eligibility after ${change} and does not redirect writes`, async () => {
	const f = fixture(), m = new f.Task(f.app, f.store, f.learning); m.onOpen(); set(m, '任务内容', '过期候选');
	if (change === 'delete') f.files.delete(f.learning); else f.files.set(f.learning, '---\n类型: 学习资源\n---\n## 笔记\n');
	const before = [...f.files]; await button(m, '创建任务').onclick();
	assert.deepEqual([...f.files], before); assert.equal(m.closed, false); assert.equal(control(m, '所属进程').value, ''); assert.equal(button(m, '创建任务').disabled, true);
});
test('Switching assignment removes picker DOM while retaining task content and optional date', () => {
	const f = fixture(), m = new f.Task(f.app, f.store, f.project); m.onOpen(); set(m, '任务内容', '保持输入'); set(m, '日期（可选）', '2026-09-06');
	set(m, '归属', 'daily'); assert.equal(m.contentEl.all().some((e: Element) => e.attr['aria-label'] === '所属进程'), false);
	set(m, '归属', 'process'); assert.equal(control(m, '所属进程').value, ''); assert.equal(control(m, '任务内容').value, '保持输入'); assert.equal(control(m, '日期（可选）').value, '2026-09-06');
	assert.equal(m.contentEl.all().filter((e: Element) => e.attr['aria-label'] === '所属进程').length, 1);
});
test('No eligible process leaves placeholder disabled instead of admitting a resource', () => {
	const f = fixture(); f.files.delete(f.project); f.files.delete(f.learning);
	const m = new f.Task(f.app, f.store); m.onOpen(); set(m, '归属', 'process');
	assert.equal(control(m, '所属进程').children.length, 1); assert.equal(button(m, '创建任务').disabled, true); assert.ok(m.contentEl.all().some((e: Element) => e.text.includes('暂无可选进程')));
});
test('Task modal field order matches assignment then process then optional date without old source labels', () => {
	const f = fixture(), m = new f.Task(f.app, f.store); m.onOpen(); set(m, '归属', 'process');
	assert.deepEqual(m.contentEl.all().filter((e: Element) => ['input', 'select'].includes(e.tag)).map((e: Element) => e.attr['aria-label']), ['任务内容', '归属', '所属进程', '日期（可选）']);
	for (const label of ['学习笔记 / 学习资源', '项目笔记']) assert.equal(m.contentEl.all().some((e: Element) => e.text === label), false);
});
test('Double submitting an assigned task cannot duplicate its Embedded Markdown action', async () => {
	const f = fixture(), m = new f.Task(f.app, f.store, f.project); m.onOpen(); set(m, '任务内容', '仅创建一次');
	const create = button(m, '创建任务'); await Promise.all([create.onclick(), create.onclick()]); assert.equal(parseEmbeddedTasks(f.project, f.files.get(f.project)!).length, 1);
});
test('project original controls save all Mengxu fields and stable UUID to one project note', async () => {
	const f = fixture(); const m = new f.Project(f.app); m.onOpen();
	set(m, '项目与成果名称', '新项目'); set(m, '方向（可选）', '设计'); set(m, '状态', '进行中');
	set(m, '开始日期（可选）', '2026-09-06'); set(m, '截止日期（可选）', '2026-09-30'); set(m, '项目目标（可选）', '明确结果');
	await button(m, '创建进程').onclick();
	const path = '03-项目与成果/新项目/新项目.md'; const raw = f.files.get(path)!;
	for (const text of ['类型: 项目', '方向: "设计"', '状态: 进行中', '开始日期: "2026-09-06"', '截止日期: "2026-09-30"', '明确结果', '## 项目任务']) assert.ok(raw.includes(text), text);
	assert.match(raw, /项目ID: [0-9a-f-]{36}/); assert.equal(f.files.size, 4); assert.equal(m.closed, true); assert.equal(f.opened[0].state.path, path);
});
test('project optional fields stay optional and default status remains planned', async () => {
	const f = fixture(); const m = new f.Project(f.app); m.onOpen(); set(m, '项目与成果名称', '最小项目');
	await button(m, '创建进程').onclick(); const raw = f.files.get('03-项目与成果/最小项目/最小项目.md')!;
	assert.ok(raw.includes('状态: 计划中')); assert.equal(m.closed, true);
});
test('project validation failure re-enables create without writing or closing', async () => {
	const f = fixture(); const m = new f.Project(f.app); m.onOpen(); const before = [...f.files];
	set(m, '项目与成果名称', '../错误路径'); await button(m, '创建进程').onclick();
	assert.deepEqual([...f.files], before); assert.equal(m.closed, false); assert.equal(button(m, '创建进程').disabled, false); assert.ok(f.notices.length);
});
test('Global process creation opens one author-style UnifiedProcessModal, without a menu',()=>{
	const f=fixture(),m=new f.Unified(f.app);m.onOpen();assert.equal(m.contentEl.all().find((e:Element)=>e.tag==='h3').text,'新建进程');assert.ok(m.contentEl.classes.has('ad-task-modal'));assert.deepEqual(m.contentEl.all().filter((e:Element)=>e.classes.has('ad-prio-btn')).map((e:Element)=>e.text),['学习','创作','课程','电影','书籍','视频','文章']);
});
test('Unified learning type exposes a disabled direction-bound ability selector',()=>{
	const f=fixture(),m=new f.Unified(f.app);m.onOpen();for(const label of ['课程名称','方向（可选）','状态','开始日期（可选）','截止日期（可选）','培养能力（可选）','学习目标（可选）'])control(m,label);const ability=control(m,'培养能力（可选）');assert.equal(ability.disabled,true);assert.equal(ability.children[0]!.text,'先选择人生方向');assert.equal(button(m,'＋ 新建能力').disabled,true);assert.equal(button(m,'编辑').disabled,true);assert.equal(m.contentEl.all().some((e:Element)=>e.text==='学习进程'),false);
});
test('Unified project type hides ability and uses project labels',()=>{
	const f=fixture(),m=new f.Unified(f.app);m.onOpen();button(m,'创作').onclick();button(m,'项目与成果').onclick();control(m,'项目与成果名称');control(m,'项目目标（可选）');assert.equal(m.contentEl.all().some((e:Element)=>e.attr['aria-label']==='培养能力（可选）'),false);assert.equal(m.contentEl.all().some((e:Element)=>e.text==='＋ 新建能力'),false);
});
test('Direction loads only its abilities and switching direction clears the old choice',async()=>{
	const f=fixture();direction(f,'设计',['3D 产品视觉','商业视觉']);direction(f,'英语',['口语']);const m=new f.Unified(f.app);m.onOpen();set(m,'方向（可选）','设计');await flush();assert.deepEqual(control(m,'培养能力（可选）').children.map(e=>e.value),['','3D 产品视觉','商业视觉']);set(m,'培养能力（可选）','3D 产品视觉');set(m,'方向（可选）','英语');assert.equal(control(m,'培养能力（可选）').disabled,true);await flush();assert.deepEqual(control(m,'培养能力（可选）').children.map(e=>e.value),['','口语']);assert.equal(control(m,'培养能力（可选）').value,'');
});
test('Type switching clears the learning-only ability without writing',async()=>{
	const f=fixture();direction(f,'设计',['能力']);const m=new f.Unified(f.app);m.onOpen();const before=[...f.files];set(m,'课程名称','名称');set(m,'方向（可选）','设计');await flush();set(m,'培养能力（可选）','能力');set(m,'学习目标（可选）','目标');set(m,'状态','暂停');button(m,'创作').onclick();assert.equal(control(m,'知识与思考名称').value,'名称');assert.equal(control(m,'目标（可选）').value,'目标');assert.equal(control(m,'状态').value,'暂停');button(m,'学习').onclick();await flush();assert.equal(control(m,'培养能力（可选）').value,'');assert.deepEqual([...f.files],before);
});
test('Unified status choices are identical for learning and creation',()=>{
	const f=fixture(),m=new f.Unified(f.app);m.onOpen();for(const type of ['学习','创作']){button(m,type).onclick();assert.deepEqual(control(m,'状态').children.map(e=>e.value),['计划中','进行中','暂停','已完成','归档']);}
});
test('Unified learning creation writes a direct course process and opens its Markdown',async()=>{
	const f=fixture();direction(f,'设计',['建模']);const m=new f.Unified(f.app);m.onOpen();set(m,'课程名称','新学习');set(m,'方向（可选）','设计');await flush();set(m,'培养能力（可选）','建模');set(m,'状态','进行中');set(m,'开始日期（可选）','2026-09-01');set(m,'截止日期（可选）','2026-09-30');set(m,'学习目标（可选）','明确学习目标');await button(m,'创建进程').onclick();const path='01-学习与资料/课程/新学习.md',raw=f.files.get(path)!;for(const s of ['类型: 学习资源','资源类型: "课程"','状态: 进行中','方向: "设计"','所属能力: ["建模"]','开始日期: "2026-09-01"','截止日期: "2026-09-30"','## 学习目标\n\n明确学习目标','## 学习任务','## 来源内容'])assert.ok(raw.includes(s),s);assert.equal(raw.includes('项目ID'),false);assert.deepEqual(f.opened,[{file:path}]);assert.equal(m.closed,true);
});
test('New ability writes the selected direction, refreshes selector and selects it immediately',async()=>{
	const f=fixture();direction(f,'设计',[]);const m=new f.Unified(f.app);m.onOpen();set(m,'方向（可选）','设计');await flush();button(m,'＋ 新建能力').onclick();const child=f.openedModal()!;assert.ok(child);set(child,'能力名称','3D 产品视觉');await button(child,'添加').onclick();await flush();assert.equal(control(m,'培养能力（可选）').value,'3D 产品视觉');assert.ok(f.files.get('05-计划/01-人生方向/设计.md')!.includes('- 3D 产品视觉'));assert.equal(child.closed,true);
});
test('Duplicate ability reports and auto-selects the existing item',async()=>{
	const f=fixture();direction(f,'设计',['Blender']);const m=new f.Unified(f.app);m.onOpen();set(m,'方向（可选）','设计');await flush();button(m,'＋ 新建能力').onclick();const child=f.openedModal()!;set(child,'能力名称',' blender ');await button(child,'添加').onclick();await flush();assert.equal(control(m,'培养能力（可选）').value,'Blender');assert.ok(f.notices.includes('该能力已存在'));assert.equal((f.files.get('05-计划/01-人生方向/设计.md')!.match(/^- Blender$/gm)||[]).length,1);
});
test('Ability edit stays disabled without a selection and opens the original small modal when selected',async()=>{
	const f=fixture();direction(f,'英语',['英文信息获取']);const m=new f.Unified(f.app);m.onOpen();set(m,'方向（可选）','英语');await flush();assert.equal(button(m,'编辑').disabled,true);set(m,'培养能力（可选）','英文信息获取');assert.equal(button(m,'编辑').disabled,false);button(m,'编辑').onclick();const edit=f.openedModal()!;assert.equal(edit.contentEl.all().find((e:Element)=>e.tag==='h3')!.text,'编辑能力');assert.ok(edit.contentEl.all().some((e:Element)=>e.text==='当前方向：英语'));assert.equal(control(edit,'能力名称').value,'英文信息获取');
});
test('Cancelling learning-reference sync keeps the renamed direction ability and refreshes the current selection',async()=>{
	const f=fixture(),path='01-学习与资料/课程/英语新闻.md';direction(f,'英语',['英文信息获取']);f.files.set(path,'---\n类型: 学习资源\n资源类型: 课程\n方向: 英语\n所属能力: ["英文信息获取"]\n---\n\n正文');
	const m=new f.Unified(f.app);m.onOpen();set(m,'方向（可选）','英语');await flush();set(m,'培养能力（可选）','英文信息获取');button(m,'编辑').onclick();const edit=f.openedModal()!;set(edit,'能力名称','英文信息检索');await button(edit,'保存').onclick();await flush();
	const confirm=f.openedModal()!;assert.ok(confirm.contentEl.all().some((e:Element)=>e.text==='有 1 篇学习内容正在使用此能力，是否同步更新？'));assert.equal(control(m,'培养能力（可选）').value,'英文信息检索');assert.ok(f.files.get('05-计划/01-人生方向/英语.md')!.includes('- 英文信息检索'));button(confirm,'取消').onclick();await flush();assert.ok(f.files.get(path)!.includes('所属能力: ["英文信息获取"]'));
});
test('Confirming ability sync updates every matching learning note immediately',async()=>{
	const f=fixture(),paths=['01-学习与资料/课程/英语新闻.md','01-学习与资料/书籍/英文阅读.md'];direction(f,'英语',['英文信息获取']);for(const path of paths)f.files.set(path,'---\n类型: 学习资源\n资源类型: 课程\n方向: 英语\n所属能力: ["英文信息获取"]\n---\n\n正文');
	const m=new f.Unified(f.app);m.onOpen();set(m,'方向（可选）','英语');await flush();set(m,'培养能力（可选）','英文信息获取');button(m,'编辑').onclick();const edit=f.openedModal()!;set(edit,'能力名称','英文信息检索');await button(edit,'保存').onclick();await flush();const confirm=f.openedModal()!;assert.ok(confirm.contentEl.all().some((e:Element)=>e.text==='有 2 篇学习内容正在使用此能力，是否同步更新？'));button(confirm,'同步更新').onclick();await flush();await flush();for(const path of paths)assert.ok(f.files.get(path)!.includes('所属能力: ["英文信息检索"]'));assert.ok(f.notices.includes('已同步更新 2 篇学习内容'));
});
test('Learning duplicate creation leaves existing note untouched and modal open',async()=>{
	const f=fixture(),m=new f.Unified(f.app);const path='01-学习与资料/课程/已有学习.md';f.files.set(path,'真实内容');m.onOpen();set(m,'课程名称','已有学习');await button(m,'创建进程').onclick();assert.equal(f.files.get(path),'真实内容');assert.equal(m.closed,false);assert.equal(button(m,'创建进程').disabled,false);assert.ok(f.notices.some(n=>n.includes('不会覆盖')));
});
test('Double submit cannot create duplicate process notes',async()=>{
	const f=fixture(),m=new f.Unified(f.app);m.onOpen();set(m,'课程名称','单次创建');const create=button(m,'创建进程');await Promise.all([create.onclick(),create.onclick()]);assert.equal([...f.files.keys()].filter(p=>p.includes('单次创建')).length,1);assert.equal(f.notices.length,0);
});
test('Project save never leaks learning-only ability into project Markdown',async()=>{
	const f=fixture();direction(f,'设计',['仅学习字段']);const m=new f.Unified(f.app);m.onOpen();set(m,'课程名称','切换项目');set(m,'方向（可选）','设计');await flush();set(m,'培养能力（可选）','仅学习字段');button(m,'创作').onclick();button(m,'项目与成果').onclick();await button(m,'创建进程').onclick();const raw=f.files.get('03-项目与成果/切换项目/切换项目.md')!;assert.ok(raw.includes('类型: 项目'));assert.equal(raw.includes('所属能力'),false);assert.equal(raw.includes('仅学习字段'),false);
});
test('Both global shell dispatch paths use UnifiedProcessModal directly',()=>{
	for(const file of ['../main.ts','../views/DashboardView.ts']){const code=readFileSync(new URL(file,import.meta.url),'utf8');assert.ok(code.includes("action === 'project'"));assert.ok(code.includes('new UnifiedProcessModal(this.app).open()'));assert.equal(code.includes('new NewProjectModal'),false);}
});
test('Homepage and theme list have no duplicate process creation while resource creation stays',()=>{
	const card=readFileSync(new URL('../components/workbench/LearningCard.ts',import.meta.url),'utf8'),list=readFileSync(new URL('../views/LearningModals.ts',import.meta.url),'utf8');assert.equal(card.includes('actions.create'),false);assert.equal(card.includes('建立学习主题'),false);assert.ok(list.includes("if (this.mode !== 'topics')"));assert.ok(list.includes("this.mode === 'queue' ? '学习资源' : '能力'"));
});
test('Compact Quick Task Preview gains no creation button or UnifiedProcessModal dependency',()=>{
	const source=readFileSync(new URL('../views/ProcessTasksModal.ts',import.meta.url),'utf8');for(const text of ['新增任务','新建任务','UnifiedProcessModal'])assert.equal(source.includes(text),false);assert.ok(source.includes('打开完整详情 →'));
});
test('Long-plan creation supports selecting and cancelling multiple compass directions',async()=>{
	const f=fixture(),m=new f.Plan(f.app,{year:2026,month:9});m.onOpen();button(m,'长计划').onclick();
	for(const value of ['设计','AI','3D'])button(m,value).onclick();button(m,'AI').onclick();
	set(m,'名称','多方向计划');button(m,'创建计划').onclick();await flush();await flush();const raw=f.files.get('05-计划/07-长期计划/多方向计划.md');assert.ok(raw,`未创建长期计划：${f.notices.join('；')}`);
	assert.match(raw,/方向:\n  - 设计\n  - 3D\n开始月份:/);assert.equal(raw.includes('  - AI\n'),false);
});
test('Long-plan edit modal echoes multiple directions and saves additions and removals',async()=>{
	const f=fixture();let saved:string[]=[];const m=new f.LongTermDirection(f.app,['设计','AI'],(directions:string[])=>{saved=directions;});m.onOpen();
	assert.equal(button(m,'设计').attr['aria-pressed'],'true');assert.equal(button(m,'AI').attr['aria-pressed'],'true');assert.equal(button(m,'3D').attr['aria-pressed'],'false');
	button(m,'AI').onclick();button(m,'3D').onclick();await button(m,'保存').onclick();assert.deepEqual(Array.from(saved),['设计','3D']);assert.equal(m.closed,true);
});
test('Long-plan edit modal allows clearing every optional direction',async()=>{
	const f=fixture();let saved=['unexpected'];const m=new f.LongTermDirection(f.app,['设计'],(directions:string[])=>{saved=directions;});m.onOpen();button(m,'设计').onclick();await button(m,'保存').onclick();assert.deepEqual(Array.from(saved),[]);
});
