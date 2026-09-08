import { Component, Notice } from 'obsidian';
import type Dashboard from '../../main';
import { DEFAULT_SETTINGS } from '../../settings';
import type { BannerSettings } from '../../settings';
import { BannerModal } from '../../views/BannerModal';
import { MOCK_DATA, DashboardData } from '../../data/mockData';
import { calcHeatmapStats, getVaultNoteCounts } from '../../utils/vaultOverview';
import { naturalTimeSummary } from '../../utils/timeProgress';
import { todayStr } from '../../data/taskLogic';
import { t, isEnglish } from '../../i18n';
import { ICON_home, ICON_calendar, ICON_newDiary, ICON_newTask, ICON_newProject, ICON_allProjects, ICON_opportunity, ICON_gear, ICON_moon, ICON_sun, injectSvg } from '../../icons';
export type WorkbenchAction = 'home' | 'plan' | 'all' | 'opportunity' | 'classic' | 'diary' | 'task' | 'project';
/** Format lunar date as "五月廿二" style */
function getLunarDate(d: Date): string {
	try {
		const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
			timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric',
		}).formatToParts(d);
		const monthStr = parts.find((p) => p.type === 'month')?.value ?? '';
		const dayStr = parts.find((p) => p.type === 'day')?.value ?? '';
		if (/[\u4e00-\u9fff]/.test(monthStr)) {
			// Convert numeric day to Chinese ordinal (e.g. "1" → "初一", "15" → "十五")
			const dayNum = parseInt(dayStr);
			if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 30) {
				const LUNAR_DAYS = ['\u521D\u4E00','\u521D\u4E8C','\u521D\u4E09','\u521D\u56DB','\u521D\u4E94','\u521D\u516D','\u521D\u4E03','\u521D\u516B','\u521D\u4E5D','\u521D\u5341',
					'\u5341\u4E00','\u5341\u4E8C','\u5341\u4E09','\u5341\u56DB','\u5341\u4E94','\u5341\u516D','\u5341\u4E03','\u5341\u516B','\u5341\u4E5D','\u4E8C\u5341',
					'\u5EFF\u4E00','\u5EFF\u4E8C','\u5EFF\u4E09','\u5EFF\u56DB','\u5EFF\u4E94','\u5EFF\u516D','\u5EFF\u4E03','\u5EFF\u516B','\u5EFF\u4E5D','\u4E09\u5341'];
				return monthStr + (LUNAR_DAYS[dayNum - 1] ?? dayStr);
			}
			return monthStr + dayStr.replace('\u65E5', '');
		}
		const m = parseInt(monthStr) || 1;
		const day = parseInt(dayStr) || 1;
		const MONTHS = ['\u6B63\u6708','\u4E8C\u6708','\u4E09\u6708','\u56DB\u6708','\u4E94\u6708','\u516D\u6708','\u4E03\u6708','\u516B\u6708','\u4E5D\u6708','\u5341\u6708','\u51AC\u6708','\u814A\u6708'];
		const DAYS = ['\u521D\u4E00','\u521D\u4E8C','\u521D\u4E09','\u521D\u56DB','\u521D\u4E94','\u521D\u516D','\u521D\u4E03','\u521D\u516B','\u521D\u4E5D','\u521D\u5341','\u5341\u4E00','\u5341\u4E8C','\u5341\u4E09','\u5341\u56DB','\u5341\u4E94','\u5341\u516D','\u5341\u4E03','\u5341\u516B','\u5341\u4E5D','\u4E8C\u5341','\u5EFF\u4E00','\u5EFF\u4E8C','\u5EFF\u4E09','\u5EFF\u56DB','\u5EFF\u4E94','\u5EFF\u516D','\u5EFF\u4E03','\u5EFF\u516B','\u5EFF\u4E5D','\u4E09\u5341'];
		return MONTHS[m - 1] + (DAYS[day - 1] ?? '');
	} catch {
		return '';
	}
}


/** One original top-level chrome implementation; each View owns and unloads its instance. */
export class WorkbenchShell extends Component {

	private bannerState: BannerSettings;
	private bannerImg: HTMLImageElement | null = null;
	private bannerPh: HTMLElement | null = null;
	private noiseId: number | null = null;
	private pulseEls: { total: HTMLElement; pending: HTMLElement; today: HTMLElement; streak: HTMLElement } | null = null;
	private dateEl: HTMLElement | null = null;
	private adTitleEl: HTMLElement | null = null;
	private weekdayEl: HTMLElement | null = null;
	private lunarEl: HTMLElement | null = null;
	private isoWeekEl: HTMLElement | null = null;
	private monthProgressEl: HTMLElement | null = null;
	private yearProgressEl: HTMLElement | null = null;
	private adThemeBtn: HTMLElement | null = null;
	private owned: HTMLElement[] = [];
	private active: WorkbenchAction;
	private get app() { return this.plugin.app; }
	constructor(private plugin: Dashboard, private dashboardEl: HTMLElement, private navigate: (action: WorkbenchAction) => void | Promise<void>, active: WorkbenchAction, private diagnostics?: (root: HTMLElement) => void) {
		super(); this.active = active; this.bannerState = { ...DEFAULT_SETTINGS.banner, ...plugin.settings.banner };
	}
	onload(): void {
		const root = this.dashboardEl; const previous = new Set(Array.from(root.children)); const first = root.firstChild;
		this.applyTheme(); this.renderBanner(root); this.diagnostics?.(root); this.renderNoise(root);
		this.renderPulse(root); this.renderHeader(root, MOCK_DATA); this.renderActions(root);
		this.owned = Array.from(root.children).filter(e => !previous.has(e)) as HTMLElement[];
		if (first) for (const node of this.owned) root.insertBefore(node, first);
		this.plugin.pageShells.add(this); this.register(() => this.plugin.pageShells.delete(this));
		this.registerEvent(this.app.workspace.on('css-change', () => this.applyTheme()));
		const refresh = () => { this.plugin.shellTaskStore.invalidate(); void this.updatePulse(); };
		this.registerEvent(this.app.vault.on('create', refresh)); this.registerEvent(this.app.vault.on('delete', refresh));
		this.registerEvent(this.app.vault.on('modify', refresh)); this.registerEvent(this.app.vault.on('rename', refresh));
	}
	onunload(): void {
		if (this.noiseId !== null) window.cancelAnimationFrame(this.noiseId); this.noiseId = null;
		this.pulseEls = null; this.owned.forEach(el => el.remove()); this.owned = [];
		this.dashboardEl.querySelectorAll('.ad-toolbar, .ad-banner, .ad-banner__fileinput').forEach(el => el.remove());
	}
	setActive(action: WorkbenchAction): void {
		this.active = action;
		this.dashboardEl.querySelectorAll<HTMLElement>('.ad-toolbar__btn').forEach(btn => {
			const selected = btn.dataset.action === action;
			btn.toggleClass('is-active', selected);
			if (selected) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
		});
	}
	refreshNav(): void {
		this.dashboardEl.querySelector('.ad-toolbar')?.remove();
		this.renderActions(this.dashboardEl);
		const nav = this.dashboardEl.querySelector('.ad-toolbar');
		if (nav) this.dashboardEl.querySelector('.ad-header')?.after(nav);
	}
	refreshSettings(): void { this.applyTheme(); this.refreshTitle(); this.refreshBanner(); this.refreshNav(); }
	/** Theme actually in effect for the dashboard right now. */
	private effectiveTheme(): 'light' | 'dark' {
		const t = this.plugin.settings.theme;
		if (t === 'auto') return document.body.classList.contains('theme-light') ? 'light' : 'dark';
		return t;
	}

	private applyTheme(): void {
		const root = this.dashboardEl;
		if (root) root.setAttribute('data-theme', this.effectiveTheme());
		this.refreshThemeButton();
	}

	/** Keep the header toggle's icon/tooltip in sync with the effective theme. */
	refreshThemeButton(): void {
		const btn = this.adThemeBtn;
		if (!btn) return;
		const eff = this.effectiveTheme();
		btn.textContent = '';
		injectSvg(btn, eff === 'dark' ? ICON_sun : ICON_moon);
		btn.title = eff === 'dark' ? t('home.themeToLight') : t('home.themeToDark');
	}

	private renderBanner(root: HTMLElement): void {
		if (!this.plugin.settings.banner.enabled) return;
		const banner = root.createDiv({ cls: 'ad-banner ad-banner--empty' });
		const ph = banner.createDiv({ cls: 'ad-banner__ph', text: t('home.bannerPlaceholder') });
		this.bannerPh = ph;

		const img = banner.createEl('img', { cls: 'ad-banner__img ad-banner__img--hidden' });
		img.alt = '封面';
		this.bannerImg = img;

		// toolbar
		const bar = banner.createDiv({ cls: 'ad-banner__bar' });
		const pickBtn = bar.createEl('button', { cls: 'ad-banner__btn', text: t('home.changeImage') });

		// hidden file input
		const fileInput = root.createEl('input', { cls: 'ad-banner__fileinput', attr: { type: 'file', accept: 'image/*' } });

		// restore saved image
		if (this.bannerState.imageDataUrl && this.bannerImg && this.bannerPh) {
			this.displayBannerImage(this.bannerState.imageDataUrl, this.bannerState.offsetY);
		}

		// pick → read → open modal
		pickBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			fileInput.click();
		});

		fileInput.addEventListener('change', () => {
			const file = fileInput.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (ev) => {
				const dataUrl = ev.target?.result as string;
				this.openBannerModal(dataUrl, 0);
			};
			reader.readAsDataURL(file);
			fileInput.value = '';
		});

		// click image to re-adjust position
		img.addEventListener('click', (e) => {
			e.stopPropagation();
			if (this.bannerState.imageDataUrl) {
				this.openBannerModal(this.bannerState.imageDataUrl, this.bannerState.offsetY);
			}
		});
	}

	private openBannerModal(dataUrl: string, currentOffsetY: number): void {
		new BannerModal(
			this.app,
			dataUrl,
			currentOffsetY,
			(offsetY: number) => {
				this.bannerState.imageDataUrl = dataUrl;
				this.bannerState.offsetY = offsetY;
				void this.saveBanner().then(() => {
					this.displayBannerImage(dataUrl, offsetY);
				});
			},
		).open();
	}

	private displayBannerImage(dataUrl: string, offsetY: number): void {
		const img = this.bannerImg;
		const ph = this.bannerPh;
		if (!img || !ph) return;
		img.parentElement?.removeClass('ad-banner--empty');
		img.onload = () => {
			img.style.transform = `translateY(${offsetY}px)`;
		};
		img.src = dataUrl;
		img.removeClass('ad-banner__img--hidden');
		ph.addClass('ad-banner__ph--hidden');
	}

	private async saveBanner(): Promise<void> {
		// 保留设置中当前的 enabled（横幅开关可能在视图打开后被设置页改过）
		const enabled = this.plugin.settings.banner?.enabled ?? true;
		this.plugin.settings.banner = { ...this.bannerState, enabled };
		await this.plugin.saveSettings();
	}

	/** 设置页开关横幅后，立即重建横幅显隐（无需重载视图） */
	refreshBanner(): void {
		const root = this.dashboardEl;
		if (!root) return;
		const old = root.querySelector('.ad-banner');
		const enabled = !!this.plugin.settings.banner.enabled;
		this.bannerState = { ...DEFAULT_SETTINGS.banner, ...this.plugin.settings.banner };
		if (!enabled) {
			if (old) old.remove();
			root.querySelector('.ad-banner__fileinput')?.remove();
			this.bannerPh = null;
			this.bannerImg = null;
			return;
		}
		if (old) {
			if (this.bannerState.imageDataUrl) this.displayBannerImage(this.bannerState.imageDataUrl, this.bannerState.offsetY);
			else { old.addClass('ad-banner--empty'); this.bannerImg?.addClass('ad-banner__img--hidden'); this.bannerPh?.removeClass('ad-banner__ph--hidden'); }
			return;
		}
		this.bannerPh = null;
		this.bannerImg = null;
		this.bannerState = { ...DEFAULT_SETTINGS.banner, ...this.plugin.settings.banner };
		this.renderBanner(root);
		const nb = root.querySelector('.ad-banner');
		if (nb) root.insertBefore(nb, root.firstChild);
	}

	private renderNoise(root: HTMLElement): void {
		const canvas = root.createEl('canvas', { cls: 'ad-noise' });
		// Inline fallback so the grain overlay never occupies normal-flow space
		// (covers flex %-height quirks + CSS load-order issues).
		canvas.setCssProps({
			position: 'absolute',
			inset: '0',
			width: '100%',
			height: '100%',
			zIndex: '0',
			pointerEvents: 'none',
			imageRendering: 'pixelated',
			display: 'block',
		});
		const ctx = canvas.getContext('2d', { alpha: true });
		if (!ctx) return;
		const size = 1024;
		canvas.width = size;
		canvas.height = size;
		// disable antialiasing for crisp pixel edges
		ctx.imageSmoothingEnabled = false;
		let frame = 0;
		const draw = () => {
			if (frame % 2 === 0) {
				const img = ctx.createImageData(size, size);
				const d = img.data;
				for (let i = 0; i < d.length; i += 4) {
					const v = Math.random() * 255;
					d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 18;
				}
				ctx.putImageData(img, 0, 0);
			}
			frame++;
			this.noiseId = window.requestAnimationFrame(draw);
		};
		this.noiseId = window.requestAnimationFrame(draw);
	}


	private renderPulse(root: HTMLElement): void {
		const bar = root.createDiv({ cls: 'ad-pulse' });
		bar.createSpan({ cls: 'ad-pulse__tag', text: '[ 工作台概览 ]' });
		const total = bar.createSpan(); bar.createSpan({ cls: 'ad-pulse__sep', text: '·' });
		const pending = bar.createSpan(); bar.createSpan({ cls: 'ad-pulse__sep', text: '·' });
		const today = bar.createSpan(); bar.createSpan({ cls: 'ad-pulse__sep', text: '·' });
		const streak = bar.createSpan(); this.pulseEls = { total, pending, today, streak };
		void this.updatePulse();
	}
	async updatePulse(): Promise<void> {
		const elements = this.pulseEls; if (!elements) return;
		const now = new Date(); const counts = getVaultNoteCounts(this.app);
		const stats = calcHeatmapStats(counts, now.getFullYear(), now);
		elements.total.textContent = stats.total + ' 篇笔记';
		elements.today.textContent = '今日新增 +' + (counts.get(todayStr()) ?? 0);
		elements.streak.textContent = '连续 ' + stats.streak + ' 天';
		try {
			const tasks = await this.plugin.shellTaskStore.scanAllTasks();
			if (elements !== this.pulseEls) return;
			elements.pending.textContent = tasks.filter(t => t.status !== '已完成' && t.status !== '已取消').length + ' 待处理';
		} catch { if (elements === this.pulseEls) elements.pending.textContent = '0 待处理'; }
	}
	/** Live-update only the dashboard title text (cheap; no full re-render). */
	refreshTitle(): void {
		if (!this.adTitleEl) return;
		this.adTitleEl.textContent = this.resolvedDashboardTitle();
	}

	private resolvedDashboardTitle(): string {
		const custom = this.plugin.settings.dashboardTitle.trim();
		return !custom || custom === '我的工作台' || /xove\s*dashboard/i.test(custom) ? '夏知之 · 梦序' : custom;
	}

	/* ============================================================
	   Header
	   ============================================================ */
	private renderHeader(root: HTMLElement, d: DashboardData): void {
		const h = root.createEl('header', { cls: 'ad-header' });
		const left = h.createDiv({ cls: 'ad-header__left' });
		this.adTitleEl = left.createEl('h1', { cls: 'ad-title', text: this.resolvedDashboardTitle() });
		left.createEl('p', { cls: 'ad-subtitle', text: 'Obsidian · 个人系统 · v' + (this.plugin.manifest?.version ?? d.header.subtitle.replace(/^.*v/, 'v')) });

		const right = h.createDiv({ cls: 'ad-header__right' });

		const now = new Date();
		const summary = naturalTimeSummary(now);
		this.dateEl = right.createDiv({ cls: 'ad-header__date', text: summary.date });

		const meta = right.createDiv({ cls: 'ad-header__meta' });
		this.weekdayEl = meta.createSpan({ text: summary.weekday });
		meta.createSpan({ cls: 'ad-dot' });
		this.isoWeekEl = meta.createSpan({ text: `W${summary.isoWeek}` });
		if (!isEnglish()) {
			meta.createSpan({ cls: 'ad-dot' });
			this.lunarEl = meta.createSpan({ text: t('home.lunarPrefix') + getLunarDate(now) });
		}
		const progress = right.createDiv({ cls: 'wb-time-progress' });
		this.monthProgressEl = progress.createSpan({ text: `${summary.monthLabel} · ${summary.monthProgress}%` });
		this.yearProgressEl = progress.createSpan({ text: `${summary.yearLabel} · ${summary.yearProgress}%` });

		// Buttons row: theme toggle (left) + settings (right), same line
		const btns = right.createDiv({ cls: 'ad-header__btns' });

		const themeBtn = btns.createEl('button', { cls: 'ad-header__theme' });
		this.adThemeBtn = themeBtn;
		this.refreshThemeButton();
		themeBtn.addEventListener('click', () => { void (async () => {
			const next: 'light' | 'dark' = this.effectiveTheme() === 'light' ? 'dark' : 'light';
			// 手动切换主题时直接驱动 Obsidian 整体外观，仪表盘通过 'auto' 跟随。
			this.plugin.setObsidianTheme(next);
			this.plugin.settings.theme = 'auto';
			await this.plugin.saveSettings();
			this.plugin.refreshThemeButtons();
			this.applyTheme();
		})(); });

		const settings = btns.createEl('button', { cls: 'ad-header__settings', attr: { 'aria-label': t('home.settingsBtn') } });
		injectSvg(settings, ICON_gear);
		settings.addEventListener('click', () => {
			interface SettingApi { open(): void; openTabById(id: string): void }
			const app = this.app as unknown as { setting?: SettingApi };
			app.setting?.open();
			app.setting?.openTabById(this.plugin.manifest.id);
		});

		// Update time every 30 seconds
		this.registerInterval(window.setInterval(() => {
			const n = new Date();
			const current = naturalTimeSummary(n);
			if (this.dateEl) {
				this.dateEl.textContent = current.date;
			}
			if (this.weekdayEl) this.weekdayEl.textContent = current.weekday;
			if (this.isoWeekEl) this.isoWeekEl.textContent = `W${current.isoWeek}`;
			if (this.lunarEl) this.lunarEl.textContent = t('home.lunarPrefix') + getLunarDate(n);
			if (this.monthProgressEl) this.monthProgressEl.textContent = `${current.monthLabel} · ${current.monthProgress}%`;
			if (this.yearProgressEl) this.yearProgressEl.textContent = `${current.yearLabel} · ${current.yearProgress}%`;
		}, 30000));
	}

	private renderActions(root: HTMLElement): void {
		const nav = root.createEl('nav', { cls: 'ad-toolbar' });

		// 仅调整工作台导航标签，保留原有页面与数据行为。
		const navItems: Array<{ glyph: string; label: string; action: string; svg?: string }> = [
			{ glyph: '\u2302', label: '首页', action: 'home', svg: ICON_home },
			{ glyph: '\u25A4', label: '时迹', action: 'plan', svg: ICON_calendar },
			{ glyph: '\u203A', label: '进程', action: 'all', svg: ICON_allProjects },
		];
		if (this.plugin.settings.boardEnabled) {
			navItems.push({ glyph: '\u25C8', label: '收件箱', action: 'opportunity', svg: ICON_opportunity });
		}
		// 全局创建入口；内部 action key 保持兼容。
		const actionItems: Array<{ glyph: string; label: string; action: string; svg?: string }> = [
			{ glyph: '+', label: t('home.nav.newDiary'), action: 'diary', svg: ICON_newDiary },
			{ glyph: '\u25A1', label: t('home.nav.newTask'), action: 'task', svg: ICON_newTask },
			{ glyph: '\u25A3', label: t('home.nav.newProject'), action: 'project', svg: ICON_newProject },
		];

		const makeBtn = (it: { glyph: string; label: string; action: string; svg?: string }, extraCls = ''): HTMLElement => {
			const btn = nav.createEl('button', { cls: 'ad-toolbar__btn' + (extraCls ? ' ' + extraCls : '') });
			const glyphEl = btn.createSpan({ cls: 'ad-glyph' });
			if (it.svg) injectSvg(glyphEl, it.svg);
			else glyphEl.textContent = it.glyph;
			btn.createSpan({ text: it.label });
			btn.dataset.action = it.action;
			btn.addEventListener('click', () => {
				void Promise.resolve(this.navigate(it.action as WorkbenchAction)).catch(error => new Notice(t('home.openFailed') + String(error)));
			});
			return btn;
		};

		const navGroup = nav.createDiv({ cls: 'ad-toolbar__group' });
		navItems.forEach((it) => navGroup.appendChild(makeBtn(it)));
		nav.createDiv({ cls: 'ad-toolbar__sep' });
		const actGroup = nav.createDiv({ cls: 'ad-toolbar__group ad-toolbar__group--action' });
		actionItems.forEach((it) => actGroup.appendChild(makeBtn(it, 'ad-toolbar__btn--action')));
		makeBtn({ glyph: '\u25A6', label: '更多工具', action: 'classic' }, 'ad-toolbar__btn--more');
		this.setActive(this.active);
	}

}
