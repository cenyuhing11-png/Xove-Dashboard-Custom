import type { ProcessStatus, ProcessType } from './processes';
import type { ProcessCategory } from './processContentTypes';
import type { CompatibleProcessContentType } from './processContentTypes';
import type { EmbeddedTask } from './embeddedTasks';
import { EMBEDDED_HEADINGS, validTaskDate } from './embeddedTasks.ts';

export interface ProcessFilters { direction: string | null; type: ProcessCategory | 'all'; status: ProcessStatus | '全部' }
export function matchesProcessFilters(item: { direction: string; category: ProcessCategory; status: ProcessStatus }, filters: ProcessFilters): boolean {
	return (!filters.direction || item.direction === filters.direction) && (filters.type === 'all' || item.category === filters.type) && (filters.status === '全部' || item.status === filters.status);
}
/** Facet counts are whole-process counts, independent of the currently selected filters. */
export function directionProcessCounts(items: readonly { direction: string; category: ProcessCategory }[], direction: string) {
	const related = items.filter(item => item.direction === direction);
	const learning = related.filter(item => item.category === 'learning').length;
	const creation = related.filter(item => item.category === 'creation').length;
	return { learning, creation, label: `学${learning} · 创${creation}` };
}
/** Floating Markdown date: never turn it into a UTC instant for display. */
export function compactProcessDate(value: string | null | undefined, now = new Date()): string {
	if (!value || !validTaskDate(value)) return '—';
	return Number(value.slice(0, 4)) === now.getFullYear() ? value.slice(5).replace('-', '.') : value.replaceAll('-', '.');
}
export function processDateTitle(value: string | null | undefined): string {
	if (!value || !validTaskDate(value)) return '';
	const [year, month, day] = value.split('-').map(Number);
	return `${year}年${month}月${day}日`;
}
export interface ProcessTaskSource { name: string; processType: ProcessType; sourceFile: string; category?: ProcessCategory; contentType?: CompatibleProcessContentType }
export function processPreviewTasks(tasks: readonly EmbeddedTask[], source: ProcessTaskSource) {
	const related = tasks.filter(t => t.sourceFile === source.sourceFile && t.sourceType === source.processType && t.sourceHeading === EMBEDDED_HEADINGS[source.processType]);
	return { pending: related.filter(t => !t.completed), completed: related.filter(t => t.completed), total: related.length };
}
