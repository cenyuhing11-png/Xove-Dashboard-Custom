import { TFile, TFolder } from 'obsidian';
import type { App } from 'obsidian';
import { LONG_TERM_PLAN_ROOT, linkedPeriodPlan, longTermPlanNote } from './longTermPlans';
import type { LinkedPeriodPlan, LongTermPlan } from './longTermPlans';
import type { PlanFiles } from './planning';
import type { Process } from './processes';
import { writeFrontmatter } from './frontmatterWriter';

export function longTermPlanFiles(app: App): PlanFiles {
	return { kind: path => { const entry = app.vault.getAbstractFileByPath(path); return entry instanceof TFile ? 'file' : entry instanceof TFolder ? 'folder' : undefined; },
		read: async path => { const file = app.vault.getAbstractFileByPath(path); if (!(file instanceof TFile)) throw new Error('长期计划不存在'); return app.vault.cachedRead(file); },
		createFolder: path => app.vault.createFolder(path), create: (path, content) => app.vault.create(path, content) };
}
export async function scanLongTermPlans(app: App): Promise<LongTermPlan[]> {
	const files = app.vault.getMarkdownFiles().filter(file => file.path.startsWith(`${LONG_TERM_PLAN_ROOT}/`));
	const values = await Promise.all(files.map(async file => { try { return longTermPlanNote(file.path, app.metadataCache.getFileCache(file)?.frontmatter, await app.vault.cachedRead(file)); } catch { return null; } }));
	return values.filter((value): value is LongTermPlan => !!value).sort((a,b) => a.startMonth.localeCompare(b.startMonth) || a.name.localeCompare(b.name,'zh-CN'));
}
export function longTermPlanName(app: App, id: string): string {
	for (const file of app.vault.getMarkdownFiles()) {
		if (!file.path.startsWith(`${LONG_TERM_PLAN_ROOT}/`)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm?.['类型'] === '长期计划' && fm?.['长期计划ID'] === id) return file.basename;
	}
	return '';
}
export function scanLinkedPeriodPlans(app: App): LinkedPeriodPlan[] {
	return app.vault.getMarkdownFiles().map(file => linkedPeriodPlan(file.path, app.metadataCache.getFileCache(file)?.frontmatter)).filter((value): value is LinkedPeriodPlan => !!value);
}
export async function setProcessLongTermPlan(app: App, process: Pick<Process, 'sourceFile'>, longTermPlanId?: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(process.sourceFile);
	if (!(file instanceof TFile)) throw new Error('进程来源笔记不存在');
	await writeFrontmatter(app, file, { '关联长期计划ID': longTermPlanId || null });
}
