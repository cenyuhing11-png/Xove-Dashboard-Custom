import { dateKey } from '../../data/planWorkspace';
import { focusMatchesDay, focusMatchesMonth, focusMatchesWeek, focusMatchesYear, miniCalendarWeeks, selectDay, selectMonth, selectToday, selectWeek, selectYear, shiftVisibleMonth } from '../../data/timeTrace';
import type { TimeFocus, TimeTraceState } from '../../data/timeTrace';

export interface TimeTraceMiniCalendarOptions {
	state: TimeTraceState;
	today?: Date;
	hasMarker(focus: TimeFocus): boolean;
	onChange(state: TimeTraceState): void;
}

function marker(parent: HTMLElement, visible: boolean): void { if (visible) parent.createSpan({ cls: 'mx-mini-calendar-marker', attr: { 'aria-hidden': 'true' } }); }

/** One shared year/month/week/day selector for every Time Trace section. */
export function renderTimeTraceMiniCalendar(parent: HTMLElement, options: TimeTraceMiniCalendarOptions): void {
	const { state } = options;
	const today = options.today ?? new Date();
	const todayKey = dateKey(today);
	const current = parent.createEl('button', { cls: 'po-sidebar__item mx-time-trace-today', text: '今天', attr: { type: 'button' } });
	current.onclick = () => options.onChange(selectToday(state, today));

	const nav = parent.createDiv({ cls: 'mx-mini-calendar-nav' });
	const previous = nav.createEl('button', { cls: 'po-cal__btn', text: '‹', attr: { type: 'button', 'aria-label': '上一月' } });
	previous.onclick = () => options.onChange(shiftVisibleMonth(state, -1));
	const title = nav.createDiv({ cls: 'mx-mini-calendar-title' });
	const yearFocus: TimeFocus = { kind: 'year', year: state.visible.year };
	const year = title.createEl('button', { cls: `mx-mini-calendar-scope${focusMatchesYear(state.focus, state.visible.year) ? ' is-selected' : ''}`, text: `${state.visible.year} 年`, attr: { type: 'button', 'aria-pressed': String(focusMatchesYear(state.focus, state.visible.year)) } });
	marker(year, options.hasMarker(yearFocus)); year.onclick = () => options.onChange(selectYear(state));
	const monthFocus: TimeFocus = { kind: 'month', ...state.visible };
	const month = title.createEl('button', { cls: `mx-mini-calendar-scope${focusMatchesMonth(state.focus, state.visible.year, state.visible.month) ? ' is-selected' : ''}`, text: `${state.visible.month} 月`, attr: { type: 'button', 'aria-pressed': String(focusMatchesMonth(state.focus, state.visible.year, state.visible.month)) } });
	marker(month, options.hasMarker(monthFocus)); month.onclick = () => options.onChange(selectMonth(state));
	const next = nav.createEl('button', { cls: 'po-cal__btn', text: '›', attr: { type: 'button', 'aria-label': '下一月' } });
	next.onclick = () => options.onChange(shiftVisibleMonth(state, 1));

	const weekdays = parent.createDiv({ cls: 'mx-mini-calendar-weekdays' });
	weekdays.createSpan({ text: '' });
	for (const name of ['一', '二', '三', '四', '五', '六', '日']) weekdays.createSpan({ text: name });
	const grid = parent.createDiv({ cls: 'mx-mini-calendar-grid' });
	for (const week of miniCalendarWeeks(state.visible.year, state.visible.month)) {
		const weekFocus: TimeFocus = { kind: 'week', isoYear: week.isoYear, isoWeek: week.isoWeek, anchorDate: week.anchorDate };
		const weekButton = grid.createEl('button', { cls: `mx-mini-calendar-week${focusMatchesWeek(state.focus, week.isoYear, week.isoWeek) ? ' is-selected' : ''}`, text: `W${String(week.isoWeek).padStart(2, '0')}`, attr: { type: 'button', 'aria-pressed': String(focusMatchesWeek(state.focus, week.isoYear, week.isoWeek)) } });
		marker(weekButton, options.hasMarker(weekFocus)); weekButton.onclick = () => options.onChange(selectWeek(state, week.days[0]!.date));
		for (const day of week.days) {
			const dayFocus: TimeFocus = { kind: 'day', date: day.key };
			const selected = focusMatchesDay(state.focus, day.key);
			const button = grid.createEl('button', { cls: `mx-mini-calendar-day${day.inMonth ? '' : ' is-out'}${day.key === todayKey ? ' is-today' : ''}${selected ? ' is-selected' : ''}`, text: String(day.date.getDate()), attr: { type: 'button', 'aria-label': day.key, 'aria-pressed': String(selected) } });
			marker(button, options.hasMarker(dayFocus)); button.onclick = () => options.onChange(selectDay(state, day.date));
		}
	}
}
