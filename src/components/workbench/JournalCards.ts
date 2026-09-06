import type { JournalKind, JournalState } from '../../data/journal';
import { addEmpty, addEntry, createGroup, createSection } from './shared';

export interface JournalActions { open(kind: JournalKind): void; history(mode: 'records' | 'reviews'): void }
export function renderJournalCards(parent: HTMLElement, states: JournalState[], actions: JournalActions): void {
	const diary = createSection(parent, '📓 日记 / 周记', true);
	const review = createSection(parent, '🔄 月度 / 年度复盘', true);
	const labels = { day: '今日日记', week: '本周周记', month: '本月复盘', year: '年度复盘' };
	for (const state of states) {
		const { kind } = state;
		const group = createGroup(kind === 'day' || kind === 'week' ? diary : review, labels[kind]);
		if (state.blocked) { addEmpty(group, '同名路径为文件夹，请检查'); continue; }
		if (!state.exists) addEmpty(group, `尚未建立${labels[kind]}`);
		const action = state.exists ? `已建立${labels[kind]}` : `${kind === 'day' || kind === 'week' ? '写' : '创建'}${labels[kind]}`;
		addEntry(group, action, undefined, () => actions.open(kind));
	}
	addEntry(diary, '最近记录', undefined, () => actions.history('records'));
	addEntry(review, '查看复盘', undefined, () => actions.history('reviews'));
}
