import { App, TFile, parseYaml } from 'obsidian';
import type { ProjectStatus } from '../data/projects';
import { changeProcessStatus } from '../data/processStatus';
import type { ProcessStatusSource } from '../data/processStatus';
import { ConfirmModal } from './ConfirmModal';

const pending = new WeakMap<App, Set<string>>();
/** The only new mutation is a status Property; metadata events refresh all existing views. */
export async function requestProcessStatusChange(app: App, source: ProcessStatusSource, status: ProjectStatus): Promise<void> {
	const busy = pending.get(app) ?? new Set<string>(); pending.set(app, busy);
	if (busy.has(source.sourceFile)) throw new Error('该进程正在修改状态，请先完成当前操作');
	const file = app.vault.getAbstractFileByPath(source.sourceFile);
	if (!(file instanceof TFile)) throw new Error('来源笔记已删除或移动');
	busy.add(source.sourceFile);
	const sameFile = () => { if (file.path !== source.sourceFile || app.vault.getAbstractFileByPath(source.sourceFile) !== file) throw new Error('来源笔记已移动或替换，未修改状态'); };
	try {
		await changeProcessStatus({
			read: async () => { sameFile(); return app.vault.read(file); },
			process: async (_, update) => { sameFile(); await app.vault.process(file, content => { sameFile(); return update(content); }); },
		}, source, status, parseYaml, count => new Promise<boolean>(resolve => {
			new ConfirmModal({ app, title: '标记为已完成', message: `还有 ${count} 项任务未完成，仍标记为已完成吗？`, confirmLabel: '仍然完成', cancelLabel: '取消', confirmStyle: 'primary', onConfirm: () => resolve(true), onCancel: () => resolve(false) }).open();
		}));
	} finally { busy.delete(source.sourceFile); }
}
