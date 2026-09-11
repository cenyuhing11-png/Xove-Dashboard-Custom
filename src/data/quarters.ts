export type Quarter = 1 | 2 | 3 | 4;

function checkedQuarter(quarter: number): Quarter {
	if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new Error('季度必须为 1 到 4');
	return quarter as Quarter;
}

export function quarterOfMonth(month: number): Quarter {
	if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('月份必须为 1 到 12');
	return (Math.floor((month - 1) / 3) + 1) as Quarter;
}

export function quarterStartMonth(year: number, quarter: number): string {
	const value = checkedQuarter(quarter);
	return `${year}-${String((value - 1) * 3 + 1).padStart(2, '0')}`;
}

export function quarterEndMonth(year: number, quarter: number): string {
	const value = checkedQuarter(quarter);
	return `${year}-${String(value * 3).padStart(2, '0')}`;
}

export function quarterStartDate(year: number, quarter: number): Date {
	const value = checkedQuarter(quarter);
	return new Date(year, (value - 1) * 3, 1, 12);
}
