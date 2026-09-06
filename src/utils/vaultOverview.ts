import type { App } from 'obsidian';
import { fmtDate } from '../data/taskLogic';

export function calcHeatmapStats(data: Map<string, number>, year: number, today: Date): { total: number; active: number; streak: number } {
	let total = 0;
	let active = 0;
	const prefix = `${year}-`;
	const todayStr = fmtDate(today);

	for (const [date, count] of data) {
		if (!date.startsWith(prefix) || date > todayStr) continue;
		total += count;
		if (count > 0) active++;
	}

	// current streak counted backwards from today
	let streak = 0;
	const d = new Date(today);
	while (d.getFullYear() === year) {
		const key = fmtDate(d);
		if ((data.get(key) ?? 0) > 0) streak++;
		else break;
		d.setDate(d.getDate() - 1);
	}

	return { total, active, streak };
}


export function getVaultNoteCounts(app: App): Map<string, number> {
	const counts = new Map<string, number>();
	for (const file of app.vault.getMarkdownFiles()) { const key = fmtDate(new Date(file.stat.ctime)); counts.set(key, (counts.get(key) ?? 0) + 1); }
	return counts;
}
