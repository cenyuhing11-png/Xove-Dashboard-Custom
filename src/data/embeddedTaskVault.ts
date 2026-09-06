import { App, Notice, Plugin, TFile, TFolder } from 'obsidian';
import { DAILY_TASK_FILE, DAILY_TASK_TEMPLATE, EmbeddedTaskIndex } from './embeddedTasks';

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
			ensureDaily: async () => {
				const existing = app.vault.getAbstractFileByPath(DAILY_TASK_FILE);
				if (existing instanceof TFile) return;
				if (existing) throw new Error('日常任务路径被目录占用');
				const root = '05-计划';
				if (!app.vault.getAbstractFileByPath(root)) {
					try { await app.vault.createFolder(root); }
					catch (e) { if (!(app.vault.getAbstractFileByPath(root) instanceof TFolder)) throw e; }
				}
				try { await app.vault.create(DAILY_TASK_FILE, DAILY_TASK_TEMPLATE); }
				catch (e) { if (!(app.vault.getAbstractFileByPath(DAILY_TASK_FILE) instanceof TFile)) throw e; }
			},
		}, () => crypto.randomUUID());
		const schedule = () => {
			clearTimeout(this.timer);
			this.timer = setTimeout(() => { void this.refresh().catch(e => new Notice(`任务索引更新失败：${String(e)}`)); }, 150);
		};
		owner.registerEvent(app.vault.on('create', schedule));
		owner.registerEvent(app.vault.on('modify', schedule));
		owner.registerEvent(app.vault.on('delete', schedule));
		owner.registerEvent(app.vault.on('rename', schedule));
		owner.register(() => { clearTimeout(this.timer); this.listeners.clear(); });
		this.ready = this.refresh().catch(e => { new Notice(`任务索引初始化失败：${String(e)}`); });
	}
	override async refresh(): Promise<void> { await super.refresh(); this.listeners.forEach(fn => fn()); }
	subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
