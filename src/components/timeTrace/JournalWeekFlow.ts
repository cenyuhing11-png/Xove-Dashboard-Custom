import { renderCalendarDay } from './MonthCalendar';
import { dateKey } from '../../data/planWorkspace';

export type VisibleMonth = { year: number; month: number };
export const monthIndex = (m: VisibleMonth): number => m.year * 12 + m.month - 1;
// UTC day numbers represent calendar dates; rendered Dates are local noon (DST safe).
export const dayNumber = (key: string): number => Math.floor(Date.parse(`${key}T12:00:00Z`) / 86400000);
export function dayDate(day: number): Date { const d = new Date(day * 86400000); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12); }
export function monday(day: number): number { return day - (new Date(day * 86400000).getUTCDay() + 6) % 7; }
export function weekMonth(week: number): VisibleMonth { const d = dayDate(week + 3); return {year:d.getFullYear(),month:d.getMonth()+1}; }

export function finiteWeekWindow(month: VisibleMonth): [number,number] {
 const start = Math.floor(Date.UTC(month.year,month.month-3,1)/86400000);
 const end = Math.floor(Date.UTC(month.year,month.month+3,0)/86400000);
 return [monday(start),monday(end)];
}

/** DOM-only unique-date week stream: scrolling never reads the Vault or changes selected focus. */
export class JournalWeekFlow {
 private sections = new Map<number, HTMLElement>();
 private summaries = new Map<string, string>();
 private scrollRoot: HTMLElement;
 private frame = 0;
 private initialFrame = 0;
 private disposed = false;
 private resizeObserver?: ResizeObserver;
 private active: number;
 private jumpAnchor?: {week:number;month:VisibleMonth};
 private list: HTMLElement;
 private center = -1;
 private collapsed = false;
 private savedTop = 0;
 private pendingJump?: {month:VisibleMonth;selected?:string};
 private scrollHandler = () => { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.measure(); }); };
 private resizeHandler = () => { const next = this.findScrollRoot(); if (next !== this.scrollRoot) { this.scrollRoot.removeEventListener('scroll', this.scrollHandler); this.scrollRoot = next; next.addEventListener('scroll', this.scrollHandler, { passive: true }); } this.syncGutter(); this.scrollHandler(); };
 constructor(private host: HTMLElement, private options: { visible: VisibleMonth; selected?: string; weekday?: HTMLElement; onVisible(month: VisibleMonth): void; onSelect(date: Date): void; }, summaries: Map<string, string>) {
  this.active = monthIndex(options.visible); this.summaries = summaries; this.scrollRoot = this.findScrollRoot();
  this.list = host.createDiv({cls:'mx-journal-week-list mx-month-calendar'});
  this.resetRange(options.visible);
  this.scrollRoot.addEventListener('scroll', this.scrollHandler, { passive: true });
  window.addEventListener('resize', this.resizeHandler);
  if (typeof ResizeObserver !== 'undefined') { this.resizeObserver = new ResizeObserver(() => this.syncGutter()); this.resizeObserver.observe(this.scrollRoot); }
  this.syncGutter();
  this.initialFrame = requestAnimationFrame(() => { this.initialFrame = 0; if (!this.disposed) this.jump(options.visible); });
 }
 private findScrollRoot(): HTMLElement {
  for (let el = this.host.parentElement; el; el = el.parentElement) if (/auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
  return document.scrollingElement as HTMLElement;
 }
 private syncGutter(): void { if (this.options.weekday) this.options.weekday.style.paddingRight = `${this.scrollRoot.contains(this.options.weekday) ? 0 : this.scrollRoot.offsetWidth - this.scrollRoot.clientWidth}px`; }
 private top(): number { const top = this.scrollRoot === document.scrollingElement ? 0 : this.scrollRoot.getBoundingClientRect().top; return Math.max(top, this.options.weekday && !this.scrollRoot.contains(this.options.weekday) ? this.options.weekday.getBoundingClientRect().bottom : top); }
 private insert(index: number): void {
  if (this.sections.has(index)) return;
  const section = this.list.createDiv({ cls: 'mx-journal-week-row mx-month-days', attr: { 'data-week': dateKey(dayDate(index)) } });
  const today = dateKey(new Date());
  for (let n=0;n<7;n++) renderCalendarDay(section, dayDate(index+n), true, { journal: true, today, selected: this.options.selected, onSelect: this.options.onSelect,
   content: (cell, _date, key) => { const text = this.summaries.get(key); if (text) cell.createSpan({ cls: 'mx-journal-overview-summary', text }); },
  });
  const next = [...this.sections.keys()].sort((a,b) => a-b).find(n => n > index);
  if (next !== undefined) this.list.insertBefore(section, this.sections.get(next)!);
  this.sections.set(index, section);
 }
 private bounds(): number[] { return [...this.sections.keys()].sort((a,b) => a-b); }
 private targetWeek(month: VisibleMonth, selected?: string): number {
  const prefix = `${month.year}-${String(month.month).padStart(2,'0')}`;
  return monday(dayNumber(selected?.startsWith(prefix+'-') ? selected : prefix+'-01'));
 }
 private resetRange(month: VisibleMonth): void {
  this.center = monthIndex(month); this.list.empty(); this.sections.clear();
  const [first,last] = finiteWeekWindow(month);
  for(let week=first;week<=last;week+=7) this.insert(week);
 }
 setCollapsed(value: boolean): void {
  if (value === this.collapsed) return;
  if (value) { this.savedTop=this.scrollRoot.scrollTop; this.collapsed=true; return; }
  this.collapsed=false;
  const nextRoot=this.findScrollRoot();
  if(nextRoot!==this.scrollRoot){this.scrollRoot.removeEventListener('scroll',this.scrollHandler);this.scrollRoot=nextRoot;nextRoot.addEventListener('scroll',this.scrollHandler,{passive:true});}
  cancelAnimationFrame(this.frame); this.frame=0;
  cancelAnimationFrame(this.initialFrame);
  this.initialFrame=requestAnimationFrame(()=>{this.initialFrame=0;if(this.disposed||this.collapsed)return;
   this.syncGutter();
   if(this.pendingJump){const next=this.pendingJump;this.pendingJump=undefined;this.jump(next.month,next.selected);}
   else this.scrollRoot.scrollTop=this.savedTop;
  });
 }
 jump(month: VisibleMonth, selected = this.options.selected): void {
  const index = this.targetWeek(month, selected);
  this.options.selected = selected;
  // Only explicit navigation rebuilds the finite six-month window.
  if (this.center !== monthIndex(month)) this.resetRange(month);
  for(const cell of Array.from(this.list.querySelectorAll<HTMLElement>('.mx-month-day'))) {
   const match = cell.dataset.date === selected;
   cell.classList.toggle('is-sel', match && !cell.classList.contains('is-today'));
   cell.setAttribute('aria-pressed',String(match));
  }
  this.jumpAnchor = {week:index,month};
  if (this.collapsed) { this.pendingJump={month,selected}; this.publish(month); return; }
  this.scrollRoot.scrollTop += this.sections.get(index)!.getBoundingClientRect().top - this.top();
  this.publish(month);
 }
 private publish(month: VisibleMonth): void { const index=monthIndex(month); if (index !== this.active) { this.active = index; this.options.onVisible(month); } }
 measure(): void {
  if (this.disposed || this.collapsed || !this.host.isConnected) return;
  const anchor = this.top() + 24, keys = this.bounds();
  // Actual section bounds, with a small top anchor, avoid fixed-height assumptions.
  const current = keys.find(n => this.sections.get(n)!.getBoundingClientRect().bottom > anchor) ?? keys[keys.length-1]!;
  if (this.jumpAnchor?.week !== current) this.jumpAnchor = undefined;
  this.publish(this.jumpAnchor?.month ?? weekMonth(current));

 }
 update(summaries: Map<string, string>): void {
  const prior = this.summaries; this.summaries = summaries;
  for (const section of this.sections.values()) for (const cell of Array.from(section.querySelectorAll<HTMLElement>('.mx-month-day'))) {
   const content = cell.querySelector<HTMLElement>('.mx-month-cell-content')!, text = summaries.get(cell.dataset.date!);
   if (prior.get(cell.dataset.date!) === text) continue;
   const previous = content.querySelector<HTMLElement>('.mx-journal-overview-summary');
   if (text) { if (previous) previous.textContent = text; else content.createSpan({cls:'mx-journal-overview-summary',text}); } else previous?.remove();
  }
 }
 destroy(): void { this.disposed = true; this.resizeObserver?.disconnect(); cancelAnimationFrame(this.frame); cancelAnimationFrame(this.initialFrame); this.scrollRoot.removeEventListener('scroll',this.scrollHandler); window.removeEventListener('resize',this.resizeHandler); }
}
