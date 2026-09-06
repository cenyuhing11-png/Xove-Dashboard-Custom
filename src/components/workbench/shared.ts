export function createSection(parent: HTMLElement, title: string, compact = false): HTMLElement {
	const section = parent.createEl('section', { cls: `wb-section${compact ? ' wb-section--compact' : ''}` });
	section.createEl('h2', { cls: 'wb-section__title', text: title });
	return section.createDiv({ cls: 'wb-section__body' });
}

export function createGroup(parent: HTMLElement, label: string): HTMLElement {
	const group = parent.createDiv({ cls: 'wb-group' });
	group.createDiv({ cls: 'wb-group__label', text: label });
	return group.createDiv({ cls: 'wb-group__content' });
}

export function addEmpty(parent: HTMLElement, text: string): void {
	parent.createDiv({ cls: 'wb-empty', text });
}

export function addEntry(parent: HTMLElement, label: string, detail?: string, onClick?: () => void): HTMLElement {
	const el = onClick
		? parent.createEl('button', { cls: 'wb-entry wb-entry--button' })
		: parent.createDiv({ cls: 'wb-entry' });
	el.createSpan({ cls: 'wb-entry__label', text: label });
	if (detail) el.createSpan({ cls: 'wb-entry__detail', text: detail });
	if (onClick) {
		el.createSpan({ cls: 'wb-entry__arrow', text: '→' });
		el.addEventListener('click', onClick);
	}
	return el;
}
