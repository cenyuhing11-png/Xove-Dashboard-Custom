import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { LearningNote } from '../data/learning';
import type { EmbeddedTaskStore } from '../data/embeddedTaskVault';
import { parseEmbeddedTasks } from '../data/embeddedTasks';
import { readSection } from '../data/planning';
import { learningProcessStatus } from '../data/processes';
import { openLearningFile } from '../data/learningVault';
import { NewEmbeddedTaskModal, renderEmbeddedRows } from './EmbeddedTaskModal';
import { detailTaskHeader } from './viewPrimitives';
import { renderProcessLongTermField } from './ProcessLongTermField';
import type { ProcessLongTermActions } from './ProcessLongTermField';

/** Knowledge/idea creation detail; project detail remains in ProjectView. */
export function renderCreationProcessDetail(el: HTMLElement, app: App, store: EmbeddedTaskStore, note: LearningNote, content: string, overview: () => void, longTerm?: ProcessLongTermActions): void {
	el.empty();
	el.createDiv({ cls: 'po-topbar' }).createEl('button', { cls: 'ad-modal-btn', text: '全部进程 →' }).onclick = overview;
	el.createEl('h1', { cls: 'ad-modal-title', text: note.name });
	el.createEl('p', { cls: 'ad-modal-hint', text: `创作 · 知识与思考 · ${learningProcessStatus(note.status)} · 方向：${note.direction || '未关联'}` });
	el.createEl('p', { cls: 'ad-modal-hint', text: `开始日期：${note.startDate || '未设置'} · 截止日期：${note.dueDate || '未设置'}` });
	renderProcessLongTermField(el, app, longTerm);
	const section = (heading: string) => {
		const block = el.createDiv({ cls: 'ad-update-block' });
		block.createEl('h2', { cls: 'ad-modal-title', text: heading });
		const lines = readSection(content, heading).content;
		for (const text of lines.length ? lines : ['尚未填写']) block.createEl('p', { cls: 'ad-modal-desc', text });
	};
	section('目标');
	const tasks = parseEmbeddedTasks(note.path, content);
	const block = el.createDiv({ cls: 'ad-update-block' });
	detailTaskHeader(block, '创作任务', tasks.filter(task => task.completed).length, tasks.length, () => new NewEmbeddedTaskModal(app, store, note.path).open());
	renderEmbeddedRows(block, tasks, app, store);
	section('思考'); section('过程记录');
	el.createEl('button', { cls: 'ad-modal-btn', text: '编辑原笔记 →' }).onclick = () => { void openLearningFile(app, note.path).catch(error => new Notice(String(error))); };
}
