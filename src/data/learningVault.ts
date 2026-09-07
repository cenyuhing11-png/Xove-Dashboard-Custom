import { App, TFile, TFolder } from 'obsidian';
import type { PlanFiles } from './planning';
import { learningNote } from './learning';
import type { LearningNote } from './learning';

export interface LearningFiles extends PlanFiles {
	process(path: string, update: (content: string) => string): Promise<unknown>;
}

export function scanLearning(app: App): LearningNote[] {
	const notes: LearningNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		const note = learningNote(file.path, file.basename, cache?.frontmatter, cache?.headings?.map(heading => heading.heading) ?? []);
		if (note) notes.push(note);
	}
	return notes;
}
export function learningFiles(app: App): LearningFiles {
	return {
		kind: (path) => {
			const entry = app.vault.getAbstractFileByPath(path);
			return entry instanceof TFile ? 'file' : entry instanceof TFolder ? 'folder' : undefined;
		},
		read: async (path) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) throw new Error('笔记不存在');
			return app.vault.read(file);
		},
		createFolder: (path) => app.vault.createFolder(path),
		create: (path, content) => app.vault.create(path, content),
		process: async (path, update) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) throw new Error('笔记不存在');
			return app.vault.process(file, update);
		},
	};
}
export async function openLearningFile(app: App, path: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) throw new Error('笔记不存在或已移动');
	await app.workspace.getLeaf('tab').openFile(file);
}
