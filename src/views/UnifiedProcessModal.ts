import { App, Modal, Notice } from 'obsidian';
import { createMengxuProject, PROJECT_STATUSES, projectDirections } from '../data/projects';
import type { ProjectStatus } from '../data/projects';
import { createLearningProcess } from '../data/processCreation';
import type { NewLearningProcess } from '../data/processCreation';
import type { ProcessType } from '../data/processes';
import { learningFiles, openLearningFile } from '../data/learningVault';
import { todayStr } from '../data/taskLogic';
import { openProjects } from './ProjectView';
import { beginListModal, closeListModal } from './viewPrimitives';

/** One author-style form; each type keeps its existing Markdown creator. */
export class UnifiedProcessModal extends Modal {
	private input: NewLearningProcess = { name: '', status: '计划中' };
	private saving = false;
	constructor(app: App, private type: ProcessType = 'learning') { super(app); }
	onOpen(): void { this.render(); }
	private render(): void {
		const el = beginListModal(this, '新建进程');
		const controls: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement> = [];
		el.createEl('label', { cls: 'ad-modal-label', text: '类型' });
		const types = el.createDiv({ cls: 'ad-prio-group', attr: { role: 'group', 'aria-label': '类型' } });
		for (const [type, label] of [['learning', '学习'], ['project', '项目']] as const) {
			const button = types.createEl('button', { cls: 'ad-prio-btn' + (type === this.type ? ' is-selected' : ''), text: label, attr: { type: 'button', 'aria-pressed': String(type === this.type) } });
			controls.push(button);
			button.onclick = () => { if (!this.saving && this.type !== type) { this.type = type; this.render(); } };
		}
		const learning = this.type === 'learning';
		const textField = (parent: HTMLElement, key: 'name' | 'ability' | 'startDate' | 'dueDate' | 'goal', label: string, kind: 'text' | 'date' | 'textarea' = 'text') => {
			parent.createEl('label', { cls: 'ad-modal-label', text: label });
			const field = kind === 'textarea' ? parent.createEl('textarea', { cls: 'ad-modal-input', attr: { rows: '3', 'aria-label': label } }) : parent.createEl('input', { cls: 'ad-modal-input', attr: { type: kind, 'aria-label': label } });
			field.value = this.input[key] || '';
			field.oninput = () => { this.input[key] = field.value; }; controls.push(field); return field;
		};
		const name = textField(el, 'name', learning ? '学习名称' : '项目名称');
		el.createEl('label', { cls: 'ad-modal-label', text: '方向（可选）' });
		const direction = el.createDiv({ cls: 'ad-modal-row' }).createEl('select', { cls: 'ad-modal-input', attr: { 'aria-label': '方向（可选）' } });
		direction.createEl('option', { value: '', text: '未关联' });
		for (const value of projectDirections()) direction.createEl('option', { value, text: value });
		direction.value = this.input.direction || ''; direction.onchange = () => { this.input.direction = direction.value; }; controls.push(direction);
		el.createEl('label', { cls: 'ad-modal-label', text: '状态' });
		const status = el.createDiv({ cls: 'ad-modal-row' }).createEl('select', { cls: 'ad-modal-input', attr: { 'aria-label': '状态' } });
		for (const value of PROJECT_STATUSES) status.createEl('option', { value, text: value });
		status.value = this.input.status; status.onchange = () => { this.input.status = status.value as ProjectStatus; }; controls.push(status);
		const dates = el.createDiv({ cls: 'ad-modal-row' });
		textField(dates.createDiv({ cls: 'ad-modal-col' }), 'startDate', '开始日期（可选）', 'date');
		textField(dates.createDiv({ cls: 'ad-modal-col' }), 'dueDate', '截止日期（可选）', 'date');
		if (learning) textField(el, 'ability', '所属能力（可选）');
		textField(el, 'goal', learning ? '学习目标（可选）' : '项目目标（可选）', 'textarea');
		const footer = el.createDiv({ cls: 'ad-modal-btns' });
		footer.createEl('button', { cls: 'ad-modal-btn', text: '取消' }).onclick = () => this.close();
		const create = footer.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '创建进程' }); controls.push(create);
		create.onclick = async () => {
			if (this.saving) return;
			this.saving = true; controls.forEach(c => { c.disabled = true; });
			try {
				if (this.type === 'learning') {
					const path = await createLearningProcess(learningFiles(this.app), this.input);
					this.close(); await openLearningFile(this.app, path);
				} else {
					const id = crypto.randomUUID();
					const path = await createMengxuProject(learningFiles(this.app), this.input, id, todayStr());
					this.close(); await openProjects(this.app, { id, path });
				}
			} catch (error) { new Notice(String(error)); }
			finally { this.saving = false; controls.forEach(c => { c.disabled = false; }); }
		};
		name.focus();
	}
	onClose(): void { closeListModal(this); }
}
