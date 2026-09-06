import type { PlanFiles } from './planning';

/** Existing notes and concurrent creations always win; never writes over a file. */
export async function ensureSafeNote(files: PlanFiles, path: string, folders: string[], template: string): Promise<string> {
	if (files.kind(path) === 'file') return path;
	if (files.kind(path)) throw new Error('笔记路径被文件夹占用');
	for (const folder of folders) {
		if (files.kind(folder) === 'file') throw new Error('笔记目录被文件占用');
		if (!files.kind(folder)) {
			try { await files.createFolder(folder); }
			catch (error) { if (files.kind(folder) !== 'folder') throw error; }
		}
	}
	if (files.kind(path) === 'file') return path;
	try { await files.create(path, template); }
	catch (error) { if (files.kind(path) !== 'file') throw error; }
	return path;
}
