import { App, ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type { ViewStateResult } from 'obsidian';
import { directionAbilities, directionInfo, directionResources, directionTopics, ensureDirection } from '../data/compass';
import { learningFiles, openLearningFile, scanLearning } from '../data/learningVault';

export const DIRECTION_VIEW = 'xove-dashboard-custom-direction';
export async function openDirection(app: App, name: string): Promise<void> {
	try {
		await ensureDirection(learningFiles(app), name);
		const leaf = app.workspace.getLeavesOfType(DIRECTION_VIEW).find(leaf => leaf.view instanceof DirectionView && leaf.view.getState().direction === name) ?? app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: DIRECTION_VIEW, active: true, state: { direction: name } });
		await app.workspace.revealLeaf(leaf);
	} catch (error) { new Notice(`无法打开方向：${error instanceof Error ? error.message : '请检查权限'}`); }
}
export class DirectionView extends ItemView {
	private direction = '';
	private generation = 0;
	constructor(leaf: WorkspaceLeaf) { super(leaf); }
	getViewType(): string { return DIRECTION_VIEW; }
	getDisplayText(): string { return this.direction || '人生方向'; }
	getIcon(): string { return 'compass'; }
	getState() { return { direction: this.direction }; }
	async setState(state: { direction?: string }, result: ViewStateResult): Promise<void> {
		this.direction = typeof state.direction === 'string' ? state.direction : '';
		await this.render();
		await super.setState(state, result);
	}
	async onOpen(): Promise<void> {
		const update = () => { void this.render(); };
		this.registerEvent(this.app.metadataCache.on('changed', update));
		this.registerEvent(this.app.metadataCache.on('resolved', update));
		this.registerEvent(this.app.vault.on('modify', update));
		this.registerEvent(this.app.vault.on('delete', update));
		this.registerEvent(this.app.vault.on('rename', update));
		this.contentEl.addClass('mx-direction');
		await this.render();
	}
	async onClose(): Promise<void> { this.generation++; }
	private async render(): Promise<void> {
		const token = ++this.generation;
		if (!this.direction) return;
		try {
			const info = directionInfo(this.direction);
			const markdown = await learningFiles(this.app).read(info.path);
			if (token !== this.generation) return;
			const el = this.contentEl;
			el.empty();
			el.createEl('h1', { text: info.name });
			const priority = this.app.metadataCache.getCache(info.path)?.frontmatter?.['优先级'];
			el.createEl('p', { text: `优先级：${typeof priority === 'string' ? priority : info.priority}` });
			el.createEl('h2', { text: '长期能力' });
			const abilities = directionAbilities(markdown);
			if (!abilities.length) el.createEl('p', { text: '尚未填写长期能力' });
			else { const list = el.createEl('ul'); for (const ability of abilities) list.createEl('li', { text: ability }); }
			const notes = scanLearning(this.app);
			for (const [title, entries] of [['当前学习主题', directionTopics(notes, info.name)], ['相关学习资源', directionResources(notes, info.name)]] as const) {
				el.createEl('h2', { text: title });
				if (!entries.length) el.createEl('p', { text: '暂无关联内容' });
				for (const note of entries) {
					el.createEl('button', { text: note.name }).onclick = () => { void openLearningFile(this.app, note.path).catch(() => new Notice('笔记不存在或已移动')); };
					el.createEl('p', { text: `状态：${note.status || '未填写'} · 能力：${note.abilities.join('、') || '未填写'}` });
				}
			}
			el.createEl('h2', { text: '项目与作品' });
			el.createEl('p', { text: '项目方向关联后续接入' });
			el.createEl('button', { text: '编辑方向笔记 →' }).onclick = () => { void openLearningFile(this.app, info.path).catch(() => new Notice('方向笔记不存在或已移动')); };
		} catch { if (token === this.generation) { this.contentEl.empty(); this.contentEl.createEl('p', { text: '方向笔记无法读取，请检查是否已移动或删除。' }); } }
	}
}
