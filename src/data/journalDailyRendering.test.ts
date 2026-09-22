import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dailyTaskPath } from './embeddedTasks.ts';
const require = createRequire(import.meta.url);
const cm = require('@codemirror/state') as typeof import('@codemirror/state');
const view = require('@codemirror/view') as typeof import('@codemirror/view');
class File { path = dailyTaskPath('2026-09-25'); }
const infoField = cm.StateField.define({ create: () => ({ file: new File() }), update: value => value });
const previewField = cm.StateField.define({ create: () => true, update: value => value });
function load(file: string) {
	const code = buildSync({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['obsidian', '@codemirror/state', '@codemirror/view'] }).outputFiles[0]!.text;
	const module: { exports: any } = { exports: {} };
	runInNewContext(code, { module, exports: module.exports, require: (id: string) => {
		if (id === '@codemirror/state') return cm;
		if (id === '@codemirror/view') return view;
		assert.equal(id, 'obsidian');
		return { TFile: File, TFolder: class {}, MarkdownRenderChild: class {}, Notice: class {}, editorInfoField: infoField, editorLivePreviewField: previewField };
	} });
	return module.exports;
}
const live = load('../components/journal/JournalTaskLivePreview.ts');
const reading = load('../components/journal/JournalTaskSummary.ts');
const markdown = '## 今日任务\n\n- [ ] 去医院 📅 2026-09-25 <!-- mx-task:daily-1 -->\n\n## 今日日记\n- [ ] 普通正文 checkbox';
function state(preview = true, selection = 0) {
	const extension = live.journalTaskLivePreviewExtension({}, {});
	return { extension, editor: cm.EditorState.create({ doc: markdown, selection: { anchor: selection }, extensions: [infoField, ...(preview ? [previewField] : []), extension] }) };
}
function ranges(editor: import('@codemirror/state').EditorState, extension: any) {
	const result: { from: number; to: number; widget: string }[] = [];
	editor.field<{ decorations: import('@codemirror/view').DecorationSet }>(extension).decorations.between(0, editor.doc.length, (from, to, decoration) => { result.push({ from, to, widget: decoration.spec.widget?.constructor.name }); });
	return result;
}
test('Live Preview replaces each true daily source row once and leaves ordinary checkboxes alone', () => {
	const { editor, extension } = state(); const list = ranges(editor, extension);
	assert.equal(list.length, 2); assert.equal(list.filter(range => range.widget === 'JournalDailyTaskWidget').length, 1);
	const row = list.find(range => range.widget === 'JournalDailyTaskWidget')!;
	assert.equal(editor.doc.sliceString(row.from, row.to), markdown.split('\n')[2]);
});
test('Source Mode contains no aggregate or daily replacement widgets', () => { const { editor, extension } = state(false); assert.equal(ranges(editor, extension).length, 0); assert.equal(editor.doc.toString(), markdown); });
test('editing a source row reveals real Markdown then restores a single daily widget on leaving', () => {
	const { editor, extension } = state(); const inRow = editor.update({ selection: { anchor: editor.doc.line(3).from } }).state;
	assert.equal(ranges(inRow, extension).filter(range => range.widget === 'JournalDailyTaskWidget').length, 0);
	const outside = inRow.update({ selection: { anchor: 0 } }).state;
	assert.equal(ranges(outside, extension).filter(range => range.widget === 'JournalDailyTaskWidget').length, 1);
});
class Element {
	children: Element[] = []; classes = new Set<string>(); dataset: Record<string,string> = {}; checked = false; text = ''; onclick?: unknown; onchange?: () => void;
	createEl(_tag: string, options: any = {}): Element { const child = new Element(); child.text = options.text ?? ''; (options.cls ?? '').split(' ').forEach((c: string) => child.classes.add(c)); this.children.push(child); return child; }
	createSpan(options: any): Element { return this.createEl('span', options); }
	empty() { this.children = []; }
	removeClass(name: string) { this.classes.delete(name); }
	addClass(name: string) { this.classes.add(name); }
}
test('Reading View resolves list-local source lines and renders one shared daily checkbox', () => {
	const item = new Element(); item.dataset.line = '0'; item.classes.add('task-list-item');
	const other = new Element(); other.dataset.line = '3'; other.classes.add('task-list-item');
	const el = { querySelectorAll: (selector: string) => selector.startsWith('li.') ? [item, other].filter(e => e.classes.has('task-list-item')) : [] };
	reading.mountJournalTaskSummary(el, { sourcePath: dailyTaskPath('2026-09-25'), getSectionInfo: () => ({ text: markdown, lineStart: 2, lineEnd: 2 }) }, {}, {});
	assert.equal(item.classes.has('task-list-item'), false); assert.equal(item.children.length, 2);
	assert.equal(item.children[0]!.children[0]!.classes.has('mx-embedded-task-check'), true);
	assert.equal(other.classes.has('task-list-item'), true); assert.equal(other.children.length, 0);
	reading.mountJournalTaskSummary(el, { sourcePath: dailyTaskPath('2026-09-25'), getSectionInfo: () => ({ text: markdown, lineStart: 2, lineEnd: 2 }) }, {}, {});
	assert.equal(item.children.length, 2);
});
