import test from 'node:test';
import assert from 'node:assert/strict';
import { dayReviewSections, journalReviewTarget, markdownReviewSections } from './journalReview.ts';

test('day focus resolves canonical and legacy daily names without inventing a title', () => {
	const target = journalReviewTarget({ kind: 'day', date: '2026-09-10' });
	assert.equal(target.kind, 'day');
	assert.equal(target.primary, '2026 年 9 月 10 日');
	assert.deepEqual(target.reviewPaths, [
		'04-日记与复盘/01-日记/2026-09-10.md',
		'04-日记与复盘/01-日记/2026-09-10 日记.md',
	]);
	assert.equal(target.planPath, undefined);
});

test('week focus shares the existing ISO journal and plan naming helpers', () => {
	const target = journalReviewTarget({ kind: 'week', isoYear: 2026, isoWeek: 37, anchorDate: '2026-09-07' });
	assert.equal(target.primary, '2026-W37 周记');
	assert.equal(target.secondary, '2026.09.07 — 2026.09.13');
	assert.deepEqual(target.reviewPaths, ['04-日记与复盘/02-周记/2026-W37 周记.md']);
	assert.equal(target.planPath, '05-计划/05-周计划/2026-W37 周计划.md');
});

test('week focus preserves ISO week-year naming across a calendar-year boundary', () => {
	const target = journalReviewTarget({ kind: 'week', isoYear: 2020, isoWeek: 53, anchorDate: '2020-12-28' });
	assert.equal(target.primary, '2020-W53 周记');
	assert.equal(target.planPath, '05-计划/05-周计划/2020-W53 周计划.md');
});

test('month focus resolves the existing month review and plan paths', () => {
	const target = journalReviewTarget({ kind: 'month', year: 2026, month: 9 });
	assert.equal(target.primary, '2026 年 9 月');
	assert.equal(target.secondary, '月度复盘');
	assert.deepEqual(target.reviewPaths, ['04-日记与复盘/03-月度复盘/2026-09 月度复盘.md']);
	assert.equal(target.planPath, '05-计划/04-月度/2026-09 月度计划.md');
});

test('year focus resolves the existing annual review and plan paths', () => {
	const target = journalReviewTarget({ kind: 'year', year: 2026 });
	assert.equal(target.primary, '2026 年');
	assert.equal(target.secondary, '年度复盘');
	assert.deepEqual(target.reviewPaths, ['04-日记与复盘/04-年度复盘/2026 年度复盘.md']);
	assert.equal(target.planPath, '05-计划/02-年度/2026 年度计划.md');
});

test('review parser preserves markdown bodies but removes frontmatter and record H1', () => {
	const sections = markdownReviewSections('---\n类型: 周记\n---\n\n# 标题\n\n## 本周完成\n\n- 完成 [[项目]]\n\n## 本周感受\n\n**不错**\n');
	assert.deepEqual(sections, [
		{ title: '本周完成', markdown: '- 完成 [[项目]]' },
		{ title: '本周感受', markdown: '**不错**' },
	]);
});

test('daily reader includes only quick notes diary and reflection in fixed order', () => {
	const sections = dayReviewSections('## 今日回看\n\n回看\n\n## 今日任务\n\n- [ ] 不展示\n\n## 今日日记\n\n正文\n\n## 随时记\n\n- 09:20 灵感\n');
	assert.deepEqual(sections.map(section => section.title), ['随时记', '今日日记', '今日回看']);
	assert.equal(sections.some(section => section.title === '今日任务'), false);
});

test('headings inside fenced examples do not create review sections', () => {
	const sections = markdownReviewSections('```md\n## 假标题\n```\n\n## 真标题\n\n正文');
	assert.deepEqual(sections, [{ title: '真标题', markdown: '正文' }]);
});

test('empty real sections remain visible for a faithful reading outline', () => {
	assert.deepEqual(markdownReviewSections('## 本月完成\n\n## 下月重点\n'), [
		{ title: '本月完成', markdown: '' },
		{ title: '下月重点', markdown: '' },
	]);
});
