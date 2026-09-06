import { App, Modal, Notice } from 'obsidian';
import type { EmbeddedTaskStore } from '../data/embeddedTaskVault';
import type { ProcessTaskSource } from '../data/processNavigation';
import { processPreviewTasks } from '../data/processNavigation';
import { processTypeLabel, taskProgressLabel } from '../data/processes';
import { renderEmbeddedRows } from './EmbeddedTaskModal';
import { beginListModal, closeListModal } from './viewPrimitives';

/** A transient task-only window. The existing EmbeddedTaskStore owns every read/write. */
export class ProcessTasksModal extends Modal {
	private unsubscribe?: () => void;
	private live = false;
	private completedOpen = false;
	private body!: HTMLElement;
	private summary!: HTMLElement;
	constructor(app: App, private store: EmbeddedTaskStore, private source: ProcessTaskSource, private openDetail: () => void) { super(app); }
	onOpen(): void {
		this.live = true;
		this.completedOpen = false;
		const el = beginListModal(this, this.source.name);
		el.addClass('mx-quick-tasks');
		// Keep Obsidian's focus/Esc/outside-click lifecycle, with the author's compact menu shell.
		for (const cls of ['ad-modal', 'ad-propmenu', 'mx-quick-tasks-modal']) this.modalEl.addClass(cls);
		this.summary = el.createEl('p', { cls: 'ad-modal-hint' });
		this.body = el.createDiv({ cls: 'mx-quick-tasks__body' });
		el.createDiv({ cls: 'ad-modal-btns' }).createEl('button', { cls: 'po-back-btn', text: '打开完整详情 →' }).onclick = () => { this.close(); this.openDetail(); };
		this.unsubscribe = this.store.subscribe(() => this.render());
		this.render();
		void this.store.refresh().catch(error => { if (this.live) new Notice(`任务读取失败：${String(error)}`); });
	}
	private render(): void {
		if (!this.live) return;
		const groups = processPreviewTasks(this.store.bySource(this.source.sourceFile), this.source);
		this.summary.setText(`${processTypeLabel(this.source.processType)} · 任务进度：${taskProgressLabel(groups.total, groups.completed.length)}`);
		const scroll = this.body.scrollTop;
		this.body.empty();
		const pending = this.body.createEl('section');
		pending.createEl('h4', { cls: 'ad-modal-label', text: `待完成 ${groups.pending.length}` });
		renderEmbeddedRows(pending, groups.pending, this.app, this.store, () => this.close());
		const completed = this.body.createEl('details');
		completed.open = this.completedOpen;
		completed.createEl('summary', { cls: 'ad-modal-label', text: `已完成 ${groups.completed.length}` });
		completed.ontoggle = () => { if (this.live && completed.parentElement === this.body) this.completedOpen = completed.open; };
		renderEmbeddedRows(completed, groups.completed, this.app, this.store, () => this.close());
		// Style the existing native checkboxes; their handlers and Embedded Task writes stay untouched.
		this.body.querySelectorAll('input').forEach(check => check.addClass('po-check'));
		this.body.scrollTop = scroll;
	}
	onClose(): void {
		this.live = false;
		this.unsubscribe?.(); this.unsubscribe = undefined;
		this.contentEl.removeClass('mx-quick-tasks');
		for (const cls of ['ad-modal', 'ad-propmenu', 'mx-quick-tasks-modal']) this.modalEl.removeClass(cls);
		closeListModal(this);
	}
}
