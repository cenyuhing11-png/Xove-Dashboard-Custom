/** Legacy-created task files carry task type/status; plain reference notes do not. */
export function isLegacyTaskProperties(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const fm = value as Record<string, unknown>;
	if (fm['类型'] && fm['类型'] !== '普通' && fm['类型'] !== '重复') return false;
	return fm['类型'] === '普通' || fm['类型'] === '重复' || ['待办', '进行中', '已阻塞', '已完成', '已取消'].includes(String(fm['状态'] ?? ''));
}
