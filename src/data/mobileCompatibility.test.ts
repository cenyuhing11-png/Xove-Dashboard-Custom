import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const srcRoot = join(repoRoot, 'src');
const manifest = JSON.parse(readFileSync(join(repoRoot, 'manifest.json'), 'utf8')) as { version?: string; isDesktopOnly?: boolean };

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap(name => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
	});
}

const productionSources = sourceFiles(srcRoot).map(path => ({ path: relative(repoRoot, path), text: readFileSync(path, 'utf8') }));
const desktopOnlyPatterns: Array<[string, RegExp]> = [
	['electron import', /(?:from|import)\s*\(?['"]electron(?:\/|['"])/],
	['fs import', /(?:from|import)\s*\(?['"](?:node:)?fs(?:\/|['"])/],
	['path import', /(?:from|import)\s*\(?['"](?:node:)?path(?:\/|['"])/],
	['os import', /(?:from|import)\s*\(?['"](?:node:)?os(?:\/|['"])/],
	['child_process import', /(?:from|import)\s*\(?['"](?:node:)?child_process(?:\/|['"])/],
	['window.require', /\bwindow\.require\b/],
	['module.require', /\bmodule\.require\b/],
	['__dirname', /\b__dirname\b/],
	['__filename', /\b__filename\b/],
];

test('manifest no longer declares the plugin desktop-only', () => {
	assert.equal(manifest.isDesktopOnly, false);
	assert.equal(manifest.version, '0.4.0-dev.3');
});

test('mobile production source has no desktop-only Node or Electron module imports', () => {
	for (const source of productionSources) {
		for (const [label, pattern] of desktopOnlyPatterns) assert.doesNotMatch(source.text, pattern, `${label} in ${source.path}`);
	}
});

test('plugin load path does not synchronously require desktop-only helpers', () => {
	const main = productionSources.find(source => source.path.endsWith('src/main.ts'));
	assert.ok(main);
	assert.doesNotMatch(main.text, /\brequire\s*\(/);
	assert.doesNotMatch(main.text, /Platform\.isDesktop|Platform\.isMobile/);
});

test('Dashboard Workbench TimeTrace and Process sources remain mobile-safe', () => {
	for (const suffix of ['src/views/DashboardView.ts', 'src/components/workbench/WorkbenchShell.ts', 'src/views/PlanView.ts', 'src/views/ProjectBoard.ts']) {
		const source = productionSources.find(item => item.path.endsWith(suffix));
		assert.ok(source, suffix);
		for (const [, pattern] of desktopOnlyPatterns) assert.doesNotMatch(source.text, pattern, suffix);
	}
});

test('main module emits the load sentinel before plugin lifecycle starts', () => {
	const main = productionSources.find(source => source.path.endsWith('src/main.ts'));
	assert.ok(main);
	assert.match(main.text, /console\.info\('\[Mengxu MobileDiag\] module:loaded'\)/);
});

test('onload diagnostics have stable stage order and a completion marker', () => {
	const main = productionSources.find(source => source.path.endsWith('src/main.ts'));
	assert.ok(main);
	const stages = [
		'01 onload:start',
		'02 load-settings',
		'03 services',
		'04 markdown-processor',
		'05 editor-extensions',
		'06 views',
		'07 commands',
		'08 settings-tab',
		'09 status-bar',
		'10 update-modal:queued',
		'11 onload:complete',
	];
	const positions = stages.map(stage => main.text.indexOf(stage));
	assert.ok(positions.every(position => position >= 0));
	assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test('fatal onload diagnostics log name message stack and rethrow', () => {
	const main = productionSources.find(source => source.path.endsWith('src/main.ts'));
	assert.ok(main);
	assert.match(main.text, /ONLOAD_FATAL name/);
	assert.match(main.text, /ONLOAD_FATAL message/);
	assert.match(main.text, /ONLOAD_FATAL stack/);
	assert.match(main.text, /console\.error\('\[Mengxu MobileDiag\] ONLOAD_FATAL', error\)[\s\S]*throw error;/);
});

test('diagnostic helpers do not write Vault data or Markdown', () => {
	const main = productionSources.find(source => source.path.endsWith('src/main.ts'));
	assert.ok(main);
	const helper = main.text.slice(main.text.indexOf('function mobileDiag'), main.text.indexOf('/** 番茄钟运行时状态'));
	assert.ok(helper);
	assert.doesNotMatch(helper, /vault\.|saveData|create\(|modify\(|process\(/);
});

test('production bundle retains diagnostic sentinels without Node or Electron imports', () => {
	const bundle = readFileSync(join(repoRoot, 'main.js'), 'utf8');
	assert.match(bundle, /\[Mengxu MobileDiag\] module:loaded/);
	assert.match(bundle, /\[Mengxu MobileDiag\] ONLOAD_FATAL/);
	assert.doesNotMatch(bundle, /require\("(?:electron|fs|path|os|child_process|node:fs|node:path|node:os)"\)/);
});
