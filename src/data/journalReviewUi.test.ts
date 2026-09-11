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
	assert.match(view, /mx-journal-review-record-controls/);
	assert.match(view, /mx-journal-review-mode/);
	assert.doesNotMatch(view, /mx-journal-review-modes[^\n]*po-cal__seg/);
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
	assert.match(view, /reviewView: this\.reviewView/);
	assert.match(view, /state\.reviewMode === 'review' \|\| state\.reviewMode === 'compare'/);
	assert.match(view, /state\.reviewView === 'record'.*state\.reviewView === 'recent'.*state\.reviewView === 'search'.*state\.reviewView === 'pastToday'/);
});

test('review header exposes lightweight recent search random and past-today tools in order', () => {
	const toolbar = view.match(/private renderReviewToolbar[\s\S]*?(?=\n\tprivate async renderReview\()/)?.[0] ?? '';
	assert.match(toolbar, /\[\['recent', '最近记录'\], \['search', '搜索'\], \['pastToday', '过去的今天'\]\]/);
	assert.match(toolbar, /button\.onclick[\s\S]*?if \(mode === 'search'\)[\s\S]*?text: '随机回顾'/);
	assert.match(toolbar, /mx-journal-review-tool/);
	assert.doesNotMatch(toolbar, /Modal|sidebar|createDiv\(\{ cls: 'po-sidebar/);
});

test('random review is an action that opens one record rather than a persistent view mode', () => {
	assert.match(view, /JournalReviewViewMode/);
	const adapter = readFileSync(new URL('./journalReview.ts', import.meta.url), 'utf8');
	assert.match(adapter, /'record' \| 'recent' \| 'search' \| 'pastToday'/);
	assert.doesNotMatch(adapter, /JournalReviewViewMode[^\n]*random/);
	assert.match(view, /const record = randomReviewRecord\(records\)/);
	assert.match(view, /if \(record\) this\.openReviewRecord\(record\)/);
});

test('search stays inline, uses a 200ms debounce and renders no result for empty input', () => {
	assert.match(view, /placeholder: '搜索过去写过的内容……'/);
	assert.match(view, /window\.setTimeout\(\(\) => \{[\s\S]*?\}, 200\)/);
	assert.match(view, /if \(!query\.trim\(\)\) return/);
	assert.doesNotMatch(view, /new Modal/);
});

test('recent results start at twelve and grow in twelve-record increments', () => {
	assert.match(view, /reviewRecentLimit = 12/);
	assert.match(view, /recentReviewRecords\(records, this\.reviewRecentLimit\)/);
	assert.match(view, /this\.reviewRecentLimit \+= 12/);
});

test('result rows route back to the shared focus and record reader', () => {
	assert.match(view, /this\.timeState = timeStateForReviewRecord\(this\.timeState, record\)/);
	assert.match(view, /this\.reviewView = 'record'/);
	assert.match(view, /row\.onkeydown.*event\.key === 'Enter'.*event\.key === ' '/);
});

test('mini-calendar changes always return journal review to record mode', () => {
	assert.match(view, /private setTimeState[\s\S]*?this\.mode === 'review'[\s\S]*?this\.reviewView = 'record'/);
});

test('edit source remains a record-only action and is absent from tool result pages', () => {
	const render = view.match(/private async renderReview\([\s\S]*?(?=\n\tprivate async renderLongTermPlans)/)?.[0] ?? '';
	const branch = render.indexOf("if (this.reviewView === 'recent')");
	const edit = render.indexOf("text: '编辑原文'");
	assert.ok(branch >= 0 && edit > branch);
	assert.match(render, /if \(reviewFile\)/);
});

test('review discovery is read-only and never auto-creates records', () => {
	const adapter = readFileSync(new URL('./journalReview.ts', import.meta.url), 'utf8');
	const discovery = adapter.match(/export async function discoverReviewRecords[\s\S]*?\n}/)?.[0] ?? '';
	assert.match(discovery, /getMarkdownFiles/);
	assert.match(discovery, /cachedRead/);
	assert.doesNotMatch(discovery, /vault\.(?:create|modify|process|rename|delete)/);
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
	assert.match(css, /button\.mx-journal-review-tool,[\s\S]*?background: transparent/);
	assert.match(css, /\.mx-journal-review-result \{[^}]*border-bottom: 1px solid var\(--ad-line\)/);
	assert.doesNotMatch(css, /\.mx-journal-review-result \{[^}]*box-shadow/);
	assert.match(css, /@container \(max-width: 720px\)[\s\S]*\.mx-journal-review-compare \{ grid-template-columns: minmax\(0, 1fr\)/);
});
