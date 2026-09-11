import { dateKey } from './planWorkspace.ts';
import { isoWeek } from './planning.ts';
import { quarterOfMonth, quarterStartDate } from './quarters.ts';
import type { Quarter } from './quarters.ts';

export interface VisibleMonth { year: number; month: number }
export type TimeFocus =
	| { kind: 'year'; year: number }
	| { kind: 'quarter'; year: number; quarter: Quarter }
	| { kind: 'month'; year: number; month: number }
	| { kind: 'week'; isoYear: number; isoWeek: number; anchorDate: string }
	| { kind: 'day'; date: string };
export interface TimeTraceState { visible: VisibleMonth; focus: TimeFocus }
export interface MiniCalendarDay { date: Date; key: string; inMonth: boolean }
export interface MiniCalendarWeek { isoYear: number; isoWeek: number; anchorDate: string; days: MiniCalendarDay[] }
export const YEAR_PICKER_PAGE_SIZE = 12;
export type TimeTraceMarkerMode = 'cycle' | 'longTerm' | 'calendar' | 'review';
export interface TimeTraceMarkerSources {
	planExists(period: 'year' | 'quarter' | 'month' | 'week', date: Date): boolean;
	journalExists(period: 'year' | 'month' | 'week', date: Date): boolean;
	dailyJournalExists(date: string): boolean;
}

function atNoon(value: Date): Date { return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12); }
export function parseDateKey(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(year!, month! - 1, day, 12);
	return date.getFullYear() === year && date.getMonth() === month! - 1 && date.getDate() === day ? date : null;
}
export function visibleMonth(date = new Date()): VisibleMonth { return { year: date.getFullYear(), month: date.getMonth() + 1 }; }
export function initialTimeTraceState(now = new Date()): TimeTraceState { const visible = visibleMonth(now); return { visible, focus: { kind: 'year', year: visible.year } }; }
export function shiftVisibleMonth(state: TimeTraceState, offset: number): TimeTraceState {
	const date = new Date(state.visible.year, state.visible.month - 1 + offset, 1, 12);
	return { visible: visibleMonth(date), focus: state.focus };
}
export function selectYear(state: TimeTraceState, year = state.visible.year): TimeTraceState {
	return { visible: { year, month: state.visible.month }, focus: { kind: 'year', year } };
}
export function selectMonth(state: TimeTraceState, month = state.visible.month): TimeTraceState {
	return { visible: { year: state.visible.year, month }, focus: { kind: 'month', year: state.visible.year, month } };
}
export function selectQuarter(state: TimeTraceState): TimeTraceState {
	return { visible: state.visible, focus: { kind: 'quarter', year: state.visible.year, quarter: quarterOfMonth(state.visible.month) } };
}
/** A stable twelve-year page with the anchor year near its centre. */
export function yearPickerPage(anchorYear: number, pageOffset = 0): number[] {
	const start = anchorYear - 5 + pageOffset * YEAR_PICKER_PAGE_SIZE;
	return Array.from({ length: YEAR_PICKER_PAGE_SIZE }, (_, index) => start + index);
}
export function selectWeek(state: TimeTraceState, date: Date): TimeTraceState {
	const anchor = atNoon(date); anchor.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
	const iso = isoWeek(anchor);
	return { visible: state.visible, focus: { kind: 'week', isoYear: iso.year, isoWeek: iso.week, anchorDate: dateKey(anchor) } };
}
export function selectDay(state: TimeTraceState, date: Date): TimeTraceState { const day = atNoon(date); return { visible: visibleMonth(day), focus: { kind: 'day', date: dateKey(day) } }; }
export function selectToday(state: TimeTraceState, now = new Date()): TimeTraceState { return selectDay(state, now); }
export function focusDate(state: TimeTraceState): Date {
	if (state.focus.kind === 'day') return parseDateKey(state.focus.date) ?? new Date(state.visible.year, state.visible.month - 1, 1, 12);
	if (state.focus.kind === 'week') return parseDateKey(state.focus.anchorDate) ?? new Date(state.visible.year, state.visible.month - 1, 1, 12);
	return new Date(state.visible.year, state.visible.month - 1, 1, 12);
}
export function focusMonth(state: TimeTraceState): VisibleMonth {
	if (state.focus.kind === 'month') return { year: state.focus.year, month: state.focus.month };
	if (state.focus.kind === 'day' || state.focus.kind === 'week') return visibleMonth(focusDate(state));
	return state.visible;
}
export function focusLabel(focus: TimeFocus): string {
	if (focus.kind === 'year') return `${focus.year} 年`;
	if (focus.kind === 'quarter') return `${focus.year} Q${focus.quarter}`;
	if (focus.kind === 'month') return `${focus.year} 年 ${focus.month} 月`;
	if (focus.kind === 'week') return `${focus.isoYear}-W${String(focus.isoWeek).padStart(2, '0')}`;
	return focus.date;
}
export function hasTimeTraceMarker(mode: TimeTraceMarkerMode, focus: TimeFocus, sources: TimeTraceMarkerSources): boolean {
	if (mode === 'longTerm') return false;
	if (focus.kind === 'day') return (mode === 'calendar' || mode === 'review') && sources.dailyJournalExists(focus.date);
	if (focus.kind === 'quarter') {
		if (mode !== 'cycle') return false;
		return sources.planExists('quarter', quarterStartDate(focus.year, focus.quarter));
	}
	if (mode === 'calendar') return false;
	const date = focus.kind === 'week'
		? parseDateKey(focus.anchorDate)
		: new Date(focus.year, focus.kind === 'month' ? focus.month - 1 : 0, 1, 12);
	if (!date) return false;
	return mode === 'review' ? sources.journalExists(focus.kind, date) : sources.planExists(focus.kind, date);
}
export function miniCalendarWeeks(year: number, month: number): MiniCalendarWeek[] {
	const first = new Date(year, month - 1, 1, 12);
	const cursor = new Date(first); cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
	return Array.from({ length: 6 }, (_, row) => {
		const monday = new Date(cursor); monday.setDate(cursor.getDate() + row * 7);
		const iso = isoWeek(monday);
		const days = Array.from({ length: 7 }, (_, column) => { const date = new Date(monday); date.setDate(monday.getDate() + column); return { date, key: dateKey(date), inMonth: date.getFullYear() === year && date.getMonth() === month - 1 }; });
		return { isoYear: iso.year, isoWeek: iso.week, anchorDate: dateKey(monday), days };
	});
}
export function focusMatchesYear(focus: TimeFocus, year: number): boolean { return focus.kind === 'year' && focus.year === year; }
export function focusMatchesQuarter(focus: TimeFocus, year: number, quarter: number): boolean { return focus.kind === 'quarter' && focus.year === year && focus.quarter === quarter; }
export function focusMatchesMonth(focus: TimeFocus, year: number, month: number): boolean { return focus.kind === 'month' && focus.year === year && focus.month === month; }
export function focusMatchesWeek(focus: TimeFocus, isoYear: number, isoWeek: number): boolean { return focus.kind === 'week' && focus.isoYear === isoYear && focus.isoWeek === isoWeek; }
export function focusMatchesDay(focus: TimeFocus, date: string): boolean { return focus.kind === 'day' && focus.date === date; }
