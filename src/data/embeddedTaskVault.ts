import { App, Notice, Plugin, TFile, TFolder } from 'obsidian';
import { EmbeddedTaskIndex } from './embeddedTasks';

import { ensureCanonicalDailyJournal } from './journal';
import { quickJournalFiles } from './quickJournalVault';

export class EmbeddedTaskStore extends EmbeddedTaskIndex {
	private listeners = new Set<() => void>();
	private timer?: ReturnType<typeof setTimeout>;
	readonly ready: Promise<void>;
	constructor(app: App, owner: Plugin) {
		const file = (path: string): TFile => {
			const entry = app.vault.getAbstractFileByPath(path);
			if (!(entry instanceof TFile)) throw new Error('任务来源已删除或移动，请刷新后重试');
			return entry;
		};
		super({
			paths: () => app.vault.getMarkdownFiles().map(f => f.path),
			read: path => app.vault.read(file(path)),
			process: async (path, update) => { await app.vault.process(file(path), update); },
			ensureDaily: async date => { await ensureCanonicalDailyJournal(quickJournalFiles(app), date); },
		}, () => crypto.randomUUID());
		const dirty = new Set<string>();
		const schedule = (entry: { path: string }, oldPath?: string) => {
			dirty.add(entry.path); if (oldPath) dirty.add(oldPath);
			if (entry instanceof TFolder) {
				for (const file of app.vault.getMarkdownFiles()) if (file.path.startsWith(`${entry.path}/`)) dirty.add(file.path);
				for (const task of this.all()) if (task.sourceFile.startsWith(`${oldPath ?? entry.path}/`)) dirty.add(task.sourceFile);
			}
			clearTimeout(this.timer);
			this.timer = setTimeout(() => { const paths = [...dirty]; dirty.clear(); void this.refresh(paths).catch(e => new Notice(`任务索引更新失败：${String(e)}`)); }, 150);
		};
		owner.registerEvent(app.vault.on('create', entry => schedule(entry)));
		owner.registerEvent(app.vault.on('modify', entry => schedule(entry)));
		owner.registerEvent(app.vault.on('delete', entry => schedule(entry)));
		owner.registerEvent(app.vault.on('rename', (entry, oldPath) => schedule(entry, oldPath)));
		owner.register(() => { clearTimeout(this.timer); this.listeners.clear(); });
		this.ready = this.refresh().catch(e => { new Notice(`任务索引初始化失败：${String(e)}`); });
	}
	override async refresh(changed?: readonly string[]): Promise<void> { await super.refresh(changed); this.listeners.forEach(fn => fn()); }
	subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
