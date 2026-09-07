import type { CurrentLearning } from '../../data/learning';
import type { Process } from '../../data/processes';
import { processCategoryLabel, processContentTypeLabel } from '../../data/processContentTypes';
import { addEmpty, addEntry, createGroup, createSection } from './shared';

export interface LearningActions {
	open(process: Process): void;
}
export function renderLearningCard(parent: HTMLElement, notes: CurrentLearning[], processes: readonly Process[], actions: LearningActions): void {
	const body = createSection(parent, '📚 当前学习');
	const note = notes.find(candidate => processes.some(process => process.category === 'learning' && process.sourceFile === candidate.path));
	if (!note) return addEmpty(body, '暂无当前学习内容');
	const process = processes.find(item => item.category === 'learning' && item.sourceFile === note.path)!;
	const detail = `${processCategoryLabel(process.category)} · ${processContentTypeLabel(process.contentType, true)} · ${process.status}`;
	addEntry(body, note.name, detail, () => actions.open(process));
	addEmpty(createGroup(body, '培养能力'), note.abilities.join(' · ') || '暂未设置能力');
	addEmpty(createGroup(body, '学习目标'), note.goal || '暂未填写学习目标');
	addEmpty(createGroup(body, '下一步'), note.next || '暂无待完成学习任务');
}
