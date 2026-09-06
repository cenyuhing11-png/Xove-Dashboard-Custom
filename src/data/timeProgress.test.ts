import test from 'node:test';
import assert from 'node:assert/strict';
import { isoWeekNumber, naturalTimeSummary } from '../utils/timeProgress.ts';

test('ISO week follows ISO-8601 across the year boundary', () => {
	assert.equal(isoWeekNumber(new Date(2021, 0, 1)), 53);
	assert.equal(isoWeekNumber(new Date(2021, 0, 4)), 1);
});

test('natural time summary matches the workbench example date', () => {
	const summary = naturalTimeSummary(new Date(2026, 8, 6, 10, 30));
	assert.equal(summary.isoWeek, 36);
	assert.equal(summary.monthLabel, '9月');
	assert.equal(summary.monthProgress, 20);
	assert.equal(summary.yearLabel, '2026');
	assert.equal(summary.yearProgress, 68);
});
