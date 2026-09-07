import { App, Modal, Notice } from 'obsidian';
import { createMengxuProject, PROJECT_STATUSES, projectDirections } from '../data/projects';
import type { ProjectStatus } from '../data/projects';
import { createKnowledgeProcess, createLearningContentProcess } from '../data/processCreation';
import type { NewLearningProcess } from '../data/processCreation';
import { contentDefinition, processCategoryLabel, processContentTypeLabel, processContentTypes } from '../data/processContentTypes';
import type { ProcessCategory, ProcessContentType } from '../data/processContentTypes';
import { directionAbilityOptions, readDirectionAbilities } from '../data/compass';
import { learningFiles, openLearningFile } from '../data/learningVault';
import { todayStr } from '../data/taskLogic';
import { openProjects } from './ProjectView';
import { beginListModal, closeListModal } from './viewPrimitives';
import { DirectionAbilityModal } from './DirectionAbilityModal';

/** One author-style form; each type keeps its existing Markdown creator. */
export class UnifiedProcessModal extends Modal {
	private input: NewLearningProcess = { name: '', status: '计划中' };
	private saving = false;
	private generation = 0;
	private contentType: ProcessContentType = 'course';
	constructor(app: App, private category: ProcessCategory = 'learning') { super(app); if (category === 'creation') this.contentType = 'knowledge'; }
	onOpen(): void { this.render(); }
	private render(): void {
		const generation = ++this.generation;
		const el = beginListModal(this, '新建进程');
		const controls: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement> = [];
		el.createEl('label', { cls: 'ad-modal-label', text: '进程类型' });
		const types = el.createDiv({ cls: 'ad-prio-group', attr: { role: 'group', 'aria-label': '进程类型' } });
		for (const type of ['learning', 'creation'] as const) {
			const button = types.createEl('button', { cls: 'ad-prio-btn' + (type === this.category ? ' is-selected' : ''), text: processCategoryLabel(type), attr: { type: 'button', 'aria-pressed': String(type === this.category) } });
			controls.push(button);
			button.onclick = () => { if (!this.saving && this.category !== type) { this.category = type; this.contentType = processContentTypes(type)[0]!; this.input.ability = undefined; this.render(); } };
		}
		el.createEl('label', { cls: 'ad-modal-label', text: '内容类型' });
		const contentTypes = el.createDiv({ cls: 'ad-prio-group', attr: { role: 'group', 'aria-label': '内容类型' } });
		for (const type of processContentTypes(this.category)) {
			const button = contentTypes.createEl('button', { cls: 'ad-prio-btn' + (type === this.contentType ? ' is-selected' : ''), text: processContentTypeLabel(type), attr: { type: 'button', 'aria-pressed': String(type === this.contentType) } });
			controls.push(button); button.onclick = () => { if (!this.saving && this.contentType !== type) { this.contentType = type; this.render(); } };
		}
		const learning = this.category === 'learning';
		const definition = contentDefinition(this.contentType);
		const textField = (parent: HTMLElement, key: 'name' | 'ability' | 'startDate' | 'dueDate' | 'goal', label: string, kind: 'text' | 'date' | 'textarea' = 'text') => {
			parent.createEl('label', { cls: 'ad-modal-label', text: label });
			const field = kind === 'textarea' ? parent.createEl('textarea', { cls: 'ad-modal-input', attr: { rows: '3', 'aria-label': label } }) : parent.createEl('input', { cls: 'ad-modal-input', attr: { type: kind, 'aria-label': label } });
			field.value = this.input[key] || '';
			field.oninput = () => { this.input[key] = field.value; }; controls.push(field); return field;
		};
		const name = textField(el, 'name', `${definition.label}名称`);
		el.createEl('label', { cls: 'ad-modal-label', text: '方向（可选）' });
		const direction = el.createDiv({ cls: 'ad-modal-row' }).createEl('select', { cls: 'ad-modal-input', attr: { 'aria-label': '方向（可选）' } });
		direction.createEl('option', { value: '', text: '未关联' });
		for (const value of projectDirections()) direction.createEl('option', { value, text: value });
		direction.value = this.input.direction || ''; controls.push(direction);
		el.createEl('label', { cls: 'ad-modal-label', text: '状态' });
		const status = el.createDiv({ cls: 'ad-modal-row' }).createEl('select', { cls: 'ad-modal-input', attr: { 'aria-label': '状态' } });
		for (const value of PROJECT_STATUSES) status.createEl('option', { value, text: value });
		status.value = this.input.status; status.onchange = () => { this.input.status = status.value as ProjectStatus; }; controls.push(status);
		const dates = el.createDiv({ cls: 'ad-modal-row' });
		textField(dates.createDiv({ cls: 'ad-modal-col' }), 'startDate', '开始日期（可选）', 'date');
		textField(dates.createDiv({ cls: 'ad-modal-col' }), 'dueDate', '截止日期（可选）', 'date');
		if (learning) {
			el.createEl('label', { cls: 'ad-modal-label', text: '培养能力（可选）' });
			const abilityRow = el.createDiv({ cls: 'ad-modal-row mx-ability-row' });
			const ability = abilityRow.createEl('select', { cls: 'ad-modal-input', attr: { 'aria-label': '培养能力（可选）' } });
			const addAbility = abilityRow.createEl('button', { cls: 'mx-inline-action mx-ability-add', text: '＋ 新建能力', attr: { type: 'button' } });
			controls.push(ability, addAbility);
			const refreshAbilities = async (selected = this.input.ability || '') => {
				const selectedDirection = this.input.direction || '';
				ability.empty();
				if (!selectedDirection) {
					ability.createEl('option', { value: '', text: '先选择人生方向' });
					ability.value = ''; ability.disabled = true; addAbility.disabled = true; return;
				}
				ability.createEl('option', { value: '', text: '正在读取能力…' }); ability.disabled = true; addAbility.disabled = true;
				try {
					const values = await readDirectionAbilities(learningFiles(this.app), selectedDirection);
					if (generation !== this.generation || selectedDirection !== this.input.direction) return;
					ability.empty(); ability.createEl('option', { value: '', text: values.length ? '未选择' : '暂无能力，请新建' });
					for (const option of directionAbilityOptions(values, selected)) ability.createEl('option', { value: option.value, text: option.label });
					ability.value = selected; ability.disabled = false; addAbility.disabled = false;
				} catch {
					if (generation !== this.generation) return;
					ability.empty(); ability.createEl('option', { value: '', text: '暂时无法读取方向能力' });
					ability.disabled = true; addAbility.disabled = false;
				}
			};
			ability.onchange = () => { this.input.ability = ability.value || undefined; };
			addAbility.onclick = () => {
				const selectedDirection = this.input.direction;
				if (!selectedDirection || this.saving) return;
				new DirectionAbilityModal(this.app, selectedDirection, async value => {
					if (generation !== this.generation || this.input.direction !== selectedDirection) return;
					this.input.ability = value; await refreshAbilities(value);
				}).open();
			};
			direction.onchange = () => { this.input.direction = direction.value || undefined; this.input.ability = undefined; void refreshAbilities(''); };
			void refreshAbilities();
		} else direction.onchange = () => { this.input.direction = direction.value || undefined; };
		textField(el, 'goal', learning ? '学习目标（可选）' : this.contentType === 'project' ? '项目目标（可选）' : '目标（可选）', 'textarea');
		const footer = el.createDiv({ cls: 'ad-modal-btns' });
		footer.createEl('button', { cls: 'ad-modal-btn', text: '取消' }).onclick = () => this.close();
		const create = footer.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: '创建进程' }); controls.push(create);
		create.onclick = async () => {
			if (this.saving) return;
			this.saving = true; controls.forEach(c => { c.disabled = true; });
			try {
				if (this.category === 'learning') {
					const path = await createLearningContentProcess(learningFiles(this.app), this.contentType as 'course' | 'movie' | 'book' | 'video' | 'article', this.input);
					this.close(); await openLearningFile(this.app, path);
				} else if (this.contentType === 'knowledge') {
					const path = await createKnowledgeProcess(learningFiles(this.app), this.input);
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
	onClose(): void { this.generation++; closeListModal(this); }
}
