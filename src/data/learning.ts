import { readSection } from './planning.ts';
import type { PlanFiles } from './planning';

export const LEARNING_ROOT = '01-学习与资料';
export type LearningKind = '能力' | '学习主题' | '学习资源';
export const RESOURCE_TYPES = ['书籍', '课程', '视频', '文章', '网页', '文档', 'PDF', '其他资料'] as const;
export function resourceFolder(type: string): string {
	const folders: Record<string, string> = { 书籍: '书籍', 课程: '课程', 视频: '视频', 文章: '文章与网页', 网页: '文章与网页', 文档: '文档资料', PDF: '文档资料' };
	return `${LEARNING_ROOT}/${Object.prototype.hasOwnProperty.call(folders, type) ? folders[type] : '文档资料'}`;
}
export function learningFolder(kind: LearningKind, resourceType = '其他资料'): string {
	return kind === '学习资源' ? resourceFolder(resourceType) : LEARNING_ROOT;
}
export interface LearningNote {
	path: string; name: string; kind: LearningKind; status: string;
	priority: string; abilities: string[]; topics: string[]; direction: string;
	domain: string; stage: string; resourceType: string;
}
export interface CurrentLearning extends LearningNote { next: string }

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''; }
export function relationNames(value: unknown): string[] {
	return (Array.isArray(value) ? value : [value]).map(text).filter(Boolean).map((name) => {
		const link = /^\[\[(.*)\]\]$/.exec(name)?.[1];
		if (!link) return name;
		return link.split('|')[1] || (link.split('#')[0] ?? link).split('/').pop() || name;
	});
}

/** Receives already parsed Obsidian MetadataCache properties; never parses YAML. */
export function learningNote(path: string, name: string, properties: unknown): LearningNote | null {
	if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null;
	const fm = properties as Record<string, unknown>;
	const kind = text(fm['类型']);
	if (kind !== '能力' && kind !== '学习主题' && kind !== '学习资源') return null;
	return { path, name, kind, status: text(fm['状态']), priority: text(fm['优先级']),
		abilities: relationNames(fm['所属能力'] ?? fm['能力']), topics: relationNames(fm['关联主题'] ?? fm['学习主题']), direction: text(fm['方向']),
		domain: text(fm['领域']), stage: text(fm['阶段']), resourceType: text(fm['资源类型']) };
}
export function currentTopics(notes: LearningNote[]): LearningNote[] {
	const priorities: Record<string, number> = { 主攻: 0, 辅助: 1, 维护: 2 };
	return notes.filter((note) => note.kind === '学习主题' && note.status === '学习中')
		.sort((a, b) => (priorities[a.priority] ?? 3) - (priorities[b.priority] ?? 3) || a.path.localeCompare(b.path, 'zh-CN')).slice(0, 3);
}
export function queuedResources(notes: LearningNote[]): LearningNote[] {
	return notes.filter((note) => note.kind === '学习资源' && ['排队中', '待学习'].includes(note.status))
		.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}
export function abilityNotes(notes: LearningNote[]): LearningNote[] {
	return notes.filter((note) => note.kind === '能力').sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}
export async function currentLearning(notes: LearningNote[], read: (path: string) => Promise<string>): Promise<CurrentLearning[]> {
	return Promise.all(currentTopics(notes).map(async (note) => {
		try { return { ...note, next: readSection(await read(note.path), '下一步').content[0] ?? '' }; }
		catch { return { ...note, next: '' }; }
	}));
}

export function learningName(input: string): string {
	const name = input.trim().replace(/\.md$/i, '').normalize('NFC');
	if (!name || name.length > 100 || /^[.]/.test(name) || /[. ]$/.test(name)
		|| /[<>:"/\\|?*\u0000-\u001f\u007f\[\]#^]/.test(name)
		|| /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
		throw new Error('请输入 1–100 字的笔记名称，不含路径、控制字符或 <>:"/\\|?*[]#^ 等特殊字符');
	}
	return name;
}
export function learningTemplate(kind: LearningKind, name: string, resourceType = '其他资料'): string {
	const title = learningName(name);
	const headers: Record<LearningKind, string> = {
		能力: '状态: 培养中\n领域: ""\n阶段: ""',
		学习主题: '状态: 学习中\n方向: ""\n所属能力: []\n优先级: 主攻',
		学习资源: `资源类型: ${JSON.stringify(resourceType)}\n状态: 待学习\n方向: ""\n关联主题: []\n来源: ""\n链接: ""`,
	};
	const bodies: Record<LearningKind, string> = {
		能力: '## 能力目标\n\n## 当前阶段\n\n## 能力标准\n\n- [ ]\n\n## 当前学习主题\n\n## 实践与作品\n\n## 备注\n',
		学习主题: '## 学习目标\n\n## 当前资源\n\n-\n\n## 下一步\n\n-\n\n## 实践\n\n-\n\n## 学习记录\n',
		学习资源: '## 为什么要学\n\n## 学习记录\n\n## 备注\n',
	};
	return `---\n类型: ${kind}\n${headers[kind]}\n---\n\n# ${title}\n\n${bodies[kind]}`;
}

export async function ensureLearningNote(files: PlanFiles, kind: LearningKind, input: string, resourceType = '其他资料'): Promise<string> {
	const name = learningName(input);
	const folder = learningFolder(kind, resourceType);
	const path = `${folder}/${name}.md`;
	if (files.kind(path) === 'file') return path;
	if (files.kind(path)) throw new Error('同名路径是文件夹，无法创建笔记');
	for (const dir of [LEARNING_ROOT, folder]) {
		if (files.kind(dir) === 'file') throw new Error('学习目录被文件占用');
		if (!files.kind(dir)) {
			try { await files.createFolder(dir); }
			catch (error) { if (files.kind(dir) !== 'folder') throw error; }
		}
	}
	if (files.kind(path) === 'file') return path;
	try { await files.create(path, learningTemplate(kind, name, resourceType)); }
	catch (error) { if (files.kind(path) !== 'file') throw error; }
	return path;
}
