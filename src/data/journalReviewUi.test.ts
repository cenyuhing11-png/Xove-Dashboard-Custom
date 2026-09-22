import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync(new URL('../views/PlanView.ts', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../components/journal/JournalInlineEditor.ts', import.meta.url), 'utf8');
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

test('all periods use fixed dual editors without mode toolbar', () => {
assert.match(view, /target.kind !== 'day'/); assert.match(view, /mx-journal-review-pane is-plan/); assert.match(view, /mx-journal-review-pane is-review/); assert.doesNotMatch(view, /mx-journal-review-record-controls|mx-journal-review-modes|计划 ↔ 复盘/);
});

test('quarter review uses shared inline document with focus-derived creation', () => {
assert.match(view, /ensureReviewForFocus\(this\.planFiles\(\), focus\)/); assert.match(editor, /editableJournalSections\(kind\)/); assert.doesNotMatch(view, /target\.kind === 'quarter'\) return/);
});

test('record header exposes a lightweight editable title for day only', () => {
assert.match(editor, /kind === 'day'.*this\.field\(parent, \{ kind: 'title' \}/); assert.match(editor, /给今天一个标题/); assert.doesNotMatch(view, /未命名日记/);
});

test('single-record inline editing does not repeat the document label', () => {
assert.match(view, /toolbar\.createEl\('h1', \{ cls: 'mx-journal-review-time'/); assert.match(view, /editor\.mount\(editorParent, target\.kind\)/); assert.doesNotMatch(editor, /createEl\('h1'/);
});

test('raw source escape hatch opens exact files while writes use atomic adapter', () => {
assert.match(view, /getLeaf\('tab'\)\.openFile/); assert.match(editor, /app\.vault\.process\(file, update\)/); assert.doesNotMatch(editor, /saveData|localStorage/);
});

test('review mode is restored with existing PlanWorkspace renderer state', () => {
	assert.match(view, /reviewMode: this\.reviewMode/);
	assert.match(view, /reviewView: this\.reviewView/);
	assert.match(view, /state\.reviewMode === 'review' \|\| state\.reviewMode === 'compare'/);
	assert.match(view, /state\.reviewView === 'record'.*state\.reviewView === 'recent'.*state\.reviewView === 'search'.*state\.reviewView === 'pastToday'/);
});

test('review header exposes lightweight recent search random and past-today tools in order', () => {
	const toolbar = view.match(/private renderReviewToolbar[\s\S]*?(?=\n\tprivate async renderReview\()/)?.[0] ?? '';
	assert.match(toolbar, /\[\['overview', '日记一览'\], \['plans', '计划一览'\], \['recent', '最近记录'\], \['search', '搜索'\], \['pastToday', '过去的今天'\]\]/);
	assert.match(toolbar, /button\.onclick[\s\S]*?if \(mode === 'search'\)[\s\S]*?text: '随机回顾'/);
	assert.match(toolbar, /mx-journal-review-tool/);
	assert.doesNotMatch(toolbar, /Modal|sidebar|createDiv\(\{ cls: 'po-sidebar/);
});

test('random review is an action that opens one record rather than a persistent view mode', () => {
	assert.match(view, /JournalReviewViewMode/);
	const adapter = readFileSync(new URL('./journalReview.ts', import.meta.url), 'utf8');
	assert.match(adapter, /'record' \| 'plans' \| 'overview' \| 'recent' \| 'search' \| 'pastToday'/);
	assert.doesNotMatch(adapter, /JournalReviewViewMode[^\n]*random/);
	assert.match(view, /const record = randomReviewRecord\(candidates\)/);
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

test('a missing day record mounts empty editors without mandatory creation CTA', () => {
assert.match(view, /这一天还没有日记内容，开始写这天日记/); assert.match(view, /editor\.mount\(editorParent, target\.kind\)/); assert.doesNotMatch(view, /renderMissingReview/);
});

test('missing periods show editors without start-writing CTA', () => {
assert.doesNotMatch(view, /开始写\$\{target.reviewLabel\}/); assert.match(view, /editable|planEditor.mount/); assert.match(editor, /editableJournalSections\(kind\)/);
});

test('focused review lazy creation uses explicit captured focus', () => {
assert.match(view, /const focus = this\.timeState\.focus/); assert.match(view, /journalInlineFiles\(this\.app, \(\) => path, async \(\) => \{ path = await ensureReviewForFocus/); assert.match(editor, /await this\.doc\.read\(\)/);
});

test('inline refresh keeps mounted editor and refreshes sidebar separately', () => {
assert.match(view, /this\.inlineKey === editorKey/); assert.match(view, /this\.inlineEditor\?\.refresh\(\), this\.planInlineEditor\?\.refresh\(\)/); assert.match(view, /container\.prepend\(side\)/);
});

test('inline save errors retain textarea with visible status and retry', () => {
assert.match(editor, /保存失败/); assert.match(editor, /保留当前输入/); assert.match(editor, /retry\.onclick.*draft\.flush/);
});

test('plan and review share the same inline infrastructure', () => {
assert.match(view, /planEditor.mount\(planParent, period, true\)/); assert.match(view, /editor.mount\(editorParent, target.kind\)/); assert.match(view, /ensurePlan\(this.planFiles\(\), period, date\)/);
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

test('inline fields have transparent body styling and no fixed footer', () => {
assert.match(css, /textarea\.mx-journal-inline-input \{[^}]*background: transparent/); assert.match(css, /\.mx-journal-inline-state \{[^}]*font-size: 11px/); assert.doesNotMatch(css, /\.mx-journal-inline-state \{[^}]*position: fixed/);
});

test('mini-calendar changes always return journal review to record mode', () => {
	assert.match(view, /private setTimeState[\s\S]*?this\.mode === 'review'[\s\S]*?this\.reviewView = 'record'/);
});

test('raw source is available from context menu only', () => {
const render=view.slice(view.indexOf('private async renderReview('),view.indexOf('private async renderJournalOverview')); assert.match(render, /contextmenu/); assert.match(render, /setTitle\('打开原文'\)/); assert.match(render, /await this.flushInlineEdits\(\)/); assert.doesNotMatch(render, /text: '打开原文'|record-controls/);
});

test('review discovery is read-only and never auto-creates records', () => {
	const adapter = readFileSync(new URL('./journalReview.ts', import.meta.url), 'utf8');
	const discovery = adapter.match(/export async function discoverReviewRecords[\s\S]*?\n}/)?.[0] ?? '';
	assert.match(discovery, /getMarkdownFiles/);
	assert.match(discovery, /readJournalContent/);
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
