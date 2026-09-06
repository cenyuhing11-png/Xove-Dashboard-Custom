import { LIFE_COMPASS } from './config';

export function renderLifeCompass(parent: HTMLElement): void {
	const compass = parent.createEl('section', { cls: 'wb-compass' });
	const title = compass.createEl('h2', { cls: 'wb-compass__title' });
	title.createSpan({ cls: 'wb-compass__icon', text: '🧭', attr: { 'aria-hidden': 'true' } });
	title.createSpan({ text: '人生罗盘' });
	const lanes = compass.createDiv({ cls: 'wb-compass__lanes' });
	for (const lane of LIFE_COMPASS) {
		const row = lanes.createDiv({ cls: `wb-compass__lane wb-compass__lane--${lane.id}` });
		row.createSpan({ cls: 'wb-compass__label', text: lane.label });
		const items = row.createDiv({ cls: 'wb-compass__items' });
		for (const item of lane.items) items.createSpan({ cls: 'wb-compass__item', text: item });
	}
}
