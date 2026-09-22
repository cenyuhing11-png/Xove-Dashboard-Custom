import { journalTemplate } from './journal.ts';
import type { JournalKind } from './journal.ts';
import { markdownReviewSections } from './journalReview.ts';
import { yamlScalar } from './frontmatterWriter.ts';
import { appendQuickJournalContent, quickJournalEntry } from './quickJournal.ts';

export class JournalEditConflict extends Error { constructor() { super('内容已在外部修改，请重新加载；当前输入仍保留'); } }
interface Span { start: number; end: number; title: string }
/** Real headings only: retain source offsets, EOLs, fenced code, comments and YAML. */
function headings(text: string): Span[] {
	const result: Span[] = []; let yaml = /^\uFEFF?---(?:\r?\n|$)/.test(text), fence = '', comment = false;
	for (const m of text.matchAll(/[^\n]*(?:\n|$)/g)) {
		if (!m[0]) continue; const start = m.index!, line = m[0].replace(/\r?\n$/, '');
		if (yaml) { if (start > 0 && /^(---|\.\.\.)\s*$/.test(line)) yaml = false; continue; }
		if (comment) { if (line.includes('-->')) comment = false; continue; }
		if (fence) { if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = ''; continue; }
		if (line.includes('<!--')) { comment = !line.includes('-->'); continue; }
		const f = /^ {0,3}(`{3,}|~{3,})/.exec(line); if (f) { fence = f[1]!; continue; }
		const h = /^ {0,3}(#{1,2})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
		if (h) result.push({ start, end: start + m[0].length, title: h[1] === '##' ? h[2]!.trim() : '' });
	}
	return result;
}
function section(text: string, title: string): Span | undefined {
	const all = headings(text), matches = all.filter(h => h.title === title);
	if (matches.length > 1) throw new Error('存在同名段落，暂不自动写入，请打开原文整理');
	const h = matches[0]; if (!h) return;
	return { title, start: h.end, end: all[all.indexOf(h) + 1]?.start ?? text.length };
}
export function sectionSnapshot(text: string, title: string): string | null { const s = section(text, title); return s ? text.slice(s.start, s.end) : null; }
export function sectionValue(text: string, title: string): string { return (sectionSnapshot(text, title) ?? '').replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, ''); }
export function patchJournalSection(text: string, title: string, value: string, expected: string | null): string {
	if (sectionSnapshot(text, title) !== expected) throw new JournalEditConflict();
	let openFence = '', openComment = false;
	for (const line of value.split(/\r?\n/)) { if (openComment) { if (line.includes('-->')) openComment = false; continue; } if (openFence) { if (new RegExp(`^ {0,3}${openFence[0]}{${openFence.length},}\\s*$`).test(line)) openFence = ''; continue; } const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line); if (fence) openFence = fence[1]!; else if (line.includes('<!--') && !line.includes('-->')) openComment = true; }
	if (openFence || openComment) throw new Error('请先闭合代码块或注释，当前输入已保留');
	if (headings(value).length) throw new Error('正文内请使用三级及以下标题，避免改变日记段落结构');
	const eol = text.includes('\r\n') ? '\r\n' : '\n'; const body = value.replace(/\r\n?/g, '\n').replace(/\n/g, eol);
	const s = section(text, title);
	if (!s) return `${text}${text.endsWith(eol) ? eol : eol + eol}## ${title}${eol}${eol}${body}${eol}${eol}`;
	const old = text.slice(s.start, s.end); const leading = /^(?:[ \t]*\r?\n)+/.exec(old)?.[0] ?? '';
	const tail = old.slice(leading.length); const trailing = /(?:\r?\n[ \t]*)+$/.exec(tail)?.[0] ?? '';
	const replacement = `${leading || eol}${body}${trailing || eol + (s.end < text.length ? eol : '')}`;
	return text.slice(0, s.start) + replacement + text.slice(s.end);
}
function titleSpan(text: string): { start: number; end: number; insert: number; raw: string | null } {
	const fm = /^\uFEFF?---\r?\n([\s\S]*?)^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(text);
	if (!fm || fm.index !== 0) { if (/^\uFEFF?---/.test(text)) throw new Error('属性区未闭合，请打开原文检查'); return { start: 0, end: 0, insert: -1, raw: null }; }
	const offset = fm[0].indexOf('\n') + 1; const body = fm[1]!; const matches = [...body.matchAll(/^(?:标题|"标题"|'标题'):[^\r\n]*(?:\r?\n|$)/gm)];
	if (matches.length > 1) throw new Error('标题属性重复，请打开原文检查');
	const m = matches[0]; if (!m) return { start: 0, end: 0, insert: offset + body.length, raw: null };
	let end = m.index! + m[0].length;
	// YAML block/continued scalar lines belong to this field; following top-level keys/comments do not.
	const continuation = /^(?:(?:[ \t]+[^\r\n]*|)[\r]?\n)*/.exec(body.slice(end))?.[0] ?? '';
	end += continuation.length;
	return { start: offset + m.index!, end: offset + end, insert: offset + body.length, raw: body.slice(m.index, end) };
}
export function titleSnapshot(text: string): string | null { return titleSpan(text).raw; }
export function titleValue(text: string): string {
	const raw = titleSnapshot(text); if (!raw) return '';
	const value = raw.replace(/^[^:]+:[ \t]*/, '').trim();
	if (value.startsWith('"')) { try { return JSON.parse(value); } catch { throw new Error('标题格式暂不支持，请打开原文检查'); } }
	if (value.startsWith("'")) return value.replace(/^'|'$/g, '').replace(/''/g, "'");
	if (/^[|>]/.test(value)) return value.split(/\r?\n/).slice(1).map(l => l.trimStart()).join(value[0] === '>' ? ' ' : '\n').trimEnd();
	return /^(?:null|~)$/i.test(value) ? '' : value.replace(/[ \t]+#.*$/, '');
}
export function patchJournalTitle(text: string, value: string, expected: string | null): string {
	const s = titleSpan(text); if (s.raw !== expected) throw new JournalEditConflict();
	const eol = text.includes('\r\n') ? '\r\n' : '\n'; const encoded = /^(?:[+-]?(?:\d|\.\d)|true$|false$|null$|~$|yes$|no$|on$|off$)/i.test(value) ? JSON.stringify(value) : yamlScalar(value); const row = `标题: ${encoded}${eol}`;
	if (s.raw !== null) return text.slice(0, s.start) + row + text.slice(s.end);
	if (s.insert >= 0) return text.slice(0, s.insert) + row + text.slice(s.insert);
	const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
	return `${bom}---${eol}${row}---${eol}${eol}${text.slice(bom.length)}`;
}
export function editableJournalSections(kind: JournalKind): string[] { return markdownReviewSections(journalTemplate(kind)).map(s => s.title).filter(t => t !== '今日任务'); }
export type EditorField = { kind: 'section'; title: string } | { kind: 'title' } | { kind: 'quick' };
export function fieldSnapshot(text: string, field: EditorField): string | null { return field.kind === 'title' ? titleSnapshot(text) : sectionSnapshot(text, field.kind === 'quick' ? '随时记' : field.title); }
export function fieldValue(text: string, field: EditorField): string { return field.kind === 'title' ? titleValue(text) : field.kind === 'quick' ? '' : sectionValue(text, field.title); }
export interface InlineFiles { read(): Promise<string>; ensure(): Promise<void>; process(update: (latest: string) => string): Promise<void> }
/** One queue per open document, atomic Vault.process at the adapter boundary. */
export class JournalInlineDocument {
	private queue: Promise<unknown> = Promise.resolve();
	private quickEntry = '';
	finishQuickEntry() { this.quickEntry = ''; }
	private files: InlineFiles; private clock: () => Date;
	constructor(files: InlineFiles, clock = () => new Date()) { this.files = files; this.clock = clock; }
	read() { return this.files.read(); }
	save(field: EditorField, value: string, expected: string | null): Promise<string> {
		const job = this.queue.then(async () => {
			await this.files.ensure(); let saved = '', savedQuickEntry = '';
			await this.files.process(latest => {
				if (field.kind === 'quick') {
					const date = this.clock(), eol = latest.includes('\r\n') ? '\r\n' : '\n';
					const entry = quickJournalEntry(value, `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`)?.replace(/\n/g, eol) ?? '';
					if (this.quickEntry) {
						const block = sectionSnapshot(latest, '随时记'), needle = this.quickEntry;
						if (!block || block.split(needle).length !== 2 || !block.includes(eol + needle + eol)) throw new JournalEditConflict();
						const updated = block.replace(needle, entry), span = section(latest, '随时记')!;
						saved = latest.slice(0, span.start) + updated + latest.slice(span.end);
					} else saved = entry ? appendQuickJournalContent(latest, entry) : latest;
					savedQuickEntry = entry;
				}
				else {
					// A lazily ensured canonical template is equivalent to the missing empty field.
					const actual = fieldSnapshot(latest, field);
					const base = expected === null && fieldValue(latest, field) === '' ? actual : expected;
					saved = field.kind === 'title' ? patchJournalTitle(latest, value, base) : patchJournalSection(latest, field.title, value, base);
				}
				return saved;
			}); if (field.kind === 'quick') this.quickEntry = savedQuickEntry; return saved;
		}); this.queue = job.catch(() => {}); return job;
	}
}
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
/** Ephemeral draft only. Failed/conflicted input stays in memory until explicitly reloaded. */
export class JournalInlineDraft {
	value: string; state: SaveState = 'idle'; message = ''; composing = false; private expected: string | null; private revision = 0; private savedRevision = 0;
	private timer?: ReturnType<typeof setTimeout>; private running?: Promise<boolean>;
	private doc: JournalInlineDocument; readonly field: EditorField; private changed: () => void; private delay: number;
	constructor(doc: JournalInlineDocument, field: EditorField, source: string, changed: () => void = () => {}, delay = 500) { this.doc = doc; this.field = field; this.changed = changed; this.delay = delay; this.expected = fieldSnapshot(source, field); this.value = fieldValue(source, field); }
	get dirty() { return this.revision !== this.savedRevision; }
	input(value: string) { this.value = value; this.revision++; if (this.state !== 'conflict') { this.state = 'pending'; this.schedule(); } this.changed(); }
	private schedule() { if (this.timer) clearTimeout(this.timer); if (!this.composing) this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.delay); }
	composition(active: boolean) { this.composing = active; if (active && this.timer) clearTimeout(this.timer); else if (!active && this.dirty) this.schedule(); }
	async reload() { const text = await this.doc.read(); this.expected = fieldSnapshot(text, this.field); if (this.field.kind === 'quick') this.doc.finishQuickEntry(); this.value = fieldValue(text, this.field); this.savedRevision = this.revision; this.state = 'idle'; this.message = ''; this.changed(); }
	async refresh() {
		if (this.dirty || this.running || this.composing || (this.field.kind === 'quick' && this.value)) return;
		const revision = this.revision; const text = await this.doc.read();
		if (revision !== this.revision || this.dirty || this.running || this.composing) return;
		this.expected = fieldSnapshot(text, this.field); this.value = fieldValue(text, this.field); this.changed();
	}
	flush(finalize = false): Promise<boolean> {
		if (finalize) return this.flush().then(ok => { if (ok && !this.dirty && this.field.kind === 'quick') { this.doc.finishQuickEntry(); this.value = ''; this.changed(); } return ok; });
		if (this.timer) clearTimeout(this.timer); this.timer = undefined;
		if (this.running) return this.running;
		if (this.composing || this.state === 'conflict') return Promise.resolve(!this.dirty);
		this.running = (async () => {
			while (this.dirty) {
				const revision = this.revision, value = this.value; this.state = 'saving'; this.changed();
				try { const text = await this.doc.save(this.field, value, this.expected); this.expected = fieldSnapshot(text, this.field); this.savedRevision = revision; this.state = 'saved'; this.message = ''; this.changed(); }
				catch (error) { this.state = error instanceof JournalEditConflict ? 'conflict' : 'error'; this.message = error instanceof Error ? error.message : '保存失败'; this.changed(); return false; }
			} return true;
		})(); return this.running.finally(() => { this.running = undefined; });
	}
	destroy() { return this.flush(true); }
}
