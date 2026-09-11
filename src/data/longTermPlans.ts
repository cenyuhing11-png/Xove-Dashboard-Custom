import type { PlanFiles } from './planning.ts';
import { readSection } from './planning.ts';
import { learningName } from './learning.ts';
import { LONG_TERM_PLAN_ROOT } from './vaultPaths.ts';
import { PROJECT_STATUSES, projectDirections } from './projects.ts';
import type { ProjectStatus } from './projects.ts';
import { quarterEndMonth, quarterStartMonth } from './quarters.ts';

export { LONG_TERM_PLAN_ROOT } from './vaultPaths.ts';
export const LONG_TERM_STAGE_MARKER = 'mx-long-stage';
export const LONG_TERM_PROCESS_MARKER = 'mx-long-process';
export const LONG_TERM_STAGE_NOTE_START = 'mx-long-stage-note:start';
export const LONG_TERM_STAGE_NOTE_END = 'mx-long-stage-note:end';
export interface LongTermStage { index: number; id: string; text: string; note: string; completed: boolean; processRefs: string[] }
export interface LongTermPlan {
	id: string; path: string; name: string; status: ProjectStatus; startMonth: string; endMonth: string;
	directions: string[]; createdDate: string; why: string; desiredState: string; completionCriteria: string; goal: string; stages: LongTermStage[];
}
export interface NewLongTermPlan { name: string; status: ProjectStatus; startMonth: string; endMonth: string; directions?: string[] }

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''; }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function stageMarker(id: string): string { return `<!-- ${LONG_TERM_STAGE_MARKER}:${id} -->`; }
function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
function sectionText(markdown: string, title: string): string { return readSection(markdown, title).content.join('\n').trim(); }
export function normalizeLongTermDirections(value: unknown): string[] {
	const allowed = new Set(projectDirections()); const values = Array.isArray(value) ? value : value == null || value === '' ? [] : [value]; const result: string[] = [];
	for (const entry of values) { const direction = text(entry); if (allowed.has(direction) && !result.includes(direction)) result.push(direction); }
	return result;
}
function checkedLongTermDirections(value: unknown): string[] {
	const values = Array.isArray(value) ? value : value == null || value === '' ? [] : [value]; const normalized = normalizeLongTermDirections(values);
	if (values.some(entry => !!text(entry) && !projectDirections().includes(text(entry)))) throw new Error('请选择当前人生方向');
	return normalized;
}
function directionYaml(directions: readonly string[]): string[] { return directions.length ? ['方向:', ...directions.map(direction => `  - ${direction}`)] : ['方向: []']; }
export function longTermDirectionText(directions: readonly string[]): string { return normalizeLongTermDirections(directions).join(' / '); }
export function longTermPlanListMetadata(plan: Pick<LongTermPlan, 'directions' | 'startMonth' | 'endMonth' | 'status'>): string {
	return [longTermDirectionText(plan.directions), `${plan.startMonth.replace('-', '.')} — ${plan.endMonth.replace('-', '.')}`, `${longTermMonths(plan.startMonth, plan.endMonth)}个月`, plan.status].filter(Boolean).join(' · ');
}
export function longTermPlanDetailMetadata(plan: Pick<LongTermPlan, 'directions' | 'startMonth' | 'endMonth' | 'status' | 'stages'>): string {
	const progress = longTermStageProgress(plan.stages); return [longTermDirectionText(plan.directions), `${plan.startMonth.replace('-', '.')} — ${plan.endMonth.replace('-', '.')}`, `预计 ${longTermMonths(plan.startMonth, plan.endMonth)} 个月`, plan.status, `阶段进度 ${progress.completed} / ${progress.total}`].filter(Boolean).join(' · ');
}
export function validMonth(value: string): boolean { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
export function longTermPlanPath(name: string): { name: string; path: string } { const safe = learningName(name); return { name: safe, path: `${LONG_TERM_PLAN_ROOT}/${safe}.md` }; }
export function normalizeLongTermProcessRef(value: string): string { const target = value.split('|')[0]!.split('#')[0]!.trim().replace(/^\.\//, ''); return target.endsWith('.md') ? target : `${target}.md`; }
function stageLine(line: string): { completed: boolean; body: string; id: string } | null {
	const task = /^ {0,3}[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line); if (!task) return null;
	const id = new RegExp(`<!--\\s*${LONG_TERM_STAGE_MARKER}:([0-9a-f-]+)\\s*-->`, 'i').exec(task[2]!)?.[1] ?? '';
	const body = task[2]!.replace(new RegExp(`\\s*<!--\\s*${LONG_TERM_STAGE_MARKER}:[^>]+-->\\s*`, 'i'), '').trim();
	return { completed: task[1]!.toLowerCase() === 'x', body, id };
}
function nestedProcessRef(line: string): string | null { if (!/^\s{2,}[-*+]\s+/.test(line)) return null; const link = /\[\[([^\]]+)\]\]/.exec(line)?.[1]; return link ? normalizeLongTermProcessRef(link) : null; }
export function parseLongTermStages(markdown: string): LongTermStage[] {
	const stages: LongTermStage[] = []; let current: LongTermStage | undefined, inSection = false, inFrontmatter = false, fence = '', noteLines: string[] | undefined;
	for (const [lineIndex, line] of markdown.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
		if (lineIndex === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
		if (inFrontmatter) { if (/^(---|\.\.\.)\s*$/.test(line)) inFrontmatter = false; continue; }
		if (noteLines) { if (line.includes(`<!-- ${LONG_TERM_STAGE_NOTE_END} -->`)) { if (current) current.note = noteLines.map(value => value.replace(/^ {2}/, '')).join('\n').trim(); noteLines = undefined; } else noteLines.push(line); continue; }
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]; if (marker) { if (!fence) fence = marker[0]!; else if (marker[0] === fence) fence = ''; continue; } if (fence) continue;
		const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*$/.exec(line); if (heading) { if (inSection && heading[1]!.length <= 2) break; inSection = heading[1] === '##' && heading[2] === '阶段安排'; current = undefined; continue; }
		if (!inSection) continue; const parsed = stageLine(line);
		if (parsed) { current = { index: stages.length, id: parsed.id, text: parsed.body, note: '', completed: parsed.completed, processRefs: [] }; stages.push(current); continue; }
		if (current && line.includes(`<!-- ${LONG_TERM_STAGE_NOTE_START} -->`)) { noteLines = []; continue; }
		const ref = nestedProcessRef(line); if (current && ref && !current.processRefs.includes(ref)) current.processRefs.push(ref);
	}
	return stages;
}
export function ensureLongTermStageIds(markdown: string, createId: () => string = () => crypto.randomUUID()): string {
	const eol = markdown.includes('\r\n') ? '\r\n' : '\n'; const lines = markdown.split(/\r?\n/); let inSection = false, frontmatter = false, fence = '', inNote = false;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? ''; if (index === 0 && line.trim() === '---') { frontmatter = true; continue; } if (frontmatter) { if (/^(---|\.\.\.)\s*$/.test(line)) frontmatter = false; continue; }
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]; if (marker) { if (!fence) fence = marker[0]!; else if (marker[0] === fence) fence = ''; continue; } if (fence) continue;
		if (line.includes(`<!-- ${LONG_TERM_STAGE_NOTE_START} -->`)) { inNote = true; continue; } if (line.includes(`<!-- ${LONG_TERM_STAGE_NOTE_END} -->`)) { inNote = false; continue; } if (inNote) continue;
		const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*$/.exec(line); if (heading) { if (inSection && heading[1]!.length <= 2) break; inSection = heading[1] === '##' && heading[2] === '阶段安排'; continue; }
		if (!inSection) continue; const parsed = stageLine(line); if (!parsed || parsed.id) continue; const id = createId(); if (!isUuid(id)) throw new Error('阶段 ID 必须是 UUID'); lines[index] = `${line.trimEnd()} ${stageMarker(id)}`;
	}
	return lines.join(eol);
}
function findStageLine(lines: string[], stageId: string): number { return lines.findIndex(line => new RegExp(`<!--\\s*${LONG_TERM_STAGE_MARKER}:${escapeRegExp(stageId)}\\s*-->`, 'i').test(line)); }
function stageBlockEnd(lines: string[], start: number): number {
	let inNote = false;
	for (let index = start + 1; index < lines.length; index++) {
		const line = lines[index]!;
		if (line.includes(`<!-- ${LONG_TERM_STAGE_NOTE_START} -->`)) { inNote = true; continue; }
		if (line.includes(`<!-- ${LONG_TERM_STAGE_NOTE_END} -->`)) { inNote = false; continue; }
		if (!inNote && (stageLine(line) || /^#{1,2}\s+/.test(line))) return index;
	}
	return lines.length;
}
export function toggleLongTermStage(markdown: string, stageIdOrIndex: string | number, completed: boolean): string {
	const eol = markdown.includes('\r\n') ? '\r\n' : '\n'; const lines = markdown.split(/\r?\n/); let target = typeof stageIdOrIndex === 'string' ? findStageLine(lines, stageIdOrIndex) : -1;
	if (typeof stageIdOrIndex === 'number') { const stages = parseLongTermStages(markdown); const stage = stages[stageIdOrIndex]; if (stage?.id) target = findStageLine(lines, stage.id); else { let seen = -1; target = lines.findIndex(line => stageLine(line) && ++seen === stageIdOrIndex); } }
	if (target < 0) throw new Error('长期计划阶段已变化，请刷新后重试'); lines[target] = lines[target]!.replace(/\[([ xX])\]/, completed ? '[x]' : '[ ]'); return lines.join(eol);
}
export function appendLongTermStage(markdown: string, name: string, id: string): string {
	if (!name.trim()) throw new Error('请输入阶段名称'); if (!isUuid(id)) throw new Error('阶段 ID 必须是 UUID'); const eol = markdown.includes('\r\n') ? '\r\n' : '\n'; const lines = markdown.split(/\r?\n/); const heading = lines.findIndex(line => /^##\s+阶段安排\s*$/.test(line.trim()));
	if (heading < 0) throw new Error('长期计划缺少“阶段安排”'); let end = lines.length; for (let i = heading + 1; i < lines.length; i++) if (/^#{1,2}\s+/.test(lines[i]!)) { end = i; break; } while (end > heading + 1 && !lines[end - 1]!.trim()) end--; lines.splice(end, 0, `- [ ] ${name.trim()} ${stageMarker(id)}`); return lines.join(eol);
}
export function updateLongTermStage(markdown: string, stageId: string, name: string, note: string): string {
	if (!name.trim()) throw new Error('请输入阶段名称');
	const eol = markdown.includes('\r\n') ? '\r\n' : '\n'; const lines = markdown.split(/\r?\n/); const index = findStageLine(lines, stageId);
	if (index < 0) throw new Error('阶段不存在，请刷新后重试');
	const parsed = stageLine(lines[index]!); if (!parsed) throw new Error('阶段格式无效');
	lines[index] = `${lines[index]!.match(/^\s*[-*+]\s+\[[ xX]\]\s+/)?.[0] ?? '- [ ] '}${name.trim()} ${stageMarker(parsed.id)}`;
	const end = stageBlockEnd(lines, index); const noteStart = lines.findIndex((line, lineIndex) => lineIndex > index && lineIndex < end && line.includes(`<!-- ${LONG_TERM_STAGE_NOTE_START} -->`));
	if (noteStart >= 0) { const noteEnd = lines.findIndex((line, lineIndex) => lineIndex > noteStart && lineIndex < end && line.includes(`<!-- ${LONG_TERM_STAGE_NOTE_END} -->`)); if (noteEnd < 0) throw new Error('阶段说明标记不完整'); lines.splice(noteStart, noteEnd - noteStart + 1); }
	const trimmed = note.trim();
	if (trimmed) {
		const noteBlock = [`  <!-- ${LONG_TERM_STAGE_NOTE_START} -->`, ...trimmed.split(/\r?\n/).map(line => `  ${line}`), `  <!-- ${LONG_TERM_STAGE_NOTE_END} -->`];
		lines.splice(index + 1, 0, ...noteBlock);
	}
	return lines.join(eol);
}
export function moveLongTermStage(markdown: string, stageId: string, direction: -1 | 1): string {
	const stages = parseLongTermStages(markdown); const current = stages.findIndex(stage => stage.id === stageId); const target = current + direction;
	if (current < 0) throw new Error('阶段不存在，请刷新后重试'); if (target < 0 || target >= stages.length) return markdown;
	const eol = markdown.includes('\r\n') ? '\r\n' : '\n'; const lines = markdown.split(/\r?\n/); const starts = stages.map(stage => findStageLine(lines, stage.id));
	const blocks = starts.map(start => lines.slice(start, stageBlockEnd(lines, start)));
	[blocks[current], blocks[target]] = [blocks[target]!, blocks[current]!];
	const sectionStart = starts[0]!; const sectionEnd = stageBlockEnd(lines, starts[starts.length - 1]!);
	lines.splice(sectionStart, sectionEnd - sectionStart, ...blocks.flat()); return lines.join(eol);
}
export function removeLongTermProcessFromStages(markdown: string, sourceFile: string): string {
	const eol = markdown.includes('\r\n') ? '\r\n' : '\n'; const wanted = normalizeLongTermProcessRef(sourceFile); const lines = markdown.split(/\r?\n/); let inSection = false, inNote = false;
	return lines.filter(line => { if (line.includes(`<!-- ${LONG_TERM_STAGE_NOTE_START} -->`)) inNote = true; const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*$/.exec(line); if (!inNote && heading) { if (inSection && heading[1]!.length <= 2) inSection = false; else if (heading[1] === '##' && heading[2] === '阶段安排') inSection = true; } const remove = inSection && !inNote && nestedProcessRef(line) === wanted; if (line.includes(`<!-- ${LONG_TERM_STAGE_NOTE_END} -->`)) inNote = false; return !remove; }).join(eol);
}
export function assignLongTermProcessToStage(markdown: string, sourceFile: string, displayName: string, stageId: string): string {
	const cleaned = removeLongTermProcessFromStages(markdown, sourceFile); const eol = cleaned.includes('\r\n') ? '\r\n' : '\n'; const lines = cleaned.split(/\r?\n/); const index = findStageLine(lines, stageId); if (index < 0) throw new Error('目标阶段不存在，请刷新后重试'); const target = normalizeLongTermProcessRef(sourceFile).replace(/\.md$/, ''); const alias = displayName.replace(/[|\]]/g, ' ').trim(); let insert = stageBlockEnd(lines, index); while (insert > index + 1 && !lines[insert - 1]!.trim()) insert--; lines.splice(insert, 0, `  - [[${target}|${alias}]] <!-- ${LONG_TERM_PROCESS_MARKER} -->`); return lines.join(eol);
}
export function deleteLongTermStage(markdown: string, stageId: string): string { const eol = markdown.includes('\r\n') ? '\r\n' : '\n'; const lines = markdown.split(/\r?\n/); const index = findStageLine(lines, stageId); if (index < 0) throw new Error('阶段不存在，请刷新后重试'); lines.splice(index, stageBlockEnd(lines, index) - index); return lines.join(eol); }
export function currentLongTermStage(stages: readonly LongTermStage[]): string { return stages.find(stage => !stage.completed)?.text ?? (stages.length ? '阶段已完成' : '尚未添加阶段'); }
export function longTermStageProgress(stages: readonly LongTermStage[]): { completed: number; total: number } { return { completed: stages.filter(stage => stage.completed).length, total: stages.length }; }
export function longTermMonths(startMonth: string, endMonth: string): number { if (!validMonth(startMonth) || !validMonth(endMonth) || startMonth > endMonth) return 0; const [sy, sm] = startMonth.split('-').map(Number), [ey, em] = endMonth.split('-').map(Number); return (ey! - sy!) * 12 + em! - sm! + 1; }
export function longTermPlanNote(path: string, properties: unknown, markdown: string): LongTermPlan | null {
	if (!path.startsWith(`${LONG_TERM_PLAN_ROOT}/`) || !path.endsWith('.md') || !properties || typeof properties !== 'object' || Array.isArray(properties)) return null; const fm = properties as Record<string, unknown>; if (fm['类型'] !== '长期计划') return null; const id = text(fm['长期计划ID']), startMonth = text(fm['开始月份']), endMonth = text(fm['结束月份']); if (!isUuid(id) || !validMonth(startMonth) || !validMonth(endMonth)) return null;
	const legacyGoal = text(fm['长期目标']) || sectionText(markdown, '长期目标'); return { id, path, name: path.split('/').pop()!.slice(0, -3), status: PROJECT_STATUSES.includes(fm['状态'] as ProjectStatus) ? fm['状态'] as ProjectStatus : '计划中', startMonth, endMonth, directions: normalizeLongTermDirections(fm['方向']), createdDate: text(fm['创建日期']), why: sectionText(markdown, '为什么做'), desiredState: sectionText(markdown, '希望达到的状态'), completionCriteria: sectionText(markdown, '完成标准'), goal: legacyGoal, stages: parseLongTermStages(markdown) };
}
export function longTermPlanTemplate(input: NewLongTermPlan, id: string, createdDate: string): string {
	const { name } = longTermPlanPath(input.name); if (!isUuid(id)) throw new Error('长期计划 ID 必须是 UUID'); if (!PROJECT_STATUSES.includes(input.status)) throw new Error('长期计划状态无效'); if (!validMonth(input.startMonth) || !validMonth(input.endMonth) || input.startMonth > input.endMonth) throw new Error('长期计划月份范围无效'); const directions = checkedLongTermDirections(input.directions);
	return `---\n类型: 长期计划\n长期计划ID: ${id}\n状态: ${input.status}\n${directionYaml(directions).join('\n')}\n开始月份: ${input.startMonth}\n结束月份: ${input.endMonth}\n创建日期: ${createdDate}\n---\n\n# ${name}\n\n## 为什么做\n\n\n## 希望达到的状态\n\n\n## 完成标准\n\n-\n-\n-\n\n## 阶段安排\n\n- [ ] 第一阶段 ${stageMarker(crypto.randomUUID())}\n- [ ] 第二阶段 ${stageMarker(crypto.randomUUID())}\n- [ ] 第三阶段 ${stageMarker(crypto.randomUUID())}\n`;
}
export function updateLongTermPlanDirections(markdown: string, value: readonly string[]): string {
	const directions = checkedLongTermDirections(value); const eol = markdown.includes('\r\n') ? '\r\n' : '\n'; const lines = markdown.split(/\r?\n/);
	if (lines[0]?.trim() !== '---') throw new Error('长期计划缺少 frontmatter');
	const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line)); if (end < 0) throw new Error('长期计划 frontmatter 不完整');
	const start = lines.findIndex((line, index) => index > 0 && index < end && /^方向\s*:/.test(line)); const replacement = directionYaml(directions);
	if (start < 0) lines.splice(end, 0, ...replacement);
	else { let stop = start + 1; while (stop < end && !/^[^\s#][^:]*:/.test(lines[stop]!)) stop++; lines.splice(start, stop - start, ...replacement); }
	return lines.join(eol);
}
export async function createLongTermPlan(files: PlanFiles, input: NewLongTermPlan, id: string, createdDate: string): Promise<string> { const info = longTermPlanPath(input.name); const content = longTermPlanTemplate(input, id, createdDate); if (files.kind(info.path)) throw new Error('同名长期计划已存在，请打开已有计划；不会覆盖'); if (!files.kind('05-计划')) await files.createFolder('05-计划'); if (!files.kind(LONG_TERM_PLAN_ROOT)) await files.createFolder(LONG_TERM_PLAN_ROOT); await files.create(info.path, content); return info.path; }
function sortVisibleLongTermPlans(plans: LongTermPlan[]): LongTermPlan[] { return plans.sort((a, b) => a.startMonth.localeCompare(b.startMonth) || a.name.localeCompare(b.name, 'zh-CN')); }
export function longTermPlansForMonth(plans: readonly LongTermPlan[], year: number, month: number): LongTermPlan[] { const key = `${year}-${String(month).padStart(2, '0')}`; return sortVisibleLongTermPlans(plans.filter(plan => plan.startMonth <= key && plan.endMonth >= key && plan.status !== '归档')); }
export function longTermPlansForQuarter(plans: readonly LongTermPlan[], year: number, quarter: number): LongTermPlan[] { const firstMonth = quarterStartMonth(year, quarter), lastMonth = quarterEndMonth(year, quarter); return sortVisibleLongTermPlans(plans.filter(plan => plan.startMonth <= lastMonth && plan.endMonth >= firstMonth && plan.status !== '归档')); }
export function longTermPlansForYear(plans: readonly LongTermPlan[], year: number): LongTermPlan[] { const firstMonth = `${year}-01`, lastMonth = `${year}-12`; return sortVisibleLongTermPlans(plans.filter(plan => plan.startMonth <= lastMonth && plan.endMonth >= firstMonth && plan.status !== '归档')); }
export function activeLongTermPlans(plans: readonly LongTermPlan[]): LongTermPlan[] { return plans.filter(plan => plan.status !== '归档'); }
