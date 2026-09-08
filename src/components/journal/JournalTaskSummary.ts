import { App, MarkdownPostProcessorContext, MarkdownRenderChild, Notice, TFile } from 'obsidian';
import type { EmbeddedTaskStore } from '../../data/embeddedTaskVault';
import { journalDateFromPath, readJournalTitle, writeJournalTitle } from '../../data/journal';
import { renderJournalTaskSummary } from './JournalTaskRenderer';

const JOURNAL_SECTION_TITLES = ['今日任务', '随时记', '今日日记', '今日回看'] as const;

function decorateQuickJournalList(list: Element): void {
	list.addClass('mx-journal-quick-list');
	for (const item of Array.from(list.querySelectorAll(':scope > li'))) {
		item.addClass('mx-journal-quick-entry');
		const walker = item.ownerDocument.createTreeWalker(item, NodeFilter.SHOW_TEXT);
		let textNode: Node | null = null;
		let match: RegExpExecArray | null = null;
		while ((textNode = walker.nextNode())) {
			match = /^(\s*)(\d{2}:\d{2})(?=\s)/.exec(textNode.textContent ?? '');
			if (match) break;
		}
		if (!textNode || !match) continue;
		const value = textNode.textContent ?? '';
		const fragment = item.ownerDocument.createDocumentFragment();
		if (match[1]) fragment.append(item.ownerDocument.createTextNode(match[1]));
		const time = item.ownerDocument.createElement('span');
		time.className = 'wb-entry__detail mx-journal-quick-time';
		time.textContent = match[2] ?? '';
		fragment.append(time, item.ownerDocument.createTextNode(value.slice(match[0].length)));
		textNode.parentNode?.replaceChild(fragment, textNode);
	}
}

/** Reading View only: apply the same continuous-section rhythm used by Live Preview. */
function decorateJournalReadingLayout(el: HTMLElement): void {
	for (const heading of Array.from(el.querySelectorAll('h2'))) {
		const title = heading.textContent?.trim();
		const index = JOURNAL_SECTION_TITLES.indexOf(title as typeof JOURNAL_SECTION_TITLES[number]);
		if (index < 0) continue;
		heading.addClass('mx-journal-section-title');
		heading.dataset.mxJournalSection = title;
		if (index > 0 && !heading.previousElementSibling?.classList.contains('mx-journal-section-divider')) {
			const divider = heading.ownerDocument.createElement('div');
			divider.className = 'mx-time-trace-divider mx-journal-section-divider';
			divider.setAttribute('aria-hidden', 'true');
			heading.insertAdjacentElement('beforebegin', divider);
		}
		for (let node = heading.nextElementSibling; node && node.tagName !== 'H2'; node = node.nextElementSibling) {
			node.addClass('mx-journal-section-content');
			if (title === '随时记' && (node.tagName === 'UL' || node.tagName === 'OL')) decorateQuickJournalList(node);
		}
	}
}

/** Reading View augmentation only: the journal Markdown remains a clean anchor. */
class JournalTaskSummary extends MarkdownRenderChild {
	constructor(
		private app: App,
		private store: EmbeddedTaskStore,
		private path: string,
		host: HTMLElement,
	) { super(host); }

	onload(): void {
		this.register(this.store.subscribe(() => this.render()));
		void this.store.ready.then(() => this.render());
		this.render();
	}

	private render(): void {
		if (!this.containerEl.isConnected) return;
		renderJournalTaskSummary(this.containerEl, this.app, this.store, this.path);
	}
}

/** Reading View enhancement anchored inside `## 今日日记`; the title persists only in frontmatter. */
class JournalTitleEditor extends MarkdownRenderChild {
	private inputEl?: HTMLInputElement;
	private currentTitle = '';
	private saving = false;

	constructor(private app: App, private path: string, host: HTMLElement) { super(host); }

	onload(): void {
		this.currentTitle = this.readTitle();
		this.render();
		this.registerEvent(this.app.metadataCache.on('changed', file => {
			if (file.path !== this.path || this.saving || document.activeElement === this.inputEl) return;
			this.currentTitle = this.readTitle();
			if (this.inputEl) this.inputEl.value = this.currentTitle;
		}));
	}

	private readTitle(): string {
		const file = this.app.vault.getAbstractFileByPath(this.path);
		return file instanceof TFile ? readJournalTitle(this.app, file) : '';
	}

	private render(): void {
		this.containerEl.empty();
		const field = this.containerEl.createDiv({ cls: 'mx-journal-title-field' });
		field.createEl('label', { cls: 'ad-modal-label', text: '标题', attr: { for: `mx-journal-title-${this.path}` } });
		const input = field.createEl('input', {
			cls: 'ad-modal-input',
			attr: {
				id: `mx-journal-title-${this.path}`,
				type: 'text',
				value: this.currentTitle,
				placeholder: '输入今天这篇日记的标题',
				'aria-label': '今日日记标题',
				autocomplete: 'off',
			},
		});
		this.inputEl = input;
		input.addEventListener('keydown', event => {
			if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
			if (event.key === 'Escape') { input.value = this.currentTitle; input.blur(); }
		});
		input.addEventListener('change', () => { void this.save(input.value); });
	}

	private async save(rawTitle: string): Promise<void> {
		if (this.saving) return;
		const file = this.app.vault.getAbstractFileByPath(this.path);
		if (!(file instanceof TFile)) { new Notice('日记文件不存在'); return; }
		const title = rawTitle.trim();
		if (title === this.currentTitle) { if (this.inputEl) this.inputEl.value = title; return; }
		this.saving = true;
		if (this.inputEl) this.inputEl.disabled = true;
		try {
			await writeJournalTitle(this.app, file, title);
			this.currentTitle = title;
			if (this.inputEl) this.inputEl.value = title;
		} catch (error) {
			if (this.inputEl) this.inputEl.value = this.currentTitle;
			new Notice(`日记标题更新失败：${String(error)}`);
		} finally {
			this.saving = false;
			if (this.inputEl) this.inputEl.disabled = false;
		}
	}
}

export function mountJournalTaskSummary(
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	app: App,
	store: EmbeddedTaskStore,
): void {
	if (!journalDateFromPath(ctx.sourcePath)) return;
	for (const heading of Array.from(el.querySelectorAll('h2'))) {
		const title = heading.textContent?.trim();
		if (title === '今日任务') {
			if (heading.nextElementSibling?.classList.contains('mx-journal-task-summary')) continue;
			const host = heading.ownerDocument.createElement('div');
			host.className = 'mx-journal-task-summary';
			heading.insertAdjacentElement('afterend', host);
			ctx.addChild(new JournalTaskSummary(app, store, ctx.sourcePath, host));
		} else if (title === '今日日记') {
			if (heading.nextElementSibling?.classList.contains('mx-journal-title-editor')) continue;
			const host = heading.ownerDocument.createElement('div');
			host.className = 'mx-journal-title-editor';
			heading.insertAdjacentElement('afterend', host);
			ctx.addChild(new JournalTitleEditor(app, ctx.sourcePath, host));
		}
	}
	decorateJournalReadingLayout(el);
}
