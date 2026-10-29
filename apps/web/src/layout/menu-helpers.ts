/** Hàm dựng mục menu dùng chung (menu lõi + menu từng phân hệ). */
import type { MenuItem } from '@ketoan/contracts';

/** Mục chưa làm: hiện trong menu, không có đường dẫn. */
export const soon = (key: string, label: string, code: string): MenuItem => ({ key, label, code });
/** Tiêu đề mục con trong một nhóm (không bấm được): gom các chức năng cùng loại, ví dụ "Nghiệp vụ", "Báo cáo". */
export const SECTION_PREFIX = 'sec:';
export const sec = (key: string, label: string): MenuItem => ({ key: SECTION_PREFIX + key, label });
export const isSection = (m: MenuItem) => m.key.startsWith(SECTION_PREFIX);
