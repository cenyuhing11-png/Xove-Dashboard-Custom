import test from 'node:test';
import assert from 'node:assert/strict';
import { CYCLE_DISPLAY_LABELS, planDisplayLabel, reviewDisplayLabel, reviewDisplayTitle } from './cycleDisplayLabels.ts';

test('plan display labels use the settled week month quarter year names', () => {
	assert.deepEqual((['week', 'month', 'quarter', 'year'] as const).map(planDisplayLabel), ['周计划', '月计划', '季计划', '年计划']);
});

test('review display labels reserve quarter separately and use settled supported names', () => {
	assert.equal(CYCLE_DISPLAY_LABELS.quarter.review, '季复盘');
	assert.deepEqual((['day', 'week', 'month', 'year'] as const).map(reviewDisplayLabel), ['日记', '周复盘', '月复盘', '年复盘']);
});

test('legacy review titles are normalized for display without changing source values', () => {
	assert.equal(reviewDisplayTitle('week', '2026-W37 周记'), '2026-W37 周复盘');
	assert.equal(reviewDisplayTitle('month', '2026-09 月度复盘'), '2026-09 月复盘');
	assert.equal(reviewDisplayTitle('year', '2026 年度复盘'), '2026 年复盘');
	assert.equal(reviewDisplayTitle('month', '九月重新出发'), '九月重新出发');
});
