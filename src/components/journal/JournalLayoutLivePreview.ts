import { StateField, type EditorState, type Extension, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField, TFile } from 'obsidian';
import { isCanonicalDailyJournalPath } from '../../data/journal';

const SECTION_TITLES = ['今日任务', '随时记', '今日日记', '今日回看'] as const;
type SectionTitle = typeof SECTION_TITLES[number];

class JournalSectionDivider extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		const divider = view.dom.ownerDocument.createElement('div');
		divider.className = 'mx-time-trace-divider mx-journal-section-divider';
		divider.setAttribute('aria-hidden', 'true');
		return divider;
	}

	ignoreEvent(): boolean { return true; }
}

function liveJournalPath(state: EditorState): string | null {
	if (!state.field(editorLivePreviewField, false)) return null;
	const file = state.field(editorInfoField, false)?.file;
	return file instanceof TFile && isCanonicalDailyJournalPath(file.path) ? file.path : null;
}

function journalLayoutDecorations(state: EditorState): DecorationSet {
	if (!liveJournalPath(state)) return Decoration.none;
	const decorations: Array<{ from: number; to?: number; value: Decoration }> = [];
	let yaml = false;
	let fence = '';
	let active: SectionTitle | null = null;
	for (let number = 1; number <= state.doc.lines; number += 1) {
		const line = state.doc.line(number);
		const text = line.text;
		if (number === 1 && text.trim() === '---') { yaml = true; continue; }
		if (yaml) { if (text.trim() === '---') yaml = false; continue; }
		const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(text);
		if (fenceMatch) {
			const token = fenceMatch[1] ?? '';
			if (!fence) fence = token[0] ?? '';
			else if (token[0] === fence) fence = '';
			continue;
		}
		if (fence) continue;
		const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(text);
		if (heading) {
			const level = heading[1]?.length ?? 6;
			const title = heading[2]?.trim() ?? '';
			active = level === 2 && SECTION_TITLES.includes(title as SectionTitle) ? title as SectionTitle : null;
			if (!active) continue;
			decorations.push({ from: line.from, value: Decoration.line({ attributes: { class: 'mx-journal-section-title mx-journal-content-line', 'data-mx-journal-section': active } }) });
			if (SECTION_TITLES.indexOf(active) > 0) decorations.push({ from: line.from, value: Decoration.widget({ widget: new JournalSectionDivider(), side: -1, block: true }) });
			continue;
		}
		if (!active) continue;
		decorations.push({ from: line.from, value: Decoration.line({ attributes: { class: 'mx-journal-section-content-line mx-journal-content-line' } }) });
		if (active !== '随时记') continue;
		const time = /^\s*-\s+(\d{2}:\d{2})(?=\s)/.exec(text);
		if (!time || time.index === undefined) continue;
		const start = line.from + time.index + time[0].lastIndexOf(time[1] ?? '');
		decorations.push({ from: start, to: start + (time[1]?.length ?? 0), value: Decoration.mark({ class: 'wb-entry__detail mx-journal-quick-time' }) });
		decorations.push({ from: line.from, value: Decoration.line({ attributes: { class: 'mx-journal-quick-entry' } }) });
	}
	return Decoration.set(decorations.map(item => item.value.range(item.from, item.to)), true);
}

/** Visual-only journal layout. Source Mode receives no decorations or widgets. */
export function journalLayoutLivePreviewExtension(): Extension {
	return StateField.define<DecorationSet>({
		create: journalLayoutDecorations,
		update(value: DecorationSet, transaction: Transaction): DecorationSet {
			if (!transaction.docChanged && !transaction.reconfigured) return value.map(transaction.changes);
			return journalLayoutDecorations(transaction.state);
		},
		provide: field => EditorView.decorations.from(field),
	});
}
