import { LIFE_COMPASS } from '../components/workbench/config.ts';
import { learningName } from './learning.ts';
import type { LearningNote } from './learning';
import { readSection } from './planning.ts';
import type { PlanFiles } from './planning';
import type { LearningFiles } from './learningVault';
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
export function directionAbilities(markdown: string): string[] { return readSection(markdown, '长期能力').items; }
export function abilityName(input: string): string {
	const name = input.trim().normalize('NFC');
	if (!name || name.length > 100 || /[\r\n\u0000-\u001f\u007f]/.test(name)) throw new Error('请输入 1–100 字的能力名称，不含换行或控制字符');
	return name;
}
function abilityKey(input: string): string { return input.trim().normalize('NFC').toLocaleLowerCase('zh-CN'); }
export interface DirectionAbilityOption { value: string; label: string; legacy: boolean }
export function directionAbilityOptions(abilities: string[], current = ''): DirectionAbilityOption[] {
	const options: DirectionAbilityOption[] = [];
	const seen = new Set<string>();
	for (const raw of abilities) {
		const value = raw.trim().normalize('NFC'), key = abilityKey(value);
		if (!value || seen.has(key)) continue;
		seen.add(key); options.push({ value, label: value, legacy: false });
	}
	const value = current.trim().normalize('NFC'), key = abilityKey(value);
	if (value && !seen.has(key)) options.push({ value, label: `${value}（未加入方向能力）`, legacy: true });
	return options;
}
export function appendDirectionAbility(markdown: string, input: string): { markdown: string; ability: string; added: boolean } {
	const ability = abilityName(input);
	const existing = directionAbilities(markdown).find(item => abilityKey(item) === abilityKey(ability));
	if (existing) return { markdown, ability: existing, added: false };
	const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
	const lines = markdown.split(/\r?\n/);
	let frontmatter = false, fence = '', fenceLength = 0;
	const headings: Array<{ index: number; level: number; title: string }> = [];
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? '';
		if (index === 0 && line.replace(/^\uFEFF/, '').trim() === '---') { frontmatter = true; continue; }
		if (frontmatter) { if (/^(---|\.\.\.)\s*$/.test(line)) frontmatter = false; continue; }
		const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) { if (marker && marker[1]?.[0] === fence && marker[1].length >= fenceLength && !marker[2]?.trim()) fence = ''; continue; }
		if (marker) { fence = marker[1]?.[0] ?? ''; fenceLength = marker[1]?.length ?? 3; continue; }
		const heading = /^ {0,3}(#{1,6})(?:\s+|$)(.*?)\s*#*\s*$/.exec(line);
		if (heading) headings.push({ index, level: heading[1]?.length ?? 6, title: heading[2]?.trim() ?? '' });
	}
	const matches = headings.filter(heading => heading.level === 2 && heading.title === '长期能力');
	if (matches.length > 1) throw new Error('方向笔记存在多个“长期能力”章节，请先手动整理');
	if (!matches.length) {
		let base = markdown;
		if (base && !base.endsWith(eol)) base += eol;
		if (base && !base.endsWith(eol + eol)) base += eol;
		return { markdown: `${base}## 长期能力${eol}${eol}- ${ability}${eol}`, ability, added: true };
	}
	const start = matches[0]!.index;
	const end = headings.find(heading => heading.index > start && heading.level <= 2)?.index ?? lines.length;
	const placeholder = lines.findIndex((line, index) => index > start && index < end && /^\s*[-*+]\s*(?:\[[ xX]\]\s*)?$/.test(line));
	if (placeholder >= 0) lines[placeholder] = `- ${ability}`;
	else {
		let insert = end;
		while (insert > start + 1 && !(lines[insert - 1] ?? '').trim()) insert--;
		lines.splice(insert, 0, `- ${ability}`);
	}
	return { markdown: lines.join(eol), ability, added: true };
}
export async function readDirectionAbilities(files: Pick<PlanFiles, 'kind' | 'read'>, direction: string): Promise<string[]> {
	const path = directionInfo(direction).path;
	if (files.kind(path) !== 'file') return [];
	return directionAbilities(await files.read(path));
}
export async function addDirectionAbility(files: LearningFiles, direction: string, input: string): Promise<{ path: string; ability: string; added: boolean }> {
	const requested = abilityName(input);
	const path = await ensureDirection(files, direction);
	let outcome = { ability: requested, added: false };
	await files.process(path, markdown => {
		const update = appendDirectionAbility(markdown, requested);
		outcome = { ability: update.ability, added: update.added };
		return update.markdown;
	});
	return { path, ...outcome };
}
export function allLearningTopics(notes: LearningNote[]): LearningNote[] {
	return notes.filter(n => n.kind === '学习主题').sort((a,b) => Number(['学习中', '进行中'].includes(b.status)) - Number(['学习中', '进行中'].includes(a.status)) || a.path.localeCompare(b.path, 'zh-CN'));
}
export function directionTopics(notes: LearningNote[], name: string): LearningNote[] { return allLearningTopics(notes).filter(n => n.direction === name); }
// v1 uses explicit direction only; it avoids ambiguous same-name topic links.
export function directionResources(notes: LearningNote[], name: string): LearningNote[] {
	return notes.filter(n => n.kind === '学习资源' && n.direction === name).sort((a,b) => a.path.localeCompare(b.path, 'zh-CN'));
}
