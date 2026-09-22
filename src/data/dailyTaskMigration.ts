import { dailyTaskPath, insertDailyTaskRow, LEGACY_DAILY_TASK_FILE, parseEmbeddedTasks, validTaskDate } from './embeddedTasks.ts';
import { journalTemplate } from './journal.ts';

export interface MigrationTask { id: string; text: string; date: string; completed: boolean; row: string; line: number; target: string }
export interface DailyMigrationPlan {
	source: string; tasks: MigrationTask[]; complete: number; incomplete: number;
	byDate: Record<string, number>; missingDate: number; missingId: number; duplicateIds: string[];
	existingIds: number; conflicts: string[]; unresolved: string[]; nonTaskBody: string[];
	writes: Array<{ path: string; before: string | undefined; after: string }>;
	canDelete: boolean;
}
/** Pure dry run. Nothing in this module touches the real Vault or plugin settings. */
export function planDailyTaskMigration(source: string, journals: ReadonlyMap<string, string>): DailyMigrationPlan {
	const plan: DailyMigrationPlan = { source, tasks: [], complete: 0, incomplete: 0, byDate: {}, missingDate: 0, missingId: 0, duplicateIds: [], existingIds: 0, conflicts: [], unresolved: [], nonTaskBody: [], writes: [], canDelete: false };
	const ids = new Set<string>();
	let section = ''; let yaml = false;
	for (const [line, row] of source.split(/\r?\n/).entries()) {
		const trimmed = row.trim();
		if (!trimmed) continue;
		if (line === 0 && trimmed === '---') { yaml = true; continue; }
		if (yaml) { if (trimmed === '---') yaml = false; else if (trimmed !== '类型: 日常任务') plan.nonTaskBody.push(`${line + 1}: ${row}`); continue; }
		if (['# 日常任务', '## 日常待办', '## 定期事项'].includes(trimmed)) { if (trimmed.startsWith('## ')) section = trimmed.slice(3); continue; }
		if (/^- \[ \]\s*$/.test(trimmed)) continue;
		const match = /^ {0,3}[-*+] \[([ xX])\]\s+(.+)$/.exec(row);
		if (!match || section !== '日常待办') { plan.nonTaskBody.push(`${line + 1}: ${row}`); continue; }
		const completed = match[1]!.toLowerCase() === 'x';
		if (completed) plan.complete++; else plan.incomplete++;
		const markers = [...row.matchAll(/<!--\s*mx-task:([a-zA-Z0-9-]+)\s*-->/g)];
		const id = markers.length === 1 ? markers[0]![1]! : '';
		const dates = [...row.matchAll(/📅\s*(\d{4}-\d{2}-\d{2})(?![\d-])/g)];
		const date = dates.length === 1 && validTaskDate(dates[0]![1]!) ? dates[0]![1]! : '';
		if (!id) { plan.missingId++; plan.unresolved.push(`${line + 1}: 缺少唯一有效 UUID: ${row}`); }
		if (!date) { plan.missingDate++; plan.unresolved.push(`${line + 1}: 缺少唯一有效日期: ${row}`); }
		if (id) { if (ids.has(id)) { plan.duplicateIds.push(id); plan.conflicts.push(`中央文件重复 UUID: ${id}`); } ids.add(id); }
		if (!id || !date) continue;
		const target = dailyTaskPath(date);
		const parsed = parseEmbeddedTasks(target, `## 今日任务\n${row}`)[0];
		if (!parsed) { plan.unresolved.push(`${line + 1}: 无有效任务内容: ${row}`); continue; }
		plan.byDate[date] = (plan.byDate[date] ?? 0) + 1;
		plan.tasks.push({ id, text: parsed.text, date, completed, row, line, target });
	}
	if (yaml) plan.nonTaskBody.push('未闭合 frontmatter');
	const targets = new Map<string, string>();
	for (const task of plan.tasks) {
		if (!journals.has(task.target) && journals.has(task.target.replace(/\.md$/, ' 日记.md'))) { plan.conflicts.push(`已有旧格式日记，不能重复创建: ${task.target}`); continue; }
		const occurrences = [...journals].flatMap(([path, body]) => [...body.matchAll(/<!--\s*mx-task:([a-zA-Z0-9-]+)\s*-->/g)].filter(match => match[1] === task.id).map(() => ({ path, body })));
		if (occurrences.length) {
			plan.existingIds++;
			const current = occurrences.length === 1 && occurrences[0]!.path === task.target ? parseEmbeddedTasks(task.target, occurrences[0]!.body).find(t => t.id === task.id) : undefined;
			if (!current || current.text !== task.text || current.date !== task.date || current.completed !== task.completed) plan.conflicts.push(`目标 UUID 冲突: ${task.id}`);
			continue;
		}
		try {
			const before = targets.get(task.target) ?? journals.get(task.target) ?? journalTemplate('day', new Date(`${task.date}T12:00:00`));
			targets.set(task.target, insertDailyTaskRow(before, task.target, task.row));
		} catch (error) { plan.conflicts.push(`${task.target}: ${String(error)}`); }
	}
	plan.writes = [...targets].map(([path, after]) => ({ path, before: journals.get(path), after }));
	plan.canDelete = !plan.conflicts.length && !plan.unresolved.length && !plan.nonTaskBody.length;
	return plan;
}
export interface MigrationFiles {
	read(path: string): Promise<string | undefined>;
	write(path: string, content: string, expected: string | undefined): Promise<void>;
	remove(path: string, expected: string): Promise<void>;
}
/** Apply only a clean reviewed plan; adapter must back up first and provide compare-and-write semantics. */
export async function applyDailyTaskMigration(plan: DailyMigrationPlan, files: MigrationFiles): Promise<void> {
	if (!plan.canDelete) throw new Error('迁移存在 conflict、unresolved 或非任务正文，请先处理');
	if (await files.read(LEGACY_DAILY_TASK_FILE) !== plan.source) throw new Error('中央文件已变化');
	for (const change of plan.writes) if (await files.read(change.path) !== change.before) throw new Error(`目标已变化: ${change.path}`);
	for (const change of plan.writes) await files.write(change.path, change.after, change.before);
	for (const task of plan.tasks) {
		const content = await files.read(task.target);
		const matches = parseEmbeddedTasks(task.target, content ?? '').filter(t => t.id === task.id);
		if ([...(content ?? '').matchAll(/<!--\s*mx-task:([a-zA-Z0-9-]+)\s*-->/g)].filter(match => match[1] === task.id).length !== 1 || matches.length !== 1 || matches[0]!.text !== task.text || matches[0]!.date !== task.date || matches[0]!.completed !== task.completed) throw new Error(`迁移校验失败: ${task.id}`);
	}
	// The old source survives every failed write or verification. Re-running the dry run deduplicates successful writes.
	await files.remove(LEGACY_DAILY_TASK_FILE, plan.source);
}
