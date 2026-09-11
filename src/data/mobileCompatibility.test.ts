import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const srcRoot = join(repoRoot, 'src');
const manifest = JSON.parse(readFileSync(join(repoRoot, 'manifest.json'), 'utf8')) as { isDesktopOnly?: boolean };

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
