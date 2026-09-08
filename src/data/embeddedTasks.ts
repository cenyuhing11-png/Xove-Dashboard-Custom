/** Markdown is the only source of truth. No Obsidian dependency in this module. */
import { KNOWLEDGE_ROOT, PROJECT_ROOT } from './vaultPaths.ts';
export const DAILY_TASK_FILE = '05-计划/06-日常任务.md';
export const EMBEDDED_HEADINGS = { learning: '学习任务', creation: '创作任务', project: '项目任务', daily: '日常待办' } as const;
export type EmbeddedSourceType = keyof typeof EMBEDDED_HEADINGS;
export const TASK_DISPLAY_CATEGORIES = ['learning', 'creation', 'daily'] as const;
export type TaskDisplayCategory = typeof TASK_DISPLAY_CATEGORIES[number];
export const TASK_DISPLAY_LABELS: Record<TaskDisplayCategory, string> = { learning: '学习任务', creation: '创作任务', daily: '日常任务' };
export const TASK_DISPLAY_MARKERS: Record<TaskDisplayCategory, string> = { learning: '学', creation: '创', daily: '日' };
export interface EmbeddedTask {
	id: string;
	text: string;
	completed: boolean;
	date?: string;
	sourceType: EmbeddedSourceType;
	sourceFile: string;
	sourceHeading: string;
	sourceDisplayName: string;
	locator: { line: number; raw: string; snapshot: string; persistent: boolean };
}
export const DAILY_TASK_TEMPLATE = '---\n类型: 日常任务\n---\n\n# 日常任务\n\n## 日常待办\n\n- [ ]\n\n## 定期事项\n\n- [ ]\n';
export function embeddedSource(path: string): EmbeddedSourceType | undefined {
	if (!path.endsWith('.md') || path.split('/').some(p => p === '..' || p === '.' || p.startsWith('.'))) return undefined;
	if (path === DAILY_TASK_FILE) return 'daily';
	if (path.startsWith('01-学习与资料/')) return 'learning';
	if (path.startsWith(`${KNOWLEDGE_ROOT}/`)) return 'creation';
	if (path.startsWith(`${PROJECT_ROOT}/`)) return 'project';
	return undefined;
}
export function validTaskDate(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
const marker = /<!--\s*mx-task:([a-zA-Z0-9-]+)\s*-->/g;
/** Track real headings only: ignore YAML, fenced examples and multiline HTML comments. */
function structure(content: string): { lines: string[]; headings: { line: number; level: number; text: string }[]; excluded: Set<number>; safeEnd: boolean } {
	const lines = content.split('\n');
	const headings: { line: number; level: number; text: string }[] = [];
	const excluded = new Set<number>();
	let yaml = lines[0]?.replace(/^\uFEFF/, '').trim() === '---';
	let fence = ''; let width = 0; let comment = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!.replace(/\r$/, '');
		if (yaml) { excluded.add(i); if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) yaml = false; continue; }
		if (comment) { excluded.add(i); if (line.includes('-->')) comment = false; continue; }
		if (fence) { excluded.add(i); if (new RegExp('^ {0,3}' + fence + '{' + width + ',}\\s*$').test(line)) fence = ''; continue; }
		const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
		if (f) { excluded.add(i); fence = f[1]![0]!; width = f[1]!.length; continue; }
		if (line.includes('<!--') && !line.slice(line.indexOf('<!--') + 4).includes('-->')) { excluded.add(i); comment = true; continue; }
		if (/^\s*<!--/.test(line)) { excluded.add(i); continue; }
		const h = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*\r?$/.exec(line);
		if (h) headings.push({ line: i, level: h[1]!.length, text: h[2]!.replace(/[ \t]+#+[ \t]*$/, '').trim() });
	}
	return { lines, headings, excluded, safeEnd: !yaml && !fence && !comment };
}
function targetSections(content: string, heading: string) {
	const doc = structure(content);
	const sections = doc.headings.filter(h => h.level === 2 && h.text === heading).map(h => ({ start: h.line, end: doc.headings.find(n => n.line > h.line && n.level <= 2)?.line ?? doc.lines.length }));
	return { ...doc, sections };
}
export function parseEmbeddedTasks(path: string, content: string, displayName?: string): EmbeddedTask[] {
	const sourceType = embeddedSource(path);
	if (!sourceType) return [];
	const sourceHeading = EMBEDDED_HEADINGS[sourceType];
	const { lines, sections, excluded } = targetSections(content, sourceHeading);
	const tasks: EmbeddedTask[] = [];
	for (const section of sections) for (let i = section.start + 1; i < section.end; i++) {
		if (excluded.has(i)) continue;
		const raw = lines[i]!;
		const match = /^ {0,3}[-*+] \[([ xX])\][ \t]+(.*)\r?$/.exec(raw);
		if (!match) continue;
		const markers = [...raw.matchAll(marker)];
		const stable = markers.length === 1 ? markers[0]![1] : undefined;
		let text = match[2]!.replace(/<!--.*?-->/g, '').trim();
		const dateMatch = /📅\s*(\d{4}-\d{2}-\d{2})(?![\d-])/.exec(text);
		const date = dateMatch && validTaskDate(dateMatch[1]!) ? dateMatch[1] : undefined;
		if (date) text = text.replace(dateMatch![0], '').trim();
		if (!text) continue;
		tasks.push({ id: stable ?? `unassigned:${path}:${i}`, text, completed: match[1]!.toLowerCase() === 'x', date,
			sourceType, sourceFile: path, sourceHeading, sourceDisplayName: displayName ?? (sourceType === 'daily' ? '日常任务' : path.split('/').pop()!.replace(/\.md$/, '').replace(/^project-/, '')),
			locator: { line: i, raw, snapshot: content, persistent: !!stable } });
	}
	return tasks;
}
export function setEmbeddedCompletion(content: string, task: EmbeddedTask, completed: boolean, makeId: () => string): string {
	const current = parseEmbeddedTasks(task.sourceFile, content);
	let matches: EmbeddedTask[];
	if (task.locator.persistent) {
		matches = current.filter(t => t.locator.persistent && t.id === task.id);
		if ([...content.matchAll(marker)].filter(m => m[1] === task.id).length !== 1) throw new Error('任务 ID 重复，请先修正来源笔记');
	} else if (content === task.locator.snapshot) {
		matches = current.filter(t => t.locator.line === task.locator.line && t.locator.raw === task.locator.raw && !t.locator.persistent);
	} else {
		matches = current.filter(t => !t.locator.persistent && t.locator.raw === task.locator.raw);
		// A stale duplicate cannot be distinguished safely even if one was removed.
		if (parseEmbeddedTasks(task.sourceFile, task.locator.snapshot).filter(t => t.locator.raw === task.locator.raw).length !== 1) matches = [];
	}
	if (matches.length !== 1) throw new Error('任务已变化或存在重名歧义，请刷新后重试');
	const found = matches[0]!;
	if ((found.locator.raw.match(/mx-task:/g) ?? []).length > 1) throw new Error('任务标记重复，请先修正来源笔记');
	const lines = content.split('\n');
	let line = found.locator.raw.replace(/^(\s*[-*+] \[)[ xX](\])/, `$1${completed ? 'x' : ' '}$2`);
	if (!found.locator.persistent) {
		if (line.includes('mx-task:')) throw new Error('任务标记格式异常，请先修正来源笔记');
		const id = makeId();
		if (!/^[a-zA-Z0-9-]+$/.test(id) || content.includes(`mx-task:${id}`)) throw new Error('无法生成唯一任务 ID');
		line = line.replace(/\r?$/, ` <!-- mx-task:${id} -->${line.endsWith('\r') ? '\r' : ''}`);
	}
	lines[found.locator.line] = line;
	return lines.join('\n');
}
export function appendEmbeddedTask(content: string, path: string, text: string, date: string | undefined, id: string): string {
	const type = embeddedSource(path);
	if (!type) throw new Error('不是允许的任务来源');
	if (!text.trim() || /[\r\n]|<!--|-->|📅/.test(text)) throw new Error('任务内容须为单行；日期请使用日期选择器');
	if (date && !validTaskDate(date)) throw new Error('日期无效');
	if (!/^[a-zA-Z0-9-]+$/.test(id) || [...content.matchAll(marker)].some(m => m[1] === id)) throw new Error('任务 ID 无效或重复');
	const heading = EMBEDDED_HEADINGS[type];
	const doc = targetSections(content, heading);
	if (doc.sections.length > 1) throw new Error(`存在多个「${heading}」章节，请先整理再添加`);
	if (!doc.safeEnd) throw new Error('笔记含未闭合的 YAML、代码块或注释，请先修正');
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	const line = `- [ ] ${text.trim()}${date ? ` 📅 ${date}` : ''} <!-- mx-task:${id} -->`;
	if (!doc.sections.length) return content + (content.endsWith(eol + eol) ? '' : content.endsWith(eol) ? eol : eol + eol) + `## ${heading}${eol}${eol}${line}${eol}`;
	const section = doc.sections[0]!;
	const offset = doc.lines.slice(0, section.end).reduce((sum, l) => sum + l.length + 1, 0);
	const at = Math.min(offset, content.length);
	const before = content.slice(0, at);
	return before + (before.endsWith('\n') ? '' : eol) + line + eol + (at < content.length ? eol : '') + content.slice(at);
}
export function todayEmbedded(tasks: EmbeddedTask[], date: string): EmbeddedTask[] {
	return tasks.filter(t => !t.completed && !!t.date && t.date <= date).sort((a, b) => a.date!.localeCompare(b.date!) || a.sourceFile.localeCompare(b.sourceFile));
}
export function overdueEmbedded(tasks: EmbeddedTask[], date: string): EmbeddedTask[] { return todayEmbedded(tasks, date).filter(t => t.date! < date); }
export function groupEmbedded(tasks: EmbeddedTask[]): Record<EmbeddedSourceType, EmbeddedTask[]> {
	return { project: tasks.filter(t => t.sourceType === 'project'), creation: tasks.filter(t => t.sourceType === 'creation'), learning: tasks.filter(t => t.sourceType === 'learning'), daily: tasks.filter(t => t.sourceType === 'daily') };
}
/** Cross-source summaries expose three stable user categories; storage headings remain unchanged. */
export function taskDisplayCategory(source: EmbeddedSourceType): TaskDisplayCategory {
	return source === 'project' ? 'creation' : source;
}
export function taskDisplayMarker(source: EmbeddedSourceType): string {
	return TASK_DISPLAY_MARKERS[taskDisplayCategory(source)];
}
export function groupEmbeddedForDisplay(tasks: EmbeddedTask[]): Record<TaskDisplayCategory, EmbeddedTask[]> {
	const groups: Record<TaskDisplayCategory, EmbeddedTask[]> = { learning: [], creation: [], daily: [] };
	for (const task of tasks) groups[taskDisplayCategory(task.sourceType)].push(task);
	return groups;
}

export interface EmbeddedFiles {
	paths(): string[];
	read(path: string): Promise<string>;
	process(path: string, update: (content: string) => string): Promise<void>;
	ensureDaily(): Promise<void>;
}
/** Serialized rescans prevent late reads from resurrecting deleted/renamed sources. */
export class EmbeddedTaskIndex {
	private cache = new Map<string, EmbeddedTask[]>();
	private tail: Promise<void> = Promise.resolve();
	private files: EmbeddedFiles;
	private makeId: () => string;
	constructor(files: EmbeddedFiles, makeId: () => string) { this.files = files; this.makeId = makeId; }
	all(): EmbeddedTask[] { return [...this.cache.values()].flat(); }
	bySource(path: string): EmbeddedTask[] { return this.cache.get(path) ?? []; }
	today(date: string): EmbeddedTask[] { return todayEmbedded(this.all(), date); }
	overdue(date: string): EmbeddedTask[] { return overdueEmbedded(this.all(), date); }
	refresh(): Promise<void> {
		const run = this.tail.then(async () => {
			const next = new Map<string, EmbeddedTask[]>();
			for (const path of this.files.paths().filter(p => embeddedSource(p))) {
				try { next.set(path, parseEmbeddedTasks(path, await this.files.read(path))); }
				catch (error) { if (this.files.paths().includes(path)) throw error; }
			}
			const existing = new Set(this.files.paths());
			this.cache = new Map([...next].filter(([p]) => existing.has(p)));
		});
		this.tail = run.catch(() => {});
		return run;
	}
	async complete(task: EmbeddedTask, completed: boolean): Promise<void> {
		await this.refresh();
		if (task.locator.persistent && this.all().filter(t => t.id === task.id).length !== 1) throw new Error('任务 ID 重复或索引已变化，请刷新');
		await this.files.process(task.sourceFile, content => setEmbeddedCompletion(content, task, completed, this.makeId));
		await this.refresh();
	}
	async add(path: string, text: string, date?: string): Promise<void> {
		const id = this.makeId();
		if (this.all().some(t => t.id === id)) throw new Error('任务 ID 重复，请重试');
		// Validate before any lazy file creation.
		appendEmbeddedTask('', path, text, date, id);
		if (path === DAILY_TASK_FILE) await this.files.ensureDaily();
		await this.files.process(path, content => appendEmbeddedTask(content, path, text, date, id));
		await this.refresh();
	}
}
