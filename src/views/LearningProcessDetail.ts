import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { LearningNote } from '../data/learning';
import type { EmbeddedTaskStore } from '../data/embeddedTaskVault';
import { parseEmbeddedTasks } from '../data/embeddedTasks';
import { readSection } from '../data/planning';
import { learningProcessResources, learningProcessStatus, taskProgressLabel } from '../data/processes';
import { openLearningFile } from '../data/learningVault';
import { NewEmbeddedTaskModal, renderEmbeddedRows } from './EmbeddedTaskModal';
import { listEntry } from './viewPrimitives';

/** Secondary detail only; reads one Markdown snapshot and reuses task completion writes. */
export function renderLearningProcessDetail(el: HTMLElement, app: App, store: EmbeddedTaskStore, note: LearningNote, notes: LearningNote[], content: string, overview: () => void): void {
	el.empty();
	el.createDiv({ cls: 'po-topbar' }).createEl('button', { cls: 'ad-modal-btn', text: '全部进程 →' }).onclick = overview;
	el.createEl('h1', { cls: 'ad-modal-title', text: note.name });
	const status = learningProcessStatus(note.status);
	el.createEl('p', { cls: 'ad-modal-hint', text: `学习 · ${status} · 方向：${note.direction || '未关联'} · 所属能力：${note.abilities.join('、') || '未填写'}` });
	if (note.status && note.status !== status) el.createEl('p', { cls: 'ad-modal-hint', text: `笔记原状态：${note.status}（只读映射为${status}，未改写笔记）` });
	el.createEl('p', { cls: 'ad-modal-hint', text: `开始日期：${note.startDate || '未设置'} · 截止日期：${note.dueDate || '未设置'}` });
	function section(heading: string): HTMLElement {
		const block = el.createDiv({ cls: 'ad-update-block' });
		block.createEl('h2', { cls: 'ad-modal-title', text: heading });
		const lines = readSection(content, heading).content;
		for (const text of lines.length ? lines : ['尚未填写']) block.createEl('p', { cls: 'ad-modal-desc', text });
		return block;
	}
	section('学习目标');
	const tasks = parseEmbeddedTasks(note.path, content);
	const block = el.createDiv({ cls: 'ad-update-block' });
	block.createEl('h2', { cls: 'ad-modal-title', text: '学习任务' });
	block.createEl('p', { cls: 'ad-modal-hint', text: taskProgressLabel(tasks.length, tasks.filter(t => t.completed).length) });
	block.createEl('button', { cls: 'ad-modal-btn', text: '添加学习任务' }).onclick = () => new NewEmbeddedTaskModal(app, store, note.path).open();
	renderEmbeddedRows(block, tasks, app, store);
	const resources = section('当前资源');
	for (const resource of learningProcessResources(note, notes)) listEntry(resources, resource.name, [resource.resourceType, resource.status].filter(Boolean).join(' · '), () => { void openLearningFile(app, resource.path).catch(e => new Notice(String(e))); });
	section('下一步'); section('实践');
	el.createEl('button', { cls: 'ad-modal-btn', text: '编辑学习笔记 →' }).onclick = () => { void openLearningFile(app, note.path).catch(e => new Notice(String(e))); };
}
