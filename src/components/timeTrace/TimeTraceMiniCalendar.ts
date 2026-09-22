import { dateKey } from '../../data/planWorkspace';
import { focusMatchesDay, focusMatchesMonth, focusMatchesQuarter, focusMatchesWeek, focusMatchesYear, miniCalendarWeeks, selectDay, selectMonth, selectQuarter, selectToday, selectWeek, selectYear, shiftVisibleMonth, yearPickerPage } from '../../data/timeTrace';
import type { TimeFocus, TimeTraceState } from '../../data/timeTrace';
import { quarterOfMonth } from '../../data/quarters';

export interface TimeTraceMiniCalendarOptions {
	state: TimeTraceState;
	today?: Date;
	collapsed?: boolean;
	onToggleCollapsed?(): void;
	hasMarker(focus: TimeFocus): boolean;
	onChange(state: TimeTraceState): void;
	onFocus?(state: TimeTraceState): void;
}

function marker(parent: HTMLElement, visible: boolean): void { if (visible) parent.createSpan({ cls: 'mx-mini-calendar-marker', attr: { 'aria-hidden': 'true' } }); }

/** One shared year/quarter/month/week/day selector for every Time Trace section. */
export function renderTimeTraceMiniCalendar(parent: HTMLElement, options: TimeTraceMiniCalendarOptions): () => void {
	const { state } = options;
	const enterFocus = (next: TimeTraceState) => (options.onFocus ?? options.onChange)(next);
	const today = options.today ?? new Date();
	const todayKey = dateKey(today);
	const current = parent.createEl('button', { cls: 'po-sidebar__item mx-time-trace-today', text: '今天', attr: { type: 'button' } });
	current.onclick = () => enterFocus(selectToday(state, today));

	const nav = parent.createDiv({ cls: 'mx-mini-calendar-nav' });
	const previous = nav.createEl('button', { cls: 'po-cal__btn', text: '‹', attr: { type: 'button', 'aria-label': '上一月' } });
	previous.onclick = () => options.onChange(shiftVisibleMonth(state, -1));
	const title = nav.createDiv({ cls: 'mx-mini-calendar-title' });
	const yearFocus: TimeFocus = { kind: 'year', year: state.visible.year };
	const year = title.createEl('button', { cls: `mx-mini-calendar-scope${focusMatchesYear(state.focus, state.visible.year) ? ' is-selected' : ''}`, text: `${state.visible.year} 年`, attr: { type: 'button', 'aria-pressed': String(focusMatchesYear(state.focus, state.visible.year)), 'data-scope-label': 'year' } });
	const yearArrow = title.createEl('button', { cls: 'mx-mini-calendar-scope mx-mini-calendar-chevron', text: '⌄', attr: { type: 'button', 'data-scope-arrow': 'year', 'aria-label': '选择年份', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' } });
	marker(year, options.hasMarker(yearFocus));
	const monthFocus: TimeFocus = { kind: 'month', ...state.visible };
	const month = title.createEl('button', { cls: `mx-mini-calendar-scope${focusMatchesMonth(state.focus, state.visible.year, state.visible.month) ? ' is-selected' : ''}`, text: `${state.visible.month} 月`, attr: { type: 'button', 'aria-pressed': String(focusMatchesMonth(state.focus, state.visible.year, state.visible.month)), 'data-scope-label': 'month' } });
	const monthArrow = title.createEl('button', { cls: 'mx-mini-calendar-scope mx-mini-calendar-chevron', text: '⌄', attr: { type: 'button', 'data-scope-arrow': 'month', 'aria-label': '选择月份', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' } });
	marker(month, options.hasMarker(monthFocus));
	const next = nav.createEl('button', { cls: 'po-cal__btn', text: '›', attr: { type: 'button', 'aria-label': '下一月' } });
	next.onclick = () => options.onChange(shiftVisibleMonth(state, 1));
	const toggle = nav.createEl('button', { cls: 'mx-mini-calendar-toggle', text: options.collapsed ? '⌄' : '⌃', attr: { type: 'button', 'aria-label': options.collapsed ? '展开日历' : '收起日历', 'aria-expanded': String(!options.collapsed) } });
	toggle.onclick = event => { event.stopPropagation(); options.onToggleCollapsed?.(); };

	let picker: HTMLElement | undefined;
	let pickerKind: 'year' | 'month' | undefined;
	const syncExpanded = (): void => {
		yearArrow.setAttribute('aria-expanded', String(pickerKind === 'year'));
		monthArrow.setAttribute('aria-expanded', String(pickerKind === 'month'));
	};
	const closePicker = (): void => {
		document.removeEventListener('pointerdown', onOutsidePointer, true);
		document.removeEventListener('keydown', onEscape, true);
		picker?.remove(); picker = undefined; pickerKind = undefined; syncExpanded();
	};
	const onOutsidePointer = (event: PointerEvent): void => {
		const target = event.target as Node | null;
		if (target && (picker?.contains(target) || yearArrow.contains(target) || monthArrow.contains(target))) return;
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
	year.onclick = event => { event.preventDefault(); event.stopPropagation(); closePicker(); enterFocus(selectYear(state, state.visible.year)); };
	yearArrow.onclick = event => { event.preventDefault(); event.stopPropagation(); openPicker('year'); };
	month.onclick = event => { event.preventDefault(); event.stopPropagation(); closePicker(); enterFocus(selectMonth(state, state.visible.month)); };
	monthArrow.onclick = event => { event.preventDefault(); event.stopPropagation(); openPicker('month'); };

	const body = parent.createDiv({ cls: 'mx-mini-calendar-body' });
	const weekdays = body.createDiv({ cls: 'mx-mini-calendar-weekdays' });
	const quarterValue = quarterOfMonth(state.visible.month);
	const quarterFocus: TimeFocus = { kind: 'quarter', year: state.visible.year, quarter: quarterValue };
	const quarter = weekdays.createEl('button', { cls: `mx-mini-calendar-scope mx-mini-calendar-quarter${focusMatchesQuarter(state.focus, state.visible.year, quarterValue) ? ' is-selected' : ''}`, text: `Q${quarterValue}`, attr: { type: 'button', 'aria-label': `选择 ${state.visible.year} Q${quarterValue}`, 'aria-pressed': String(focusMatchesQuarter(state.focus, state.visible.year, quarterValue)) } });
	marker(quarter, options.hasMarker(quarterFocus));
	quarter.onclick = () => enterFocus(selectQuarter(state));
	for (const name of ['一', '二', '三', '四', '五', '六', '日']) weekdays.createSpan({ text: name });
	const grid = body.createDiv({ cls: 'mx-mini-calendar-grid' });
	for (const week of miniCalendarWeeks(state.visible.year, state.visible.month)) {
		const weekFocus: TimeFocus = { kind: 'week', isoYear: week.isoYear, isoWeek: week.isoWeek, anchorDate: week.anchorDate };
		const weekButton = grid.createEl('button', { cls: `mx-mini-calendar-week${focusMatchesWeek(state.focus, week.isoYear, week.isoWeek) ? ' is-selected' : ''}`, text: `W${String(week.isoWeek).padStart(2, '0')}`, attr: { type: 'button', 'aria-pressed': String(focusMatchesWeek(state.focus, week.isoYear, week.isoWeek)) } });
		marker(weekButton, options.hasMarker(weekFocus)); weekButton.onclick = () => enterFocus(selectWeek(state, week.days[0]!.date));
		for (const day of week.days) {
			const dayFocus: TimeFocus = { kind: 'day', date: day.key };
			const selected = focusMatchesDay(state.focus, day.key);
			const button = grid.createEl('button', { cls: `mx-mini-calendar-day${day.inMonth ? '' : ' is-out'}${day.key === todayKey ? ' is-today' : ''}${selected && day.key !== todayKey ? ' is-selected' : ''}`, text: String(day.date.getDate()), attr: { type: 'button', 'aria-label': day.key, 'aria-pressed': String(selected) } });
			marker(button, options.hasMarker(dayFocus)); button.onclick = () => enterFocus(selectDay(state, day.date));
		}
	}
	parent.toggleClass('is-calendar-collapsed', !!options.collapsed);
	return closePicker;
}
