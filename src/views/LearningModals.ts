import { App, Modal, Notice } from 'obsidian';
import type { EventRef } from 'obsidian';
import { abilityNotes, ensureLearningNote, queuedResources } from '../data/learning';
import type { LearningKind } from '../data/learning';
import { allLearningTopics } from '../data/compass';
import { learningFiles, openLearningFile, scanLearning } from '../data/learningVault';

export class NewLearningModal extends Modal {
	constructor(app: App, private kind: LearningKind) { super(app); }
	onOpen(): void {
		const el = this.contentEl;
		el.createEl('h3', { text: `新建${this.kind}` });
		const form = el.createEl('form');
		const label = form.createEl('label', { text: `${this.kind}名称` });
		const input = label.createEl('input', { type: 'text', attr: { placeholder: `输入${this.kind}名称`, 'aria-label': `${this.kind}名称`, required: 'true' } });
		const error = form.createDiv({ attr: { role: 'alert' } });
		form.createEl('button', { text: '取消', type: 'button' }).onclick = () => this.close();
		const submit = form.createEl('button', { text: '创建并打开', type: 'submit' });
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			if (submit.disabled) return;
			submit.disabled = true;
			void ensureLearningNote(learningFiles(this.app), this.kind, input.value)
				.then((path) => openLearningFile(this.app, path)).then(() => this.close())
				.catch((reason: unknown) => { error.setText(reason instanceof Error ? reason.message : '无法创建，请检查目录权限'); })
				.finally(() => { submit.disabled = false; });
		});
		input.focus();
	}
	onClose(): void { this.contentEl.empty(); }
}

export class LearningListModal extends Modal {
	private refs: Array<() => void> = [];
	private list!: HTMLElement;
	constructor(app: App, private mode: 'queue' | 'abilities' | 'topics') { super(app); }
	onOpen(): void {
		this.contentEl.createEl('h2', { text: this.mode === 'queue' ? '学习队列' : this.mode === 'topics' ? '学习主题' : '能力地图' });
		const kind = this.mode === 'queue' ? '学习资源' : this.mode === 'topics' ? '学习主题' : '能力';
		this.contentEl.createEl('button', { text: `＋ 新建${kind}` }).onclick = () => {
			this.close();
			new NewLearningModal(this.app, kind).open();
		};
		this.list = this.contentEl.createDiv();
		const update = () => this.render();
		const metadata: EventRef = this.app.metadataCache.on('changed', update);
		const resolved: EventRef = this.app.metadataCache.on('resolved', update);
		const deleted = this.app.vault.on('delete', update);
		const renamed = this.app.vault.on('rename', update);
		this.refs = [() => this.app.metadataCache.offref(metadata), () => this.app.metadataCache.offref(resolved), () => this.app.vault.offref(deleted), () => this.app.vault.offref(renamed)];
		this.render();
	}
	private render(): void {
		this.list.empty();
		const notes = this.mode === 'queue' ? queuedResources(scanLearning(this.app)) : this.mode === 'topics' ? allLearningTopics(scanLearning(this.app)) : abilityNotes(scanLearning(this.app));
		if (!notes.length) this.list.createEl('p', { text: this.mode === 'queue' ? '暂无排队中或待学习的资源' : this.mode === 'topics' ? '尚未建立学习主题' : '尚未建立能力笔记' });
		for (const note of notes) {
			const row = this.list.createEl('section');
			row.createEl('h3').createEl('button', { text: note.name }).onclick = () => {
				void openLearningFile(this.app, note.path).then(() => this.close()).catch(() => new Notice('笔记不存在或已移动'));
			};
			row.createEl('p', { text: this.mode === 'topics' ? `方向：${note.direction || '未关联'} · 能力：${note.abilities.join('、') || '未填写'} · 状态：${note.status || '未填写'} · 优先级：${note.priority || '未填写'}` : this.mode === 'queue'
				? `资源类型：${note.resourceType || '未填写'} · 关联主题：${note.topics.join('、') || '未关联'} · 状态：${note.status}`
				: `领域：${note.domain || '未填写'} · 阶段：${note.stage || '未填写'} · 状态：${note.status || '未填写'}` });
		}
	}
	onClose(): void { this.refs.forEach((off) => off()); this.refs = []; this.contentEl.empty(); }
}
