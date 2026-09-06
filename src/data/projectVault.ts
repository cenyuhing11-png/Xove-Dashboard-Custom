import type { App } from 'obsidian';
import { projectNote, PROJECT_ROOT } from './projects.ts';
import type { MengxuProject } from './projects';

/** Explicit Properties opt-in within the formal root; no fallback scans or auto migration. */
export function scanProjects(app: App): MengxuProject[] {
	const projects: MengxuProject[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (!file.path.startsWith(`${PROJECT_ROOT}/`)) continue;
		try {
			const project = projectNote(file.path, app.metadataCache.getFileCache(file)?.frontmatter);
			if (project) projects.push(project);
		} catch { /* Malformed/unavailable metadata must not block the home page. */ }
	}
	return projects.sort((a, b) => b.createdDate.localeCompare(a.createdDate) || a.path.localeCompare(b.path, 'zh-CN'));
}
