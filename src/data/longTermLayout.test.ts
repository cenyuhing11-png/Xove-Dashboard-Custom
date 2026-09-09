import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css=readFileSync(new URL('../../styles.css',import.meta.url),'utf8');
const plan=readFileSync(new URL('../views/PlanView.ts',import.meta.url),'utf8');

test('narrative and stage sections share a fluid readable column independent of the outer summary',()=>{
	assert.match(css,/\.mx-long-term-detail-content \{[^}]*width: 100%; max-width: 1080px;[^}]*container-type: inline-size/);
	assert.match(plan,/const narrative = detailContent\.createDiv/);
	assert.match(plan,/const stages=detailContent\.createDiv/);
	assert.match(plan,/const summary = main\.createDiv/);
});
test('narrative headings and stage heading share typography without stretching action gaps',()=>{
	assert.match(css,/\.mx-long-term-detail-content \.mx-narrative-title,\s*\.mx-long-term-detail-content \.mx-detail-task-head > \.ad-modal-title \{ font-size: 16px; font-weight: 700; line-height: 1\.45;/);
	assert.match(css,/\.mx-long-term-stage \{[^}]*gap: 7px/);
	assert.match(css,/\.mx-long-term-detail-content \.mx-detail-task-head \{ justify-content: flex-start;/);
});
test('inline process fields keep compact non-growing columns while retaining their shared row',()=>{
	const desktop=css.match(/\.mx-process-row--inline \{([^}]+)\}/)![1]!;
	assert.match(desktop,/minmax\(0, 180px\) repeat\(5, max-content\)/);
	assert.match(desktop,/justify-content: start/);
	assert.doesNotMatch(desktop,/1fr|space-between/);
	assert.doesNotMatch(css,/\.mx-process-row--inline \.mx-process-row__name \{ flex: 1/);
	assert.match(plan,/renderProcessRow\(parent/);
});
test('empty and populated stage headings both say only 进程',()=>{
	assert.match(plan,/processHead\.createSpan\(\{cls:'ad-modal-label',text:'进程'\}\)/);
	assert.doesNotMatch(plan,/关联进程 · \$\{refs.length\}|text:'暂无进程'|text:'进程 · 0'/);
});
test('compact fields retain the existing two-row narrow layout and secondary metadata',()=>{
	assert.match(css,/@container \(max-width: 720px\)[\s\S]*grid-template-areas: "name meta meta meta" "date schedule progress menu"/);
	assert.match(css,/\.mx-process-row--inline \.mx-process-row__date \{[^}]*color: var\(--ad-text-dim\)/);
	assert.match(css,/\.mx-process-row \.mx-process-row__name-link \{[^}]*font-weight: 600/);
});
