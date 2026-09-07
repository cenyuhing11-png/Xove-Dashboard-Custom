import { embeddedSource, parseEmbeddedTasks } from './embeddedTasks.ts';
import { PROJECT_STATUSES } from './projects.ts';
import type { ProjectStatus } from './projects';
import { learningProcessStatus } from './processes.ts';
import type { ProcessType } from './processes';

export interface ProcessStatusSource { sourceFile: string; processType: ProcessType; projectId?: string }
export interface ProcessStatusFiles {
	read(path: string): Promise<string>;
	process(path: string, update: (content: string) => string): Promise<void>;
}
type YamlReader = (yaml: string) => unknown;
function inspect(content: string, source: ProcessStatusSource, parseYaml: YamlReader) {
	if (embeddedSource(source.sourceFile) !== source.processType) throw new Error('进程来源已移动或不在正式目录中');
	const block = /^(\uFEFF?---[ \t]*\r?\n)([\s\S]*?)(\r?\n(?:---|\.\.\.)[ \t]*(?=\r?\n|$))/.exec(content);
	if (!block) throw new Error('来源笔记缺少有效 Properties，请先检查原笔记');
	const parsed = parseYaml(block[2]!);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('来源 Properties 无效');
	const fm = parsed as Record<string, unknown>;
	const expected = source.processType === 'learning' ? ['学习主题', '学习资源'] : source.processType === 'creation' ? ['知识与思考'] : ['项目'];
	if (!expected.includes(String(fm['类型'] ?? ''))) throw new Error('来源笔记类型已改变，未修改状态');
	if (source.projectId && fm['项目ID'] !== source.projectId) throw new Error('项目身份已改变，未修改状态');
	const rawStatus = fm['状态'];
	if (rawStatus != null && typeof rawStatus !== 'string') throw new Error('状态属性不是文本，请先检查原笔记');
	const status = source.processType !== 'project' ? learningProcessStatus(String(rawStatus ?? '')) : PROJECT_STATUSES.includes(rawStatus as ProjectStatus) ? rawStatus as ProjectStatus : '计划中';
	return { block, fm, rawStatus, status, pending: parseEmbeddedTasks(source.sourceFile, content).filter(t => !t.completed).length };
}
/** Patch only the top-level status scalar; all other Properties/body bytes stay intact.
 * Obsidian parses both versions. Unusual/ambiguous YAML fails closed rather than being reformatted.
 */
function patch(content: string, source: ProcessStatusSource, next: ProjectStatus, parseYaml: YamlReader): string {
	const before = inspect(content, source, parseYaml), yaml = before.block[2]!;
	const lines = yaml.split(/(?<=\n)/), matches: number[] = [];
	for (let i = 0; i < lines.length; i++) if (/^(?:状态|"状态"|'状态')[ \t]*:/.test(lines[i]!)) matches.push(i);
	if (matches.length > 1 || (!matches.length && Object.prototype.hasOwnProperty.call(before.fm, '状态'))) throw new Error('状态 Properties 格式不明确，请先在原笔记中整理');
	let updatedYaml: string;
	if (matches.length) {
		const i = matches[0]!, line = lines[i]!;
		// A block scalar/anchor has dependencies beyond this line; do not guess how to rewrite it.
		const match = /^((?:状态|"状态"|'状态')[ \t]*:[ \t]*)(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\r\n#]*?)([ \t]+#.*)?(\r?\n)?$/.exec(line);
		if (!match || /^(?:状态|"状态"|'状态')[ \t]*:[ \t]*[|>&*!]/.test(line)) throw new Error('状态属性不是普通文本，请先在原笔记中整理');
		lines[i] = match[1] + next + (match[2] || '') + (match[3] || ''); updatedYaml = lines.join('');
	} else updatedYaml = yaml + (content.includes('\r\n') ? '\r\n' : '\n') + `状态: ${next}`;
	const updated = before.block[1] + updatedYaml + before.block[3] + content.slice(before.block[0].length);
	const after = inspect(updated, source, parseYaml);
	const others = (fm: Record<string, unknown>) => JSON.stringify(Object.keys(fm).filter(k => k !== '状态').sort().map(k => [k, fm[k]]));
	if (after.rawStatus !== next || others(before.fm) !== others(after.fm)) throw new Error('状态更新会影响其他 Properties，已取消写入');
	return updated;
}
/** Confirm from a fresh Markdown snapshot, then atomically revalidate before writing. */
export async function changeProcessStatus(files: ProcessStatusFiles, source: ProcessStatusSource, next: ProjectStatus, parseYaml: YamlReader, confirm: (pending: number) => Promise<boolean>): Promise<boolean> {
	if (!PROJECT_STATUSES.includes(next)) throw new Error('进程状态无效');
	const before = inspect(await files.read(source.sourceFile), source, parseYaml);
	if (before.status === next) return false;
	const completing = next === '已完成';
	if (completing && before.pending > 0 && !await confirm(before.pending)) return false;
	await files.process(source.sourceFile, content => {
		const current = inspect(content, source, parseYaml);
		if (current.rawStatus !== before.rawStatus || current.fm['项目ID'] !== before.fm['项目ID'] || (completing && current.pending !== before.pending)) throw new Error('状态或未完成任务数已变化，请重新选择状态');
		return patch(content, source, next, parseYaml);
	});
	return true;
}
