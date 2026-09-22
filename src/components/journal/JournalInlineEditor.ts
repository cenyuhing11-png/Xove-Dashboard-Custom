import { MarkdownRenderer, TFile } from 'obsidian';
import type { App, Component } from 'obsidian';
import { JournalInlineDocument, JournalInlineDraft, editableJournalSections, editablePlanSections, sectionValue } from '../../data/journalInline';
import type { EditorField } from '../../data/journalInline';
import type { JournalKind } from '../../data/journal';

/** Keeps textarea nodes stable across our own Vault/metadata events. */
export class JournalInlineEditor {
	private drafts: JournalInlineDraft[] = [];
	private updates: Array<() => void> = [];
	private disposed = false;
	private refreshVersion = 0;
	private disposers: Array<() => void> = [];
	constructor(private app: App, private owner: Component, private doc: JournalInlineDocument, private sourcePath: () => string, private saved: () => void) {}
	get dirty() { return this.drafts.some(d => d.dirty); }
	get busy() { return this.drafts.some(d => d.state === 'saving' || d.composing); }
	async mount(parent: HTMLElement, kind: JournalKind, plan = false): Promise<void> {
		const source = await this.doc.read();
		if (this.disposed) return;
		if (kind === 'day') this.field(parent, { kind: 'title' }, source, '', '给今天一个标题…', true);
		for (const title of plan && kind !== 'day' ? editablePlanSections(kind) : editableJournalSections(kind)) {
			const section = parent.createDiv({ cls: 'mx-journal-inline-section' });
			section.createEl('h3', { cls: 'mx-journal-inline-heading', text: title });
			if (kind === 'day' && title === '随时记') {
				const entries = section.createDiv({ cls: 'mx-journal-inline-entries markdown-rendered' });
				let previous = '';
				const updateEntries = async () => { const text = await this.doc.read(); const value = sectionValue(text, '随时记'); if (this.disposed || value === previous) return; previous = value; entries.empty(); if (value) await MarkdownRenderer.render(this.app, value, entries, this.sourcePath(), this.owner); };
				this.updates.push(() => { void updateEntries(); }); await updateEntries();
				this.field(section, { kind: 'quick' }, source, '追加随时记', '今天想到……');
			} else this.field(section, { kind: 'section', title, ...(plan && title === '今年最想实现的突破' ? { fallbackTitle: '年度核心突破' } : {}) }, source, title, kind === 'day' ? title === '今日日记' ? '今天主要……' : '今天值得记住……' : plan ? '在这里写下你的计划……' : '在这里写下你的复盘……');
		}
	}
	private field(parent: HTMLElement, field: EditorField, source: string, label: string, placeholder: string, title = false): void {
		const row = parent.createDiv({ cls: `mx-journal-inline-field${title ? ' is-title' : ''}` });
		const editorRow = title ? row.createDiv({ cls: 'mx-journal-title-row' }) : row;
		if (title) editorRow.createSpan({ cls: 'mx-journal-title-label', text: '标题：' });
		const input = editorRow.createEl('textarea', { cls: 'mx-journal-inline-input', attr: { rows: '1', placeholder, 'aria-label': label || '日记标题', 'data-journal-field': field.kind === 'section' ? field.title : field.kind } });
		const footer = row.createDiv({ cls: 'mx-journal-inline-state' });
		const status = footer.createSpan({ attr: { role: 'status', 'aria-live': 'polite' } });
		const retry = footer.createEl('button', { text: '重试', cls: 'mx-inline-action', attr: { type: 'button' } });
		const reload = footer.createEl('button', { text: '重新加载', cls: 'mx-inline-action', attr: { type: 'button' } });
		const keep = footer.createEl('button', { text: '保留当前输入', cls: 'mx-inline-action', attr: { type: 'button' } });
		let fade: ReturnType<typeof setTimeout> | undefined; let lastSaved = false;
		const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.max(input.scrollHeight, 38)}px`; };
		// Observe width only: changing height must not trigger an observer loop.
		if (typeof ResizeObserver !== 'undefined') {
			let width = -1;
			const observer = new ResizeObserver(entries => { const next = entries[0]?.contentRect.width; if (next !== undefined && next !== width) { width = next; grow(); } });
			observer.observe(input); this.disposers.push(() => observer.disconnect());
		}
		if (typeof window !== 'undefined') { window.addEventListener('resize', grow); this.disposers.push(() => window.removeEventListener('resize', grow)); }
		this.disposers.push(() => { if (fade) clearTimeout(fade); });
		const draft = new JournalInlineDraft(this.doc, field, source, () => {
			if (this.disposed) return;
			if (!draft.composing && input.value !== draft.value) input.value = draft.value;
			grow(); if (fade) clearTimeout(fade);
			row.toggleClass('has-save-error', draft.state === 'error' || draft.state === 'conflict');
			status.textContent = draft.state === 'saving' ? '保存中…' : draft.state === 'saved' ? '已保存' : draft.state === 'error' ? `保存失败：${draft.message}` : draft.state === 'conflict' ? draft.message : draft.state === 'pending' ? '待保存' : '';
			retry.hidden = draft.state !== 'error'; reload.hidden = draft.state !== 'conflict'; keep.hidden = draft.state !== 'conflict';
			if (draft.state === 'saved') { fade = setTimeout(() => { status.textContent = ''; }, 1800); if (!lastSaved) { this.saved(); this.updates.forEach(update => update()); } }
			lastSaved = draft.state === 'saved';
		});
		this.drafts.push(draft); input.value = draft.value; retry.hidden = reload.hidden = keep.hidden = true; grow();
		input.addEventListener('input', () => { draft.input(input.value); grow(); });
		input.addEventListener('compositionstart', () => draft.composition(true));
		input.addEventListener('compositionend', () => { draft.input(input.value); draft.composition(false); });
		input.addEventListener('blur', () => { void draft.flush(true); });
		input.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) { event.preventDefault(); void draft.flush(true); } });
		retry.onclick = () => { void draft.flush(); };
		reload.onclick = () => { void draft.reload().catch(() => { status.textContent = '重新加载失败，当前输入仍保留'; }); };
		keep.onclick = () => { input.focus(); status.textContent = '当前输入已保留；外部冲突解决前不会覆盖原文'; };
	}
	async flush(): Promise<boolean> { const results = await Promise.all(this.drafts.map(d => d.flush(true))); return results.every(Boolean); }
	async refresh(): Promise<void> { const token = ++this.refreshVersion; if (this.busy) return; await Promise.all(this.drafts.map(d => d.refresh())); if (token === this.refreshVersion) this.updates.forEach(update => update()); }
	async destroy(): Promise<boolean> { const ok = await this.flush(); if (ok) { this.disposed = true; this.disposers.splice(0).forEach(dispose => dispose()); } return ok; }
}

export function journalInlineFiles(app: App, currentPath: () => string, ensure: () => Promise<void>) {
	return {
		read: async () => { const file = app.vault.getAbstractFileByPath(currentPath()); if (!file) return ''; if (!(file instanceof TFile)) throw new Error('日记路径被文件夹占用'); return app.vault.read(file); },
		ensure,
		process: async (update: (latest: string) => string) => { const file = app.vault.getAbstractFileByPath(currentPath()); if (!(file instanceof TFile)) throw new Error('日记文件不存在'); await app.vault.process(file, update); },
	};
}
