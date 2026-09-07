/** Physical folders only. Display labels, filenames and Properties stay unprefixed. */
export const PLAN_ROOT = '05-计划';
export const JOURNAL_ROOT = '04-日记与复盘';
export const PROJECT_ROOT = '03-项目与成果';
export const INBOX_ROOT = '00-收件箱';
export const LEARNING_ROOT = '01-学习与资料';
export const KNOWLEDGE_ROOT = '02-知识与思考';
export const LEARNING_FOLDERS = { course: '课程', film: '电影', book: '书籍', video: '视频', article: '文章' } as const;
export const PLAN_FOLDERS = { year: '02-年度', quarter: '03-季度', month: '04-月度', week: '05-周计划' } as const;
export const JOURNAL_FOLDERS = { day: '01-日记', week: '02-周记', month: '03-月度复盘', year: '04-年度复盘' } as const;
export const DIRECTION_ROOT = `${PLAN_ROOT}/01-人生方向`;
export const DIARY_FOLDER = `${JOURNAL_ROOT}/${JOURNAL_FOLDERS.day}`;
