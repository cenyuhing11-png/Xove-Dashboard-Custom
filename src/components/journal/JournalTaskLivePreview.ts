import { StateField, type EditorState, type Extension, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { App, editorInfoField, editorLivePreviewField, TFile } from 'obsidian';
import type { EmbeddedTaskStore } from '../../data/embeddedTaskVault';
import { isCanonicalDailyJournalPath, journalTaskWidgetOffset } from '../../data/journal';
import { renderJournalTaskSummary } from './JournalTaskRenderer';

/** A stable dynamic view: task text remains exclusively in its source Markdown. */
class JournalTaskWidget extends WidgetType {
	private host?: HTMLElement;
	private unsubscribe?: () => void;

	constructor(private app: App, private store: EmbeddedTaskStore, private path: string) { super(); }

	eq(other: JournalTaskWidget): boolean { return this.path === other.path; }

	toDOM(view: EditorView): HTMLElement {
		this.host = view.dom.ownerDocument.createElement('div');
		this.host.className = 'mx-journal-task-summary mx-journal-task-summary--live';
		const render = () => { if (this.host) renderJournalTaskSummary(this.host, this.app, this.store, this.path); };
		this.unsubscribe = this.store.subscribe(render);
		void this.store.ready.then(render);
		render();
		return this.host;
	}

	ignoreEvent(): boolean { return true; }

	destroy(): void {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.host = undefined;
	}
}

interface JournalTaskEditorContext { path: string; offset: number }
interface JournalTaskEditorState { decorations: DecorationSet; path: string; offset: number }

function journalTaskEditorContext(state: EditorState): JournalTaskEditorContext | null {
	if (!state.field(editorLivePreviewField, false)) return null;
	const file = state.field(editorInfoField, false)?.file;
	if (!(file instanceof TFile) || !isCanonicalDailyJournalPath(file.path)) return null;
	const offset = journalTaskWidgetOffset(state.doc.toString());
	return offset === null ? null : { path: file.path, offset };
}

/** Official CM6 extension: Live Preview gets one mapped task widget; Source Mode gets none. */
export function journalTaskLivePreviewExtension(app: App, store: EmbeddedTaskStore): Extension {
	const empty = (): JournalTaskEditorState => ({ decorations: Decoration.none, path: '', offset: -1 });
	const create = (state: EditorState): JournalTaskEditorState => {
		const context = journalTaskEditorContext(state);
		if (!context) return empty();
		return {
			path: context.path,
			offset: context.offset,
			decorations: Decoration.set([Decoration.widget({ widget: new JournalTaskWidget(app, store, context.path), side: 1, block: true }).range(context.offset)]),
		};
	};
	return StateField.define<JournalTaskEditorState>({
		create,
		update(value: JournalTaskEditorState, transaction: Transaction): JournalTaskEditorState {
			const offset = value.offset >= 0 ? transaction.changes.mapPos(value.offset, 1) : -1;
			const decorations = value.decorations.map(transaction.changes);
			const context = journalTaskEditorContext(transaction.state);
			if (!context) return empty();
			if (context.path === value.path && context.offset === offset && decorations.size) return { path: value.path, offset, decorations };
			return create(transaction.state);
		},
		provide: field => EditorView.decorations.from(field, value => value.decorations),
	});
}
