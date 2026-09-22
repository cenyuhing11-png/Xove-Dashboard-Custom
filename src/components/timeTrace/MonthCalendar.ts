import { dateKey } from '../../data/planWorkspace';
import { miniCalendarWeeks } from '../../data/timeTrace';

export function renderMonthWeekdays(parent: HTMLElement): void {
 const weekdays = parent.createDiv({ cls: 'po-cal__weekdays mx-month-weekdays' });
 for (const name of ['一','二','三','四','五','六','日']) weekdays.createSpan({ text: name });
}

/** Shared content-only month shell; navigation belongs to the Mini Calendar. */
export function renderMonthCalendar(parent: HTMLElement, options: {
 year: number; month: number; selected?: string; today?: Date; journal?: boolean; hideWeekdays?: boolean;
 onSelect(date: Date): void; content(cell: HTMLElement, date: Date, key: string): void;
}): void {
 const root = parent.createDiv({ cls: 'mx-month-calendar' });
 if (!options.hideWeekdays) renderMonthWeekdays(root);
 const grid = root.createDiv({ cls: `po-cal__days mx-plan-calendar-days mx-month-days${options.journal ? ' mx-journal-overview-grid' : ''}` });
 const today = dateKey(options.today ?? new Date());
 for (const week of miniCalendarWeeks(options.year, options.month)) for (const day of week.days) {
  renderCalendarDay(grid, day.date, day.inMonth, { ...options, today });
 }
}


/** Shared date/content cell; week streams pass inMonth=true without month sections. */
export function renderCalendarDay(parent: HTMLElement, date: Date, inMonth: boolean, options: {
 selected?: string; today: string; journal?: boolean;
 onSelect(date: Date): void; content(cell: HTMLElement, date: Date, key: string): void;
}): void {
 const key = dateKey(date), today = options.today;
  const isToday = key === today, selected = options.selected === key;
  const cell = parent.createEl('button', { cls: `po-cal__day mx-month-day${options.journal ? ' mx-journal-overview-day' : ''}${inMonth ? '' : ' is-out'}${isToday ? ' is-today' : selected ? ' is-sel' : ''}`, attr: { type: 'button', 'data-date': key, 'aria-label': key, 'aria-pressed': String(selected), ...(isToday ? { 'aria-current': 'date' } : {}) } });
  const dateRow = cell.createDiv({ cls: 'mx-month-date-row' });
  dateRow.createSpan({ cls: `po-cal__day-num mx-month-date${options.journal ? ' mx-journal-overview-date' : ''}`, text: String(date.getDate()) });
  options.content(cell.createDiv({ cls: 'mx-month-cell-content' }), date, key);
  cell.onclick = () => options.onSelect(date);
}
