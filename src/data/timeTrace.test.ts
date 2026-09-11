import test from 'node:test';
import assert from 'node:assert/strict';
import {
	focusDate,
	focusLabel,
	focusMatchesDay,
	focusMatchesMonth,
	focusMatchesQuarter,
	focusMatchesWeek,
	focusMatchesYear,
	focusMonth,
	hasTimeTraceMarker,
	initialTimeTraceState,
	miniCalendarWeeks,
	parseDateKey,
	selectDay,
	selectMonth,
	selectQuarter,
	selectToday,
	selectWeek,
	selectYear,
	shiftVisibleMonth,
	yearPickerPage,
} from './timeTrace.ts';
import type { TimeTraceState } from './timeTrace.ts';

const september: TimeTraceState = { visible: { year: 2026, month: 9 }, focus: { kind: 'year', year: 2026 } };

test('mini calendar always renders six weeks of seven days', () => {
	const weeks = miniCalendarWeeks(2026, 9);
	assert.equal(weeks.length, 6);
	assert.ok(weeks.every(week => week.days.length === 7));
});

test('mini calendar starts on Monday and ends on Sunday', () => {
	const weeks = miniCalendarWeeks(2026, 9);
	assert.equal(weeks[0]!.days[0]!.date.getDay(), 1);
	assert.equal(weeks[5]!.days[6]!.date.getDay(), 0);
});

test('September 2026 exposes the correct adjacent month dates', () => {
	const weeks = miniCalendarWeeks(2026, 9);
	assert.equal(weeks[0]!.days[0]!.key, '2026-08-31');
	assert.equal(weeks[5]!.days[6]!.key, '2026-10-11');
	assert.equal(weeks.flatMap(week => week.days).filter(day => day.inMonth).length, 30);
});

test('September 2026 exposes the correct ISO week sequence', () => {
	assert.deepEqual(miniCalendarWeeks(2026, 9).map(week => [week.isoYear, week.isoWeek]), [[2026, 36], [2026, 37], [2026, 38], [2026, 39], [2026, 40], [2026, 41]]);
});

test('ISO week metadata stays correct across calendar years', () => {
	const weeks = miniCalendarWeeks(2021, 1);
	assert.deepEqual([weeks[0]!.isoYear, weeks[0]!.isoWeek, weeks[0]!.anchorDate], [2020, 53, '2020-12-28']);
});

test('previous month changes only the visible month', () => {
	const state = shiftVisibleMonth(september, -1);
	assert.deepEqual(state.visible, { year: 2026, month: 8 });
	assert.deepEqual(state.focus, september.focus);
});

test('next month rolls across the year and preserves focus', () => {
	const original: TimeTraceState = { visible: { year: 2026, month: 12 }, focus: { kind: 'week', isoYear: 2026, isoWeek: 50, anchorDate: '2026-12-07' } };
	const state = shiftVisibleMonth(original, 1);
	assert.deepEqual(state.visible, { year: 2027, month: 1 });
	assert.deepEqual(state.focus, original.focus);
});

test('today returns to its visible month and becomes day focus', () => {
	const state = selectToday(september, new Date(2027, 1, 3, 18));
	assert.deepEqual(state, { visible: { year: 2027, month: 2 }, focus: { kind: 'day', date: '2027-02-03' } });
});

test('year selection creates only year focus', () => {
	const state = selectYear({ ...september, focus: { kind: 'day', date: '2026-09-10' } });
	assert.deepEqual(state.focus, { kind: 'year', year: 2026 });
	assert.ok(focusMatchesYear(state.focus, 2026));
});

test('picker year selection preserves the visible month and selects year precision', () => {
	const state = selectYear({ ...september, focus: { kind: 'day', date: '2026-09-10' } }, 2024);
	assert.deepEqual(state, { visible: { year: 2024, month: 9 }, focus: { kind: 'year', year: 2024 } });
});

test('month selection creates only month focus', () => {
	const state = selectMonth(september);
	assert.deepEqual(state.focus, { kind: 'month', year: 2026, month: 9 });
	assert.ok(focusMatchesMonth(state.focus, 2026, 9));
});

test('picker month selection preserves the visible year and selects month precision', () => {
	const state = selectMonth({ ...september, focus: { kind: 'week', isoYear: 2026, isoWeek: 37, anchorDate: '2026-09-07' } }, 3);
	assert.deepEqual(state, { visible: { year: 2026, month: 3 }, focus: { kind: 'month', year: 2026, month: 3 } });
});

test('quarter selection derives Q3 from visible September without moving the visible month', () => {
	const state = selectQuarter(september);
	assert.deepEqual(state, { visible: { year: 2026, month: 9 }, focus: { kind: 'quarter', year: 2026, quarter: 3 } });
	assert.ok(focusMatchesQuarter(state.focus, 2026, 3));
});

test('quarter selection follows visible month changes instead of storing a second visible quarter', () => {
	const october = shiftVisibleMonth(selectQuarter(september), 1);
	assert.deepEqual(october.visible, { year: 2026, month: 10 });
	assert.deepEqual(selectQuarter(october).focus, { kind: 'quarter', year: 2026, quarter: 4 });
});

test('year picker exposes twelve years with its anchor near the centre', () => {
	assert.deepEqual(yearPickerPage(2026), [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032]);
});

test('year picker paging moves in non-overlapping twelve-year groups', () => {
	assert.deepEqual(yearPickerPage(2026, -1), [2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020]);
	assert.deepEqual(yearPickerPage(2026, 1), [2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040, 2041, 2042, 2043, 2044]);
});

test('week selection stores ISO year week and Monday anchor', () => {
	const state = selectWeek(september, new Date(2026, 8, 10, 12));
	assert.deepEqual(state.focus, { kind: 'week', isoYear: 2026, isoWeek: 37, anchorDate: '2026-09-07' });
	assert.ok(focusMatchesWeek(state.focus, 2026, 37));
});

test('day selection creates only day focus', () => {
	const state = selectDay(september, new Date(2026, 8, 10, 12));
	assert.deepEqual(state.focus, { kind: 'day', date: '2026-09-10' });
	assert.ok(focusMatchesDay(state.focus, '2026-09-10'));
});

test('an adjacent-month day selection also changes the visible month', () => {
	const state = selectDay(september, new Date(2026, 7, 31, 12));
	assert.deepEqual(state.visible, { year: 2026, month: 8 });
	assert.deepEqual(state.focus, { kind: 'day', date: '2026-08-31' });
});

test('focus matchers keep all five focus kinds mutually exclusive', () => {
	const focus = selectWeek(september, new Date(2026, 8, 10, 12)).focus;
	assert.equal(focusMatchesYear(focus, 2026), false);
	assert.equal(focusMatchesMonth(focus, 2026, 9), false);
	assert.equal(focusMatchesQuarter(focus, 2026, 3), false);
	assert.equal(focusMatchesDay(focus, '2026-09-10'), false);
	assert.equal(focusMatchesWeek(focus, 2026, 37), true);
});

test('week focus degrades to its anchor month for month-precision consumers', () => {
	const state = selectWeek({ visible: { year: 2021, month: 1 }, focus: { kind: 'year', year: 2021 } }, new Date(2020, 11, 28, 12));
	assert.deepEqual(focusMonth(state), { year: 2020, month: 12 });
});

test('day focus degrades to its exact month for month-precision consumers', () => {
	assert.deepEqual(focusMonth(selectDay(september, new Date(2026, 8, 30, 12))), { year: 2026, month: 9 });
});

test('year focus leaves the concrete visible month available to cycle plans', () => {
	assert.deepEqual(focusMonth(september), { year: 2026, month: 9 });
	assert.equal(focusDate(september).getMonth(), 8);
});

test('quarter focus leaves the concrete visible month available to month-only consumers', () => {
	const state = selectQuarter(september);
	assert.deepEqual(focusMonth(state), { year: 2026, month: 9 });
	assert.equal(focusDate(state).getMonth(), 8);
});

test('focus labels preserve the selected precision', () => {
	assert.equal(focusLabel({ kind: 'year', year: 2026 }), '2026 年');
	assert.equal(focusLabel({ kind: 'quarter', year: 2026, quarter: 3 }), '2026 Q3');
	assert.equal(focusLabel({ kind: 'month', year: 2026, month: 9 }), '2026 年 9 月');
	assert.equal(focusLabel({ kind: 'week', isoYear: 2026, isoWeek: 7, anchorDate: '2026-02-09' }), '2026-W07');
	assert.equal(focusLabel({ kind: 'day', date: '2026-09-10' }), '2026-09-10');
});

test('date keys reject impossible and malformed dates', () => {
	assert.equal(parseDateKey('2026-02-30'), null);
	assert.equal(parseDateKey('2026/09/10'), null);
	assert.equal(parseDateKey('2026-09-10')?.getDate(), 10);
});

test('initial state uses the current visible year without persisted state', () => {
	assert.deepEqual(initialTimeTraceState(new Date(2026, 8, 10, 12)), september);
});

const markerSources = (plans: string[] = [], journals: string[] = [], days: string[] = []) => ({
	planExists: (period: 'year' | 'quarter' | 'month' | 'week', date: Date) => plans.includes(`${period}:${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`),
	journalExists: (period: 'year' | 'month' | 'week', date: Date) => journals.includes(`${period}:${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`),
	dailyJournalExists: (date: string) => days.includes(date),
});

test('cycle markers represent existing year quarter month and week plans', () => {
	const sources = markerSources(['year:2026-1-1', 'quarter:2026-7-1', 'month:2026-9-1', 'week:2026-9-7']);
	assert.equal(hasTimeTraceMarker('cycle', { kind: 'year', year: 2026 }, sources), true);
	assert.equal(hasTimeTraceMarker('cycle', { kind: 'quarter', year: 2026, quarter: 3 }, sources), true);
	assert.equal(hasTimeTraceMarker('cycle', { kind: 'month', year: 2026, month: 9 }, sources), true);
	assert.equal(hasTimeTraceMarker('cycle', { kind: 'week', isoYear: 2026, isoWeek: 37, anchorDate: '2026-09-07' }, sources), true);
});

test('cycle never invents a marker for day focus', () => {
	assert.equal(hasTimeTraceMarker('cycle', { kind: 'day', date: '2026-09-10' }, markerSources([], [], ['2026-09-10'])), false);
});

test('calendar day markers come only from existing daily journals', () => {
	const sources = markerSources([], [], ['2026-09-10']);
	assert.equal(hasTimeTraceMarker('calendar', { kind: 'day', date: '2026-09-10' }, sources), true);
	assert.equal(hasTimeTraceMarker('calendar', { kind: 'month', year: 2026, month: 9 }, sources), false);
});

test('review markers represent day week month and year journals', () => {
	const sources = markerSources([], ['week:2026-9-7', 'month:2026-9-1', 'year:2026-1-1'], ['2026-09-10']);
	assert.equal(hasTimeTraceMarker('review', { kind: 'day', date: '2026-09-10' }, sources), true);
	assert.equal(hasTimeTraceMarker('review', { kind: 'week', isoYear: 2026, isoWeek: 37, anchorDate: '2026-09-07' }, sources), true);
	assert.equal(hasTimeTraceMarker('review', { kind: 'month', year: 2026, month: 9 }, sources), true);
	assert.equal(hasTimeTraceMarker('review', { kind: 'year', year: 2026 }, sources), true);
	assert.equal(hasTimeTraceMarker('review', { kind: 'quarter', year: 2026, quarter: 3 }, sources), false);
});

test('long-term plans deliberately expose no mini-calendar markers', () => {
	const everything = markerSources(['year:2026-1-1'], ['year:2026-1-1'], ['2026-09-10']);
	assert.equal(hasTimeTraceMarker('longTerm', { kind: 'year', year: 2026 }, everything), false);
	assert.equal(hasTimeTraceMarker('longTerm', { kind: 'day', date: '2026-09-10' }, everything), false);
});
