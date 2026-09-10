import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync(new URL('../views/PlanView.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

test('review replaces the placeholder with the shared focus adapter and an async reader', () => {
	assert.match(view, /else await this\.renderReview\(main, token\)/);
	assert.match(view, /journalReviewTarget\(this\.timeState\.focus\)/);
	assert.doesNotMatch(view, /已选择：\$\{focusLabel\(this\.timeState\.focus\)\}/);
});

test('day review renders only the three settled reading sections and no task widget', () => {
	assert.match(view, /dayOnly \? dayReviewSections\(markdown\) : markdownReviewSections\(markdown\)/);
	const adapter = readFileSync(new URL('./journalReview.ts', import.meta.url), 'utf8');
	assert.match(adapter, /\['随时记', '今日日记', '今日回看'\]/);
	assert.doesNotMatch(adapter.match(/dayReviewSections[\s\S]*?\n}/)?.[0] ?? '', /今日任务/);
});

test('week month and year expose review and plan comparison modes', () => {
	assert.match(view, /\[\['review', '复盘'\], \['compare', '计划 ↔ 复盘'\]\]/);
	assert.match(view, /target\.kind !== 'day'/);
	assert.match(view, /mx-journal-review-pane is-plan/);
	assert.match(view, /mx-journal-review-pane is-review/);
});

test('record header uses the frontmatter title only when a daily title exists', () => {
	assert.match(view, /target\.kind === 'day' && reviewFile \? readJournalTitle/);
	assert.match(view, /if \(dayTitle\) record\.createDiv/);
	assert.doesNotMatch(view, /未命名日记/);
});

test('single-record reading does not repeat the document label below its record header', () => {
	assert.match(view, /target\.kind === 'day', false\)/);
	assert.match(view, /if \(showHeader\)/);
});

test('review is read-only and opens exact source files in normal Obsidian tabs', () => {
	const review = view.match(/private existingFile[\s\S]*?(?=\n\tprivate async renderLongTermPlans)/)?.[0] ?? '';
	assert.match(review, /getAbstractFileByPath/);
	assert.match(review, /cachedRead/);
	assert.match(review, /getLeaf\('tab'\)\.openFile/);
	assert.doesNotMatch(review, /vault\.(?:create|modify|process|rename|delete)/);
});

test('review mode is restored with existing PlanWorkspace renderer state', () => {
	assert.match(view, /reviewMode: this\.reviewMode/);
	assert.match(view, /state\.reviewMode === 'review' \|\| state\.reviewMode === 'compare'/);
});

test('journal and plan source changes refresh only the mounted review content', () => {
	assert.match(view, /this\.mode === 'calendar' \|\| this\.mode === 'review'/);
	assert.match(view, /file\.path\.startsWith\(`\$\{JOURNAL_ROOT\}\/`\)/);
	assert.match(view, /void this\.renderPlanContent\(\)/);
});

test('review layout reuses lightweight detail typography and collapses comparison on narrow screens', () => {
	assert.match(css, /\.mx-journal-review-content \{[^}]*max-width: 1080px/);
	assert.match(css, /\.mx-journal-review-section \+ \.mx-journal-review-section \{[^}]*border-top/);
	assert.match(css, /\.mx-journal-review-markdown/);
	assert.match(css, /@container \(max-width: 720px\)[\s\S]*\.mx-journal-review-compare \{ grid-template-columns: minmax\(0, 1fr\)/);
});
