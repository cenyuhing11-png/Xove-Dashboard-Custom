import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

class Element {
	children: Element[] = [];
	classes = new Set<string>();
	attrs: Record<string, string> = {};
	checked = false;
	disabled = false;
	onclick: (event: { stopPropagation(): void }) => void = () => {};
	onchange: () => void = () => {};
	createEl(_tag: string, options: any = {}): Element {
		const child = new Element();
		for (const cls of (options.cls ?? '').split(' ').filter(Boolean)) child.classes.add(cls);
		child.attrs = options.attr ?? {};
		this.children.push(child);
		return child;
	}
	createSpan(options: any = {}): Element { return this.createEl('span', options); }
}

const code = buildSync({
	entryPoints: [fileURLToPath(new URL('../components/tasks/EmbeddedTaskCheckbox.ts', import.meta.url))],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	write: false,
	external: ['obsidian'],
}).outputFiles[0]!.text;

function render(completed: boolean) {
	const writes: boolean[] = [];
	const module: { exports: any } = { exports: {} };
	runInNewContext(code, { module, exports: module.exports, require: () => ({ Notice: class {} }) });
	const parent = new Element();
	const task = { text: '示例任务', completed };
	const store = { complete: async (_task: unknown, value: boolean) => { writes.push(value); } };
	const check = module.exports.renderEmbeddedTaskCheckbox(parent, task, store) as Element;
	return { check, writes };
}

test('shared EmbeddedTaskCheckbox renders one empty unchecked control', () => {
	const { check } = render(false);
	assert.equal(check.checked, false);
	assert.ok(check.classes.has('mx-embedded-task-check'));
	assert.equal(check.attrs['aria-label'], '完成 示例任务');
});

test('shared EmbeddedTaskCheckbox renders the same control in checked state', () => {
	const { check } = render(true);
	assert.equal(check.checked, true);
	assert.ok(check.classes.has('mx-embedded-task-check'));
	assert.equal(check.attrs['aria-label'], '取消完成 示例任务');
});

test('shared EmbeddedTaskCheckbox preserves the original boolean write contract', async () => {
	const { check, writes } = render(false);
	check.checked = true;
	check.onchange();
	await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(writes, [true]);
});
