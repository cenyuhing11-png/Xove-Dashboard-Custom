export const NARRATIVE_TITLES = ['为什么做', '希望达到的状态', '完成标准'] as const;
export type NarrativeTitle = typeof NARRATIVE_TITLES[number];

/** Locate raw section bytes, skipping YAML and fenced Markdown examples. */
function bounds(markdown: string, title: NarrativeTitle): { start: number; end: number } | undefined {
	let yaml = false, fence = '', start: number | undefined;
	for (const match of markdown.matchAll(/[^\n]*(?:\n|$)/g)) {
		const raw = match[0]; if (!raw) continue;
		const line = raw.replace(/\r?\n$/, ''); const offset = match.index!;
		if (offset === 0 && line.replace(/^\uFEFF/, '') === '---') { yaml = true; continue; }
		if (yaml) { if (/^(---|\.\.\.)\s*$/.test(line)) yaml = false; continue; }
		const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) { if (marker && marker[1]![0] === fence[0] && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = ''; continue; }
		if (marker) { fence = marker[1]!; continue; }
		const heading = /^ {0,3}(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
		if (!heading) continue;
		if (start !== undefined) return { start, end: offset };
		if (heading[1] === '##' && heading[2] === title) start = offset + raw.length;
	}
	return start === undefined ? undefined : { start, end: markdown.length };
}
export function narrativeMarkdown(markdown: string, title: NarrativeTitle): string {
	const range = bounds(markdown, title); return range ? markdown.slice(range.start, range.end).trim() : '';
}
export function updateNarrativeMarkdown(markdown: string, title: NarrativeTitle, value: string, expected?: string): string {
	if (!NARRATIVE_TITLES.includes(title)) throw new Error('不能修改未知叙事区域');
	const range = bounds(markdown, title);
	if (!range) throw new Error(`未找到「${title}」标题，请先检查原笔记`);
	if (expected !== undefined && narrativeMarkdown(markdown, title) !== expected) throw new Error('内容已在其他位置改变，请重新打开编辑');
	if (value.trim() === narrativeMarkdown(markdown, title)) return markdown;
	const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
	return markdown.slice(0, range.start) + eol + value.replace(/\r?\n/g, eol).trim() + eol + eol + markdown.slice(range.end);
}

/** UI-only state, retained across local redraws and reset for a different plan. */
export class NarrativeDisclosure {
	private planId = '';
	private expanded = new Set<NarrativeTitle>();
	selectPlan(id: string): void { if (this.planId !== id) { this.planId = id; this.expanded.clear(); } }
	isOpen(title: NarrativeTitle): boolean { return this.expanded.has(title); }
	toggle(title: NarrativeTitle): boolean { if (this.expanded.has(title)) this.expanded.delete(title); else this.expanded.add(title); return this.isOpen(title); }
}
