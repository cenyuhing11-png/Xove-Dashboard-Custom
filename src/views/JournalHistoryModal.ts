import { App, Modal } from 'obsidian';
import { journalEntry, journalHistory } from '../data/journal';
import type { JournalEntry, JournalKind } from '../data/journal';

export class JournalHistoryModal extends Modal {
	private list!: HTMLElement;
	private off: Array<() => void> = [];
	constructor(app: App, private mode: 'records' | 'reviews', private openNote: (path: string) => Promise<void>, private create: (kind: JournalKind) => Promise<void>) { super(app); }
	onOpen(): void {
		this.contentEl.createEl('h2', { text: this.mode === 'records' ? '最近记录' : '查看复盘' });
		if (this.mode === 'reviews') {
			for (const [kind, label] of [['month', '月度复盘'], ['year', '年度复盘']] as const) {
				this.contentEl.createEl('button', { text: `＋ 新建${label}` }).onclick = () => { this.close(); void this.create(kind); };
			}
		}
		this.list = this.contentEl.createDiv();
		const update = () => this.render();
		const changed = this.app.metadataCache.on('changed', update);
		const resolved = this.app.metadataCache.on('resolved', update);
		const deleted = this.app.vault.on('delete', update);
		const renamed = this.app.vault.on('rename', update);
		this.off = [() => this.app.metadataCache.offref(changed), () => this.app.metadataCache.offref(resolved), () => this.app.vault.offref(deleted), () => this.app.vault.offref(renamed)];
		this.render();
	}
	private render(): void {
		this.list.empty();
		const entries: JournalEntry[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			const entry = journalEntry(file.path, file.basename, this.app.metadataCache.getFileCache(file)?.frontmatter);
			if (entry) entries.push(entry);
		}
		const recent = journalHistory(entries, this.mode);
		if (!recent.length) this.list.createEl('p', { text: this.mode === 'records' ? '暂无日记或周记' : '暂无月度或年度复盘' });
		for (const entry of recent) {
			const row = this.list.createEl('section');
			row.createEl('h3').createEl('button', { text: entry.title }).onclick = () => { this.close(); void this.openNote(entry.path); };
			row.createEl('p', { text: `${entry.label} · ${entry.period}` });
		}
	}
	onClose(): void { this.off.forEach((off) => off()); this.off = []; this.contentEl.empty(); }
}
