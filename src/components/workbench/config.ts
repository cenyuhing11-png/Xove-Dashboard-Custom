export interface CompassLane {
	id: 'focus' | 'support' | 'maintain';
	label: string;
	items: string[];
}

/** Centralized now so a later settings UI can replace this without rewriting the view. */
export const LIFE_COMPASS: CompassLane[] = [
	{ id: 'focus', label: '主攻', items: ['设计', 'AI', '3D'] },
	{ id: 'support', label: '辅助推进', items: ['英语', '自媒体'] },
	{ id: 'maintain', label: '持续维护', items: ['阅读', '绘画', '摄影', '理财', '生活'] },
];

export const KNOWLEDGE_AREAS = [
	{ label: '收件箱', path: '00-收件箱' },
	{ label: '学习与资料', path: '01-学习与资料' },
	{ label: '最近思考', path: '02-知识与思考' },
] as const;
