import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css=readFileSync(new URL('../../styles.css',import.meta.url),'utf8');
const plan=readFileSync(new URL('../views/PlanView.ts',import.meta.url),'utf8');

test('long-term rows stay fluid while readable bodies retain the 1080px content measure',()=>{
	const outer=css.match(/\.mx-long-term-detail-content \{([^}]+)\}/)![1]!;
	assert.match(outer,/width: 100%/);
	assert.doesNotMatch(outer,/max-width/);
	assert.match(outer,/container-type: inline-size/);
	assert.match(css,/\.mx-narrative-body \{[^}]*max-width: 1080px/);
	assert.match(css,/\.mx-long-term-stage-note \{[^}]*max-width: 1080px/);
	assert.match(css,/\.mx-long-term-stage-processes \{[^}]*max-width: 1080px/);
	assert.match(plan,/const narrative = detailContent\.createDiv/);
	assert.match(plan,/const stages=detailContent\.createDiv/);
	assert.match(plan,/const summary = main\.createDiv/);
});
test('narrative and stage headings share typography and the same outer-edge inset',()=>{
	assert.match(css,/\.mx-long-term-detail-content \.mx-narrative-title,\s*\.mx-long-term-detail-content \.mx-detail-task-head > \.ad-modal-title \{ font-size: 16px; font-weight: 700; line-height: 1\.45;/);
	assert.match(css,/\.mx-long-term-narrative__section > \.mx-long-term-stage \{ padding: 3px 12px;/);
	assert.match(css,/\.mx-long-term-narrative\.wb-section \{ padding: 0;/);
	assert.match(css,/\.mx-long-term-detail-content \.mx-detail-task-head \{[^}]*padding: 0 12px 6px/);
	assert.match(css,/\.mx-long-term-stage-row > \.mx-long-term-stage \{ padding: 2px 12px;/);
	assert.match(css,/\.mx-long-term-narrative button\.mx-narrative-title \{[^}]*padding-left: 0/);
});
test('section and stage actions occupy one full-width right action rail',()=>{
	assert.match(css,/\.mx-long-term-stages \{ padding-right: 0; padding-left: 0;/);
	assert.match(css,/\.mx-long-term-detail-content \.mx-detail-task-head > \.mx-inline-action \{ margin-left: auto;/);
	assert.match(css,/\.mx-long-term-stage-menu \{ margin-left: auto;/);
	assert.match(plan,/mx-detail-menu[\s\S]*mx-long-term-stage-toggle/);
	assert.match(plan,/mx-detail-task-head[\s\S]*text:'＋ 添加阶段'/);
});
test('inline process fields keep compact non-growing columns while retaining their shared row',()=>{
	const desktop=css.match(/\.mx-process-row--inline \{([^}]+)\}/)![1]!;
	assert.match(desktop,/minmax\(0, 180px\) repeat\(5, max-content\)/);
	assert.match(desktop,/justify-content: start/);
	assert.doesNotMatch(desktop,/1fr|space-between/);
	assert.doesNotMatch(css,/\.mx-process-row--inline \.mx-process-row__name \{ flex: 1/);
	assert.match(plan,/renderProcessRow\(parent/);
});
test('stage bodies render no process heading count or empty-state label',()=>{
	assert.doesNotMatch(plan,/mx-long-term-process-head|mx-long-term-stage-meta|`\$\{refs\.length\} 个进程`|text:'进程'|text:'暂无进程'|text:'进程 · 0'/);
	assert.doesNotMatch(css,/\.mx-long-term-process-head|\.mx-long-term-stage-meta/);
	const pane=plan.indexOf("const processPane=details.createDiv({cls:'mx-long-term-stage-processes'}");
	const rows=plan.indexOf('for(const process of refs)this.renderStageProcess',pane);
	const add=plan.indexOf("mx-long-term-process-add',text:'＋ 添加进程'",rows);
	assert.ok(pane>=0&&pane<rows&&rows<add);
});
test('expanded stage note process rows and add action share the stage content edge',()=>{
	assert.match(css,/\.mx-long-term-stage-details \{[^}]*padding: 2px 12px 4px 36px/);
	assert.doesNotMatch(css,/\.mx-long-term-stage-details \{[^}]*27px/);
	assert.match(css,/\.mx-long-term-stage-processes > \.mx-process-row--inline \{ padding-left: 0;/);
	assert.match(css,/\.mx-long-term-process-add \{[^}]*padding: 2px 0/);
});
test('stage name is a stronger heading while its number remains secondary',()=>{
	assert.match(plan,/mx-long-term-stage__number',text:String\(stage\.index\+1\)\.padStart\(2,'0'\)/);
	assert.match(plan,/mx-long-term-stage__title',text:stage\.text/);
	assert.match(css,/\.mx-long-term-stage__number \{[^}]*color: var\(--ad-text-dim\)[^}]*font-size: 11px[^}]*font-weight: 500/);
	assert.match(css,/\.mx-long-term-stage__title \{[^}]*font-size: 15px[^}]*font-weight: 650[^}]*line-height: 1\.35/);
});
test('stage content uses one 24px indent without changing the collapsed header edge',()=>{
	assert.match(css,/\.mx-long-term-stage-row > \.mx-long-term-stage \{ padding: 2px 12px;/);
	assert.match(css,/\.mx-long-term-stage-details \{[^}]*padding: 2px 12px 4px 36px/);
	assert.doesNotMatch(css,/\.mx-long-term-stage-note \{[^}]*(?:margin-left|padding-left)/);
	assert.match(css,/\.mx-long-term-stage-processes > \.mx-process-row--inline \{ padding-left: 0;/);
	assert.doesNotMatch(css,/\.mx-long-term-process-add \{[^}]*(?:margin-left|padding-left)/);
});
test('stage hierarchy leaves the shared checkbox and current pill dimensions unchanged',()=>{
	assert.match(css,/\.mx-embedded-task-checkbox \{[^}]*width: 16px; height: 16px/);
	assert.match(css,/\.mx-long-term-stage > \.mx-embedded-task-checkbox \{ margin-top: 1px; \}/);
	assert.match(css,/\.mx-long-term-current \{[^}]*min-height: 20px[^}]*font-size: 10px/);
});
test('each stage keeps one bottom divider and no large collapsed height',()=>{
	const stage=css.match(/\.mx-long-term-stage-row \{([^}]+)\}/)![1]!;
	assert.match(stage,/padding: 4px 0/);
	assert.match(stage,/border-bottom: 1px solid var\(--background-modifier-border\)/);
	assert.doesNotMatch(stage,/border-top|min-height/);
});
test('expanded stage content is continuous without internal stage dividers',()=>{
	const details=css.match(/\.mx-long-term-stage-details \{([^}]+)\}/)![1]!;
	const processes=css.match(/\.mx-long-term-stage-processes \{([^}]+)\}/)![1]!;
	const note=css.match(/\.mx-long-term-stage-note \{([^}]+)\}/)![1]!;
	assert.doesNotMatch(details,/border-(?:top|bottom|left|right)|border:/);
	assert.doesNotMatch(processes,/border-(?:top|bottom|left|right)|border:/);
	assert.doesNotMatch(note,/border-(?:top|bottom|left|right)|border:/);
});
test('process separators appear only between adjacent stage process rows',()=>{
	assert.match(css,/\.mx-long-term-stage-processes > \.mx-process-row--inline \{[^}]*border-bottom: 0/);
	assert.match(css,/\.mx-long-term-stage-processes > \.mx-process-row--inline \+ \.mx-process-row--inline \{ border-top: 1px solid var\(--ad-hair\); \}/);
});
test('compact fields retain the existing two-row narrow layout and secondary metadata',()=>{
	assert.match(css,/@container \(max-width: 720px\)[\s\S]*grid-template-areas: "name meta meta meta" "date schedule progress menu"/);
	assert.match(css,/\.mx-process-row--inline \.mx-process-row__date \{[^}]*color: var\(--ad-text-dim\)/);
	assert.match(css,/\.mx-process-row \.mx-process-row__name-link \{[^}]*font-weight: 600/);
	assert.match(css,/\.mx-long-term-stage__title \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap/);
});
