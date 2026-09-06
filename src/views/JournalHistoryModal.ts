import { App, Modal } from 'obsidian';
import { journalEntry, journalHistory } from '../data/journal';
import type { JournalEntry, JournalKind } from '../data/journal';
import { beginListModal, closeListModal, listEntry } from './viewPrimitives';

export class JournalHistoryModal extends Modal {
	private list!: HTMLElement;
	private off: Array<() => void> = [];
	constructor(app: App, private mode: 'records' | 'reviews', private openNote: (path: string) => Promise<void>, private create: (kind: JournalKind) => Promise<void>) { super(app); }
	onOpen(): void {
		beginListModal(this, this.mode === 'records' ? '最近记录' : '查看复盘');
		if (this.mode === 'reviews') {
			const actions = this.contentEl.createDiv({ cls: 'po-toolbar' });
			for (const [kind, label] of [['month', '月度复盘'], ['year', '年度复盘']] as const) {
				actions.createEl('button', { cls: 'ad-modal-btn', text: `＋ 新建${label}` }).onclick = () => { this.close(); void this.create(kind); };
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
		if (!recent.length) this.list.createEl('p', { cls: 'po-empty', text: this.mode === 'records' ? '暂无日记或周记' : '暂无月度或年度复盘' });
		for (const entry of recent) {
			listEntry(this.list, entry.title, `${entry.label} · ${entry.period}`, () => { this.close(); void this.openNote(entry.path); });
		}
	}
	onClose(): void { this.off.forEach((off) => off()); this.off = []; closeListModal(this); }
}
