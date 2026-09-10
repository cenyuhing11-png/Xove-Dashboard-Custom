import { directionAbilities, directionInfo } from './compass.ts';
import type { LongTermPlan } from './longTermPlans';
import type { Process } from './processes';

export const DIRECTION_ACTIVE_STATUSES = ['计划中', '进行中', '暂停'] as const;
export const DIRECTION_LEARNING_HISTORY_STATUSES = ['已完成', '归档'] as const;

export interface DirectionOverviewModel {
	direction: string;
	tier: string;
	narrative: string;
	abilities: string[];
	longTermPlans: LongTermPlan[];
	activeProcesses: Process[];
	learningHistory: Process[];
	recentLearningHistory: Process[];
}

/** Read one raw H2 section without changing the direction Markdown schema. */
export function directionSectionMarkdown(markdown: string, title: string): string {
	let yaml = false, fence = '', start: number | undefined;
	for (const match of markdown.matchAll(/[^\n]*(?:\n|$)/g)) {
		const raw = match[0]; if (!raw) continue;
		const line = raw.replace(/\r?\n$/, ''), offset = match.index!;
		if (offset === 0 && line.replace(/^\uFEFF/, '').trim() === '---') { yaml = true; continue; }
		if (yaml) { if (/^(---|\.\.\.)\s*$/.test(line)) yaml = false; continue; }
		const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) { if (marker && marker[1]![0] === fence[0] && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = ''; continue; }
		if (marker) { fence = marker[1]!; continue; }
		const heading = /^ {0,3}(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
		if (!heading) continue;
		if (start !== undefined) return markdown.slice(start, offset).trim();
		if (heading[1] === '##' && heading[2] === title) start = offset + raw.length;
	}
	return start === undefined ? '' : markdown.slice(start).trim();
}

function bySource(a: { sourceFile: string }, b: { sourceFile: string }): number {
	return a.sourceFile.localeCompare(b.sourceFile, 'zh-CN');
}

/** One calculation feeds both header counts and every overview section. */
export function directionOverviewModel(
	direction: string,
	markdown: string,
	longTermPlans: readonly LongTermPlan[],
	allProcesses: readonly Process[],
	updatedAt: (sourceFile: string) => number = () => 0,
): DirectionOverviewModel {
	const info = directionInfo(direction);
	const activeStatuses = new Set<string>(DIRECTION_ACTIVE_STATUSES);
	const historyStatuses = new Set<string>(DIRECTION_LEARNING_HISTORY_STATUSES);
	const longTerm = longTermPlans.filter(plan => plan.directions.includes(info.name));
	const active = allProcesses.filter(process => process.direction === info.name && activeStatuses.has(process.status)).sort(bySource);
	const learningHistory = allProcesses
		.filter(process => process.direction === info.name && process.category === 'learning' && historyStatuses.has(process.status))
		.sort((a, b) => updatedAt(b.sourceFile) - updatedAt(a.sourceFile) || bySource(a, b));
	return {
		direction: info.name,
		tier: info.priority,
		narrative: directionSectionMarkdown(markdown, '这条方向对我意味着什么'),
		abilities: directionAbilities(markdown),
		longTermPlans: longTerm,
		activeProcesses: active,
		learningHistory,
		recentLearningHistory: learningHistory.slice(0, 5),
	};
}
