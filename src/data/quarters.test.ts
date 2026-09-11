import test from 'node:test';
import assert from 'node:assert/strict';
import { quarterEndMonth, quarterOfMonth, quarterStartDate, quarterStartMonth } from './quarters.ts';

for (const [month, quarter] of [[1, 1], [3, 1], [4, 2], [6, 2], [7, 3], [9, 3], [10, 4], [12, 4]] as const) {
	test(`${month} 月属于 Q${quarter}`, () => assert.equal(quarterOfMonth(month), quarter));
}

test('quarter range helpers share the same validated quarter model', () => {
	assert.equal(quarterStartMonth(2026, 3), '2026-07');
	assert.equal(quarterEndMonth(2026, 3), '2026-09');
	assert.deepEqual([quarterStartDate(2026, 3).getFullYear(), quarterStartDate(2026, 3).getMonth()], [2026, 6]);
});

test('quarter helpers reject invalid month and quarter numbers', () => {
	assert.throws(() => quarterOfMonth(0));
	assert.throws(() => quarterOfMonth(13));
	assert.throws(() => quarterStartMonth(2026, 0));
	assert.throws(() => quarterEndMonth(2026, 5));
});
