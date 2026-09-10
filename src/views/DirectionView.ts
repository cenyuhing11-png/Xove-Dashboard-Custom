import { App, ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type { ViewStateResult } from 'obsidian';
import { directionAbilities, directionInfo, directionResources, directionTopics } from '../data/compass';
import { learningFiles, openLearningFile, scanLearning } from '../data/learningVault';
import { scanProjects } from '../data/projectVault';
import { directionProjects } from '../data/projects';
import { openProjects } from './ProjectView';
import { listEntry } from './viewPrimitives';

export const DIRECTION_VIEW = 'xove-dashboard-custom-direction';

/** Shared legacy direction-detail renderer. DashboardView mounts this inside the
 * unified workbench; DirectionView keeps it only for restored workspace tabs. */
export class DirectionDetailRenderer {
	private generation = 0;
	constructor(private app: App) {}
	cancel(): void { this.generation++; }
	async render(el: HTMLElement, direction: string): Promise<void> {
		const token = ++this.generation;
		if (!direction) return;
		try {
			const info = directionInfo(direction);
			const markdown = await learningFiles(this.app).read(info.path);
			if (token !== this.generation) return;
			el.empty();
			el.createEl('h1', { cls: 'ad-modal-title', text: info.name });
			const priority = this.app.metadataCache.getCache(info.path)?.frontmatter?.['优先级'];
			el.createEl('p', { cls: 'ad-modal-hint', text: `优先级：${typeof priority === 'string' ? priority : info.priority}` });
			const skills = el.createDiv({ cls: 'ad-update-block' });
			skills.createEl('h2', { cls: 'ad-modal-title', text: '长期能力' });
			const abilities = directionAbilities(markdown);
			if (!abilities.length) skills.createEl('p', { cls: 'ad-modal-hint', text: '尚未填写长期能力' });
			else { const list = skills.createEl('ul', { cls: 'ad-update-list' }); for (const ability of abilities) list.createEl('li', { text: ability }); }
			const notes = scanLearning(this.app);
			for (const [title, entries] of [['当前学习主题', directionTopics(notes, info.name)], ['相关学习资源', directionResources(notes, info.name)]] as const) {
				const section = el.createDiv({ cls: 'ad-update-block' });
				section.createEl('h2', { cls: 'ad-modal-title', text: title });
				if (!entries.length) section.createEl('p', { cls: 'ad-modal-hint', text: '暂无关联内容' });
				for (const note of entries) {
					listEntry(section, note.name, `状态：${note.status || '未填写'} · 能力：${note.abilities.join('、') || '未填写'}`, () => { void openLearningFile(this.app, note.path).catch(() => new Notice('笔记不存在或已移动')); });
				}
			}
			const projectSection = el.createDiv({ cls: 'ad-update-block' });
			projectSection.createEl('h2', { cls: 'ad-modal-title', text: '相关项目' });
			const projects = directionProjects(scanProjects(this.app), info.name);
			if (!projects.length) projectSection.createEl('p', { cls: 'ad-modal-hint', text: '暂无关联项目' });
			for (const p of projects) {
				listEntry(projectSection, p.name, `${p.status}${p.dueDate ? ` · 截止 ${p.dueDate}` : ''}`, () => { void openProjects(this.app, p); });
			}
			el.createEl('button', { cls: 'ad-modal-btn', text: '编辑方向笔记 →' }).onclick = () => { void openLearningFile(this.app, info.path).catch(() => new Notice('方向笔记不存在或已移动')); };
		} catch {
			if (token === this.generation) { el.empty(); el.createEl('p', { text: '方向笔记无法读取，请检查是否已移动或删除。' }); }
		}
	}
}

export class DirectionView extends ItemView {
	private direction = '';
	private renderer: DirectionDetailRenderer;
	constructor(leaf: WorkspaceLeaf) { super(leaf); this.renderer = new DirectionDetailRenderer(this.app); }
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
		this.contentEl.addClass('ad-modal');
		await this.render();
	}
	async onClose(): Promise<void> { this.renderer.cancel(); }
	private async render(): Promise<void> {
		await this.renderer.render(this.contentEl, this.direction);
	}
}
