import { App, TFile, TFolder } from 'obsidian';
import type { QuickJournalFiles } from './quickJournal.ts';

export function quickJournalFiles(app: App): QuickJournalFiles {
	const vault = app.vault;
	return {
		kind: path => {
			const entry = vault.getAbstractFileByPath(path);
			return entry instanceof TFile ? 'file' : entry instanceof TFolder ? 'folder' : undefined;
		},
		read: async path => {
			const file = vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) throw new Error('日记不存在或已移动');
			return vault.read(file);
		},
		createFolder: path => vault.createFolder(path),
		create: (path, content) => vault.create(path, content),
		process: async (path, update) => {
			const file = vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) throw new Error('日记不存在或已移动');
			return vault.process(file, update);
		},
	};
}
