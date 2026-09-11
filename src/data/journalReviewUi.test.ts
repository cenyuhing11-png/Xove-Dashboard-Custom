import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync(new URL('../views/PlanView.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

test('review replaces the placeholder with the shared focus adapter and an async reader', () => {
	assert.match(view, /else await this\.renderReview\(header, body, token\)/);
	assert.match(view, /journalReviewTarget\(this\.timeState\.focus\)/);
	assert.doesNotMatch(view, /已选择：\$\{focusLabel\(this\.timeState\.focus\)\}/);
});

test('day review renders only the three settled reading sections and no task widget', () => {
	assert.match(view, /dayOnly \? dayReviewSections\(markdown\) : markdownReviewSections\(markdown\)/);
	const adapter = readFileSync(new URL('./journalReview.ts', import.meta.url), 'utf8');
	assert.match(adapter, /\['随时记', '今日日记', '今日回看'\]/);
	assert.doesNotMatch(adapter.match(/dayReviewSections[\s\S]*?\n}/)?.[0] ?? '', /今日任务/);
});

test('week month and year expose review and plan comparison modes while quarter does not', () => {
	assert.match(view, /\[\['review', '复盘'\], \['compare', '计划 ↔ 复盘'\]\]/);
	assert.match(view, /target\.kind !== 'day' && target\.kind !== 'quarter'/);
	assert.match(view, /mx-journal-review-record-controls/);
	assert.match(view, /mx-journal-review-mode/);
	assert.doesNotMatch(view, /mx-journal-review-modes[^\n]*po-cal__seg/);
	assert.match(view, /mx-journal-review-pane is-plan/);
	assert.match(view, /mx-journal-review-pane is-review/);
});

test('quarter review is an explicit storage-free empty state without create or compare actions', () => {
	assert.match(view, /quarter: \['本季尚未创建季复盘', ''\]/);
	assert.match(view, /if \(target\.kind === 'quarter'\) return/);
	assert.match(view, /if \(target\.kind === 'quarter'\) \{ this\.renderMissingReview\(content, target\); return; \}/);
	const adapter = readFileSync(new URL('./journalReview.ts', import.meta.url), 'utf8');
	assert.match(adapter, /kind: 'quarter'[\s\S]*primary: `\$\{focus\.year\} Q\$\{focus\.quarter\}`[\s\S]*secondary: '季复盘'[\s\S]*reviewPaths: \[\]/);
	assert.match(adapter, /focus\.kind === 'quarter'\) throw new Error\('季复盘存储体系尚未建立'\)/);
	assert.match(adapter, /export interface ReviewRecord \{\s*kind: JournalKind;/);
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

test('a missing day record exposes one lightweight focused-date creation action', () => {
	assert.match(view, /!reviewFile && \(target\.kind === 'day' \|\| this\.reviewMode === 'review'\)[\s\S]*?this\.renderMissingReview\(content, target\)/);
	assert.match(view, /day: \['这一天尚未创建日记', '创建这天日记 →'\]/);
	assert.match(view, /mx-inline-action mx-journal-review-create/);
});

test('all missing review kinds expose the settled lightweight creation copy', () => {
	for (const copy of [
		"week: ['本周尚未创建周复盘', '创建本周复盘 →']",
		"month: ['本月尚未创建月复盘', '创建本月复盘 →']",
		"year: ['本年度尚未创建年复盘', '创建本年复盘 →']",
	]) assert.ok(view.includes(copy));
});

test('focused review creation reuses ensureJournal through the shared adapter and redraws in place', () => {
	const method = view.match(/private renderMissingReview[\s\S]*?(?=\n\tprivate renderReviewToolbar)/)?.[0] ?? '';
	assert.match(method, /const focus = this\.timeState\.focus/);
	assert.match(method, /focus\.kind !== target\.kind/);
	assert.match(method, /await ensureReviewForFocus\(this\.planFiles\(\), focus\)/);
	assert.match(method, /await this\.renderPlanContent\(\)/);
	assert.match(view, /createFolder: \(path: string\) => vault\.createFolder\(path\)/);
	assert.match(view, /create: \(path: string, content: string\) => vault\.create\(path, content\)/);
});

test('focused review creation keeps route focus visible month and record or compare mode', () => {
	const method = view.match(/private renderMissingReview[\s\S]*?(?=\n\tprivate renderReviewToolbar)/)?.[0] ?? '';
	assert.doesNotMatch(method, /this\.(?:timeState|reviewView|mode)\s*=(?!=)/);
	assert.doesNotMatch(method, /openSource|openFile|openLinkText|getLeaf|workspace/);
	assert.match(method, /const reviewMode = this\.reviewMode/);
	assert.match(method, /this\.reviewMode === reviewMode/);
	assert.match(method, /sameTimeFocus\(this\.timeState\.focus, focus\)/);
});

test('focused review creation reports failures and leaves the empty state mounted', () => {
	const method = view.match(/private renderMissingReview[\s\S]*?(?=\n\tprivate renderReviewToolbar)/)?.[0] ?? '';
	assert.match(method, /catch \(error\)/);
	assert.match(method, /create\.disabled = false/);
	assert.match(method, /new Notice\(`无法创建\$\{target\.reviewLabel\}：/);
});

test('compare mode provides the same review CTA only in the missing right pane', () => {
	const render = view.match(/private async renderReview\([\s\S]*?(?=\n\tprivate async renderLongTermPlans)/)?.[0] ?? '';
	const planLine = render.split('\n').find(line => line.includes("is-plan'")) ?? '';
	assert.match(planLine, /尚未创建\$\{target\.planLabel \?\? '对应计划'\}/);
	assert.doesNotMatch(planLine, /renderMissingReview/);
	assert.match(render, /is-review'[\s\S]*?parent => this\.renderMissingReview\(parent, target\)/);
});

test('recent rows use time plus one main text and suppress only their type subtitle', () => {
	const recent = view.match(/private renderRecentReviews[\s\S]*?(?=\n\tprivate renderSearchResults)/)?.[0] ?? '';
	assert.match(recent, /recentReviewTimeLabel\(record\)/);
	assert.match(recent, /recentReviewTitle\(record\)/);
	assert.match(recent, /showType: false/);
	const search = view.match(/private renderSearchResults[\s\S]*?(?=\n\tprivate renderReviewSearch)/)?.[0] ?? '';
	assert.doesNotMatch(search, /showType: false/);
});

test('recent row compacting removes the second-line height without cards', () => {
	assert.match(css, /\.mx-journal-review-results\.is-recent \.mx-journal-review-result \{[^}]*align-items: center;[^}]*padding-block: 7px/);
	assert.doesNotMatch(css, /\.mx-journal-review-results\.is-recent[^}]*height:/);
	assert.doesNotMatch(css, /\.mx-journal-review-results\.is-recent[^}]*background:/);
});

test('missing day CTA is a compact inline action rather than a large empty card', () => {
	assert.match(css, /\.mx-journal-review-missing-day \{[^}]*min-height: 0;[^}]*padding: 18px 0/);
	assert.doesNotMatch(css, /\.mx-journal-review-missing-day \{[^}]*background:/);
	assert.doesNotMatch(css, /\.mx-journal-review-create \{[^}]*font-size:/);
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
