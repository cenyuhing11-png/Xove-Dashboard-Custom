export interface NaturalTimeSummary {
	date: string;
	weekday: string;
	isoWeek: number;
	monthLabel: string;
	monthProgress: number;
	yearLabel: string;
	yearProgress: number;
}

/** ISO-8601 week number, calculated in UTC to avoid daylight-saving drift. */
export function isoWeekNumber(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const day = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Natural calendar progress; these values are time elapsed, never goal completion. */
export function naturalTimeSummary(now: Date = new Date()): NaturalTimeSummary {
	const year = now.getFullYear();
	const month = now.getMonth();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const startOfYear = new Date(year, 0, 1);
	const startOfToday = new Date(year, month, now.getDate());
	const daysInYear = new Date(year + 1, 0, 1).getTime() - startOfYear.getTime();
	const elapsedInYear = startOfToday.getTime() - startOfYear.getTime() + 86400000;
	return {
		date: now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
		weekday: now.toLocaleDateString('zh-CN', { weekday: 'long' }),
		isoWeek: isoWeekNumber(now),
		monthLabel: `${month + 1}月`,
		monthProgress: Math.min(100, Math.round((now.getDate() / daysInMonth) * 100)),
		yearLabel: String(year),
		yearProgress: Math.min(100, Math.round((elapsedInYear / daysInYear) * 100)),
	};
}
