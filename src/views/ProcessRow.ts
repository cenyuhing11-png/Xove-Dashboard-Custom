export interface ProcessRowField { key: string; render(parent: HTMLElement): void }
export interface ProcessRowOptions {
	key: string; name: string; layout: 'table' | 'inline'; open(): void;
	fields: ProcessRowField[];
	nameExtra?(parent: HTMLElement): void;
}

/** Shared process-list row: table columns and compact embedded rows use the same
 * name, keyboard interaction, field order and source identity. */
export function renderProcessRow(parent: HTMLElement, options: ProcessRowOptions): HTMLElement {
	const table = options.layout === 'table';
	const row = parent.createEl(table ? 'tr' : 'div', { cls: `po-data-row mx-process-row${table ? '' : ' mx-process-row--inline'}` });
	row.dataset.projectPath = options.key;
	const cell = row.createEl(table ? 'td' : 'div', { cls: 'po-name-cell mx-process-row__name' });
	const name = cell.createEl('a', { cls: 'po-clickable mx-process-row__name-link', text: options.name, attr: { role: 'link', tabindex: '0' } });
	name.onclick = event => { event?.preventDefault(); event?.stopPropagation(); options.open(); };
	name.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); options.open(); } };
	options.nameExtra?.(cell);
	for (const field of options.fields) {
		const target = row.createEl(table ? 'td' : 'div', { cls: `mx-process-row__${field.key}` });
		field.render(target);
	}
	return row;
}
