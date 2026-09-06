import { LIFE_COMPASS } from '../components/workbench/config.ts';
import { learningName } from './learning.ts';
import type { LearningNote } from './learning';
import { readSection } from './planning.ts';
import type { PlanFiles } from './planning';
import { ensureSafeNote } from './safeNote.ts';
import { DIRECTION_ROOT, PLAN_ROOT } from './vaultPaths.ts';
export { DIRECTION_ROOT } from './vaultPaths.ts';

export function directionInfo(input: string) {
	const name = learningName(input);
	const lane = LIFE_COMPASS.find(lane => lane.items.includes(name));
	if (!lane) throw new Error('未知人生方向');
	return { name, priority: lane.label, path: `${DIRECTION_ROOT}/${name}.md` };
}
export function directionTemplate(input: string): string {
	const { name, priority } = directionInfo(input);
	return `---\n类型: 人生方向\n方向: ${name}\n优先级: ${priority}\n状态: 进行中\n---\n\n# ${name}\n\n## 这条方向对我意味着什么\n\n\n## 长期能力\n\n-\n\n## 当前阶段\n\n\n## 备注\n\n`;
}
export function ensureDirection(files: PlanFiles, name: string): Promise<string> {
	return ensureSafeNote(files, directionInfo(name).path, [PLAN_ROOT, DIRECTION_ROOT], directionTemplate(name));
}
export function directionAbilities(markdown: string): string[] { return readSection(markdown, '长期能力').content; }
export function allLearningTopics(notes: LearningNote[]): LearningNote[] {
	return notes.filter(n => n.kind === '学习主题').sort((a,b) => Number(['学习中', '进行中'].includes(b.status)) - Number(['学习中', '进行中'].includes(a.status)) || a.path.localeCompare(b.path, 'zh-CN'));
}
export function directionTopics(notes: LearningNote[], name: string): LearningNote[] { return allLearningTopics(notes).filter(n => n.direction === name); }
// v1 uses explicit direction only; it avoids ambiguous same-name topic links.
export function directionResources(notes: LearningNote[], name: string): LearningNote[] {
	return notes.filter(n => n.kind === '学习资源' && n.direction === name).sort((a,b) => a.path.localeCompare(b.path, 'zh-CN'));
}
