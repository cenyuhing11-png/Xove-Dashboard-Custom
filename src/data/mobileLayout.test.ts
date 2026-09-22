import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Reconstructed regression tests; original uncommitted test text was not recoverable.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../../styles.css');
const mobileCss = css.slice(css.indexOf('/* ============================================================\n   Mobile Layout v1'), css.indexOf('/* Journal & Review:'));
const shell = read('../components/workbench/WorkbenchShell.ts');
const plan = read('../views/PlanView.ts');
const calendar = read('../components/timeTrace/TimeTraceMiniCalendar.ts');
const quick = read('../views/QuickJournalModal.ts');
const rule = (selector: string) => {
	const start = css.indexOf(`${selector} {`);
	assert.ok(start >= 0, selector);
	return css.slice(start, css.indexOf('}', start) + 1);
};

test('new layout geometry is restricted to Obsidian mobile phone selectors', () => {
	assert.ok(mobileCss.length > 1000);
	const stripped = mobileCss.replace(/\/\*[\s\S]*?\*\//g, '');
	for (const block of stripped.split('}').filter(part => part.includes('{'))) {
		for (const selector of block.split('{')[0]!.split(',')) assert.ok(selector.trim().startsWith('body.is-mobile.is-phone '), selector);
	}
	assert.doesNotMatch(mobileCss, /@media|@container/);
});

test('phone navigation has four columns and actions retain the deployed three by two layout', () => {
	assert.match(rule('body.is-mobile.is-phone .dashboard-plugin .ad-toolbar__group--primary'), /repeat\(4, minmax\(0, 1fr\)\)/);
	assert.match(rule('body.is-mobile.is-phone .dashboard-plugin .ad-toolbar__group--action'), /repeat\(3, minmax\(0, 1fr\)\)/);
	assert.match(shell, /actGroup\.appendChild\(makeBtn\([\s\S]*?action: 'classic'/);
});

test('phone time tabs and calendar retain full width with a separate week number column', () => {
	assert.match(rule('body.is-mobile.is-phone .mx-time-trace-nav'), /repeat\(4, minmax\(0, 1fr\)\)/);
	assert.match(rule('body.is-mobile.is-phone .mx-mini-calendar-grid'), /width: 100%;[\s\S]*max-width: none;[\s\S]*22px repeat\(7, minmax\(0, 1fr\)\)/);
	assert.match(rule('.mx-mini-calendar-toggle'), /display: none/);
});

test('quick journal scroll body and sticky footer fit inside the visual viewport', () => {
	assert.match(rule('body.is-mobile.is-phone .mx-quick-journal-body'), /min-height: 0;[\s\S]*overflow-y: auto/);
	assert.match(rule('body.is-mobile.is-phone .mx-quick-journal-footer'), /position: sticky;[\s\S]*bottom: 0;[\s\S]*flex: 0 0 auto/);
	assert.match(rule('body.is-mobile.is-phone .mx-quick-journal-input'), /max-height: var\(--mx-quick-journal-textarea-max\)/);
});

test('calendar starts collapsed only on phones and keeps shared TimeFocus navigation', () => {
	assert.match(plan, /private mobileCalendarExpanded = false/);
	assert.match(plan, /collapsed: this\.isMobilePhone\(\) && !this\.mobileCalendarExpanded/);
	assert.match(plan, /onToggleCollapsed: \(\) => \{ this\.mobileCalendarExpanded = !this\.mobileCalendarExpanded; void this\.renderPlanContent\(\); \}/);
	for (const scope of ['Year', 'Quarter', 'Month', 'Week', 'Day']) assert.ok(calendar.includes(`select${scope}(`));
	assert.match(calendar, /parent\.toggleClass\('is-calendar-collapsed', !!options\.collapsed\)/);
	assert.match(calendar, /'aria-expanded': String\(!options\.collapsed\)/);
});

test('quick journal keeps input in scroll body and buttons in a separate footer', () => {
	assert.match(quick, /const body = el\.createDiv\(\{ cls: 'mx-quick-journal-body' \}\)/);
	assert.match(quick, /const input = body\.createEl\('textarea'/);
	assert.match(quick, /const footer = el\.createDiv\(\{ cls: 'ad-modal-btns mx-quick-journal-footer' \}\)/);
});

interface Viewport { height: number; offsetTop: number; addEventListener(name: string, fn: () => void): void; removeEventListener(name: string, fn: () => void): void }
interface Probe { attachViewportListeners(): void; detachViewportListeners(): void; onClose(): void }
function harness(classes = ['is-mobile', 'is-phone'], hasViewport = true) {
	const values = new Map<string, string>();
	const listeners = new Map<string, Set<() => void>>();
	const removed: string[] = [];
	let closed = false;
	const viewport: Viewport = {
		height: 700, offsetTop: 18.6,
		addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
		removeEventListener(name, fn) { assert.ok(listeners.get(name)?.delete(fn)); },
	};
	class Modal {
		modalEl = { style: { setProperty: (key: string, value: string) => values.set(key, value) }, removeClass: (key: string) => removed.push(key) };
		contentEl = { removeClass: (key: string) => removed.push(key) };
		containerEl = { closest: () => ({ removeClass: (key: string) => removed.push(key) }) };
	}
	const exports: { QuickJournalModal?: new (...args: unknown[]) => Probe } = {};
	const code = ts.transpileModule(quick, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
	runInNewContext(code, {
		exports,
		require: (id: string) => {
			if (id === 'obsidian') return { Modal, Notice: class {} };
			if (id === './viewPrimitives.ts') return { closeListModal: () => { closed = true; } };
			throw new Error(`Unexpected import: ${id}`);
		},
		document: { body: { classList: { contains: (name: string) => classes.includes(name) } } },
		window: { visualViewport: hasViewport ? viewport : undefined, innerHeight: 800 },
	});
	const modal = new exports.QuickJournalModal!({}, {});
	return { modal, viewport, values, listeners, removed, closed: () => closed, fire: (name: string) => listeners.get(name)?.forEach(fn => fn()) };
}

test('phone viewport initializes height offset and textarea bounds', () => {
	const h = harness(); h.modal.attachViewportListeners();
	assert.equal(h.values.get('--mx-quick-journal-vh'), '688px');
	assert.equal(h.values.get('--mx-quick-journal-top'), '19px');
	assert.equal(h.values.get('--mx-quick-journal-textarea-max'), '238px');
});

test('keyboard resize updates viewport values and clamps small heights', () => {
	const h = harness(); h.modal.attachViewportListeners();
	h.viewport.height = 200; h.fire('resize');
	assert.equal(h.values.get('--mx-quick-journal-vh'), '240px');
	assert.equal(h.values.get('--mx-quick-journal-textarea-max'), '72px');
});

test('viewport scroll updates and clamps the top offset', () => {
	const h = harness(); h.modal.attachViewportListeners();
	h.viewport.offsetTop = 42.7; h.fire('scroll');
	assert.equal(h.values.get('--mx-quick-journal-top'), '43px');
	h.viewport.offsetTop = -10; h.fire('scroll');
	assert.equal(h.values.get('--mx-quick-journal-top'), '0px');
});

test('desktop and tablet never install phone viewport overrides', () => {
	for (const classes of [[], ['is-mobile'], ['is-phone']]) {
		const h = harness(classes); h.modal.attachViewportListeners();
		assert.equal(h.values.size, 0); assert.equal(h.listeners.size, 0);
	}
});

test('missing visualViewport falls back to innerHeight without listeners', () => {
	const h = harness(['is-mobile', 'is-phone'], false); h.modal.attachViewportListeners();
	assert.equal(h.values.get('--mx-quick-journal-vh'), '788px');
	assert.equal(h.values.get('--mx-quick-journal-top'), '0px');
	assert.equal(h.values.get('--mx-quick-journal-textarea-max'), '272px');
	assert.equal(h.listeners.size, 0); h.modal.onClose(); assert.ok(h.closed());
});

test('closing removes both exact viewport listeners and modal classes and permits reopening', () => {
	const h = harness(); h.modal.attachViewportListeners();
	assert.equal(h.listeners.get('resize')?.size, 1); assert.equal(h.listeners.get('scroll')?.size, 1);
	h.modal.onClose();
	assert.equal(h.listeners.get('resize')?.size, 0); assert.equal(h.listeners.get('scroll')?.size, 0);
	assert.deepEqual(h.removed, ['mx-quick-journal-modal', 'mx-quick-journal-content', 'mx-quick-journal-container']);
	assert.ok(h.closed()); h.modal.detachViewportListeners(); h.modal.attachViewportListeners();
	assert.equal(h.listeners.get('resize')?.size, 1); h.modal.onClose();
});
