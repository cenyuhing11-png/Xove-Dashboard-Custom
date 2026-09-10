import { dateKey } from '../../data/planWorkspace';
import { focusMatchesDay, focusMatchesMonth, focusMatchesWeek, focusMatchesYear, miniCalendarWeeks, selectDay, selectMonth, selectToday, selectWeek, selectYear, shiftVisibleMonth, yearPickerPage } from '../../data/timeTrace';
import type { TimeFocus, TimeTraceState } from '../../data/timeTrace';

export interface TimeTraceMiniCalendarOptions {
	state: TimeTraceState;
	today?: Date;
	hasMarker(focus: TimeFocus): boolean;
	onChange(state: TimeTraceState): void;
}

function marker(parent: HTMLElement, visible: boolean): void { if (visible) parent.createSpan({ cls: 'mx-mini-calendar-marker', attr: { 'aria-hidden': 'true' } }); }

/** One shared year/month/week/day selector for every Time Trace section. */
export function renderTimeTraceMiniCalendar(parent: HTMLElement, options: TimeTraceMiniCalendarOptions): () => void {
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
	const year = title.createEl('button', { cls: `mx-mini-calendar-scope${focusMatchesYear(state.focus, state.visible.year) ? ' is-selected' : ''}`, text: `${state.visible.year} 年`, attr: { type: 'button', 'aria-pressed': String(focusMatchesYear(state.focus, state.visible.year)), 'aria-haspopup': 'dialog', 'aria-expanded': 'false' } });
	year.createSpan({ cls: 'mx-mini-calendar-chevron', text: '⌄', attr: { 'aria-hidden': 'true' } });
	marker(year, options.hasMarker(yearFocus));
	const monthFocus: TimeFocus = { kind: 'month', ...state.visible };
	const month = title.createEl('button', { cls: `mx-mini-calendar-scope${focusMatchesMonth(state.focus, state.visible.year, state.visible.month) ? ' is-selected' : ''}`, text: `${state.visible.month} 月`, attr: { type: 'button', 'aria-pressed': String(focusMatchesMonth(state.focus, state.visible.year, state.visible.month)), 'aria-haspopup': 'dialog', 'aria-expanded': 'false' } });
	month.createSpan({ cls: 'mx-mini-calendar-chevron', text: '⌄', attr: { 'aria-hidden': 'true' } });
	marker(month, options.hasMarker(monthFocus));
	const next = nav.createEl('button', { cls: 'po-cal__btn', text: '›', attr: { type: 'button', 'aria-label': '下一月' } });
	next.onclick = () => options.onChange(shiftVisibleMonth(state, 1));

	let picker: HTMLElement | undefined;
	let pickerKind: 'year' | 'month' | undefined;
	const syncExpanded = (): void => {
		year.setAttribute('aria-expanded', String(pickerKind === 'year'));
		month.setAttribute('aria-expanded', String(pickerKind === 'month'));
	};
	const closePicker = (): void => {
		document.removeEventListener('pointerdown', onOutsidePointer, true);
		document.removeEventListener('keydown', onEscape, true);
		picker?.remove(); picker = undefined; pickerKind = undefined; syncExpanded();
	};
	const onOutsidePointer = (event: PointerEvent): void => {
		const target = event.target as Node | null;
		if (target && (picker?.contains(target) || year.contains(target) || month.contains(target))) return;
		closePicker();
	};
	const onEscape = (event: KeyboardEvent): void => {
		if (event.key !== 'Escape') return;
		event.preventDefault(); event.stopPropagation(); closePicker();
	};
	const installPickerListeners = (): void => {
		document.addEventListener('pointerdown', onOutsidePointer, true);
		document.addEventListener('keydown', onEscape, true);
	};
	const renderYearPicker = (pageOffset: number): void => {
		if (!picker) return;
		picker.empty();
		const years = yearPickerPage(state.visible.year, pageOffset);
		const head = picker.createDiv({ cls: 'mx-mini-calendar-picker-head' });
		const previousPage = head.createEl('button', { cls: 'po-cal__btn', text: '‹', attr: { type: 'button', 'aria-label': '上一组年份' } });
		head.createSpan({ text: `${years[0]}–${years.at(-1)}` });
		const nextPage = head.createEl('button', { cls: 'po-cal__btn', text: '›', attr: { type: 'button', 'aria-label': '下一组年份' } });
		previousPage.onclick = () => renderYearPicker(pageOffset - 1);
		nextPage.onclick = () => renderYearPicker(pageOffset + 1);
		const grid = picker.createDiv({ cls: 'mx-mini-calendar-picker-grid' });
		for (const value of years) {
			const selected = value === state.visible.year;
			const currentYear = value === today.getFullYear();
			const button = grid.createEl('button', { cls: `mx-mini-calendar-picker-option${selected ? ' is-selected' : ''}${currentYear ? ' is-current' : ''}`, text: String(value), attr: { type: 'button', 'aria-pressed': String(selected) } });
			button.onclick = () => { closePicker(); options.onChange(selectYear(state, value)); };
		}
	};
	const renderMonthPicker = (): void => {
		if (!picker) return;
		picker.empty();
		picker.createDiv({ cls: 'mx-mini-calendar-picker-label', text: `${state.visible.year} 年` });
		const grid = picker.createDiv({ cls: 'mx-mini-calendar-picker-grid' });
		for (let value = 1; value <= 12; value++) {
			const selected = value === state.visible.month;
			const currentMonth = state.visible.year === today.getFullYear() && value === today.getMonth() + 1;
			const button = grid.createEl('button', { cls: `mx-mini-calendar-picker-option${selected ? ' is-selected' : ''}${currentMonth ? ' is-current' : ''}`, text: `${value} 月`, attr: { type: 'button', 'aria-pressed': String(selected) } });
			button.onclick = () => { closePicker(); options.onChange(selectMonth(state, value)); };
		}
	};
	const openPicker = (kind: 'year' | 'month'): void => {
		if (pickerKind === kind) { closePicker(); return; }
		closePicker(); pickerKind = kind; syncExpanded();
		picker = nav.createDiv({ cls: `mx-mini-calendar-picker is-${kind}`, attr: { role: 'dialog', 'aria-label': kind === 'year' ? '选择年份' : '选择月份' } });
		if (kind === 'year') renderYearPicker(0); else renderMonthPicker();
		installPickerListeners();
	};
	year.onclick = event => { event.stopPropagation(); openPicker('year'); };
	month.onclick = event => { event.stopPropagation(); openPicker('month'); };

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
	return closePicker;
}
