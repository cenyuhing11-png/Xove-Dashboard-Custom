import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateField, type EditorState, type Extension, type Transaction } from '@codemirror/state';
import { App, editorInfoField, editorLivePreviewField, Notice, TFile } from 'obsidian';
import {
	isCanonicalDailyJournalPath,
	journalTitleWidgetOffset,
	readJournalTitle,
	writeJournalTitle,
} from '../../data/journal';

const SAVE_DELAY_MS = 400;

/** One persistent native input; CodeMirror keeps this DOM while document changes are mapped. */
class JournalTitleWidget extends WidgetType {
	private inputEl?: HTMLInputElement;
	private savedTitle: string;
	private draftTitle: string;
	private composing = false;
	private saving = false;
	private saveAgain = false;
	private saveTimer?: number;

	constructor(private app: App, private path: string, title: string) {
		super();
		this.savedTitle = title;
		this.draftTitle = title;
	}

	eq(other: JournalTitleWidget): boolean {
		return this.path === other.path;
	}

	toDOM(view: EditorView): HTMLElement {
		const document = view.dom.ownerDocument;
		const host = document.createElement('div');
		host.className = 'mx-journal-title-editor mx-journal-title-editor--live';
		const field = host.createDiv({ cls: 'mx-journal-title-field' });
		const inputId = `mx-journal-live-title-${this.path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
		field.createEl('label', { cls: 'ad-modal-label', text: '标题', attr: { for: inputId } });
		const input = field.createEl('input', {
			cls: 'ad-modal-input',
			attr: {
				id: inputId,
				type: 'text',
				value: this.savedTitle,
				placeholder: '输入今天这篇日记的标题',
				'aria-label': '今日日记标题',
				autocomplete: 'off',
			},
		});
		this.inputEl = input;
		input.addEventListener('compositionstart', () => {
			this.composing = true;
			this.clearSaveTimer();
		});
		input.addEventListener('compositionend', () => {
			this.composing = false;
			this.draftTitle = input.value;
			this.scheduleSave();
		});
		input.addEventListener('input', () => {
			this.draftTitle = input.value;
			if (!this.composing) this.scheduleSave();
		});
		input.addEventListener('blur', () => {
			if (!this.composing) void this.persist();
		});
		input.addEventListener('keydown', event => {
			if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
			if (event.key === 'Escape') {
				this.clearSaveTimer();
				this.draftTitle = this.savedTitle;
				input.value = this.savedTitle;
				input.blur();
			}
		});
		return host;
	}

	ignoreEvent(): boolean { return true; }

	destroy(): void {
		this.clearSaveTimer();
		if (!this.composing && this.draftTitle.trim() !== this.savedTitle) void this.persist();
		this.inputEl = undefined;
	}

	private clearSaveTimer(): void {
		if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
		this.saveTimer = undefined;
	}

	private scheduleSave(): void {
		this.clearSaveTimer();
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = undefined;
			void this.persist();
		}, SAVE_DELAY_MS);
	}

	private async persist(): Promise<void> {
		this.clearSaveTimer();
		if (this.composing) return;
		if (this.saving) { this.saveAgain = true; return; }
		const title = this.draftTitle.trim();
		if (title === this.savedTitle) {
			if (this.inputEl && document.activeElement !== this.inputEl) this.inputEl.value = title;
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(this.path);
		if (!(file instanceof TFile)) { new Notice('日记文件不存在'); return; }
		this.saving = true;
		try {
			await writeJournalTitle(this.app, file, title);
			this.savedTitle = title;
			if (this.inputEl && document.activeElement !== this.inputEl) this.inputEl.value = title;
		} catch (error) {
			this.draftTitle = this.savedTitle;
			if (this.inputEl) this.inputEl.value = this.savedTitle;
			new Notice(`日记标题更新失败：${String(error)}`);
		} finally {
			this.saving = false;
			if (this.saveAgain || this.draftTitle.trim() !== this.savedTitle) {
				this.saveAgain = false;
				void this.persist();
			}
		}
	}
}

interface JournalEditorContext { path: string; offset: number; title: string }
interface JournalTitleEditorState { decorations: DecorationSet; path: string; offset: number }

function journalEditorContext(state: EditorState, app: App): JournalEditorContext | null {
	if (!state.field(editorLivePreviewField, false)) return null;
	const info = state.field(editorInfoField, false);
	const file = info?.file;
	if (!(file instanceof TFile) || !isCanonicalDailyJournalPath(file.path)) return null;
	const offset = journalTitleWidgetOffset(state.doc.toString());
	return offset === null ? null : { path: file.path, offset, title: readJournalTitle(app, file) };
}

/** Official CM6 extension: Live Preview gets one widget; Source Mode gets none. */
export function journalTitleLivePreviewExtension(app: App): Extension {
	const empty = (): JournalTitleEditorState => ({ decorations: Decoration.none, path: '', offset: -1 });
	const create = (state: EditorState): JournalTitleEditorState => {
		const context = journalEditorContext(state, app);
		if (!context) return empty();
		const widget = new JournalTitleWidget(app, context.path, context.title);
		return {
			path: context.path,
			offset: context.offset,
			decorations: Decoration.set([Decoration.widget({ widget, side: 1, block: true }).range(context.offset)]),
		};
	};
	return StateField.define<JournalTitleEditorState>({
		create,
		update(value: JournalTitleEditorState, transaction: Transaction): JournalTitleEditorState {
			const offset = value.offset >= 0 ? transaction.changes.mapPos(value.offset, 1) : -1;
			const decorations = value.decorations.map(transaction.changes);
			const context = journalEditorContext(transaction.state, app);
			if (!context) return empty();
			if (context.path === value.path && context.offset === offset && decorations.size) {
				return { path: value.path, offset, decorations };
			}
			return create(transaction.state);
		},
		provide: field => EditorView.decorations.from(field, value => value.decorations),
	});
}
