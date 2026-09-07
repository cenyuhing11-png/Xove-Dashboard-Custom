import type { CurrentLearning } from '../../data/learning';
import { addEmpty, addEntry, createSection } from './shared';

export interface LearningActions {
	open(path: string): void;
	list(mode: 'queue' | 'topics'): void;
}
export function renderLearningCard(parent: HTMLElement, notes: CurrentLearning[], actions: LearningActions): void {
	const body = createSection(parent, '📚 当前学习');
	if (!notes.length) {
		addEmpty(body, '暂无当前学习内容');
	}
	for (const note of notes) {
		const group = body.createDiv({ cls: 'wb-group' });
		addEntry(group, note.name, undefined, () => actions.open(note.path));
		if (note.abilities.length) addEmpty(group, note.abilities.join(' · '));
		addEmpty(group, `下一步：${note.next || '暂时无法读取学习任务'}`);
	}
	const links = body.createDiv({ cls: 'wb-inline-links' });
	addEntry(links, '学习队列', undefined, () => actions.list('queue'));
	addEntry(links, '查看学习主题', undefined, () => actions.list('topics'));
}
