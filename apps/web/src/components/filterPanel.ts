/**
 * Ngữ cảnh "đang nằm trong bảng lọc bên trái" (FilterLayout).
 * Ô lọc dùng chung (DateRange, BranchSelect…) đọc ngữ cảnh này để tự đổi cách hiện:
 *   - xếp dọc nhãn bên trái, ô bên phải;
 *   - chi nhánh thành danh sách tích chọn, chỉ áp dụng khi bấm "Tìm kiếm" (register).
 */
import { createContext, useContext } from 'react';

export interface FilterPanelContext {
  /** Đăng ký việc cần làm khi bấm Tìm kiếm; trả false để chặn tìm (ví dụ chưa chọn chi nhánh). Trả về hàm huỷ đăng ký. */
  register: (apply: () => boolean | void) => () => void;
}

export const FilterPanelCtx = createContext<FilterPanelContext | null>(null);
export const useFilterPanel = () => useContext(FilterPanelCtx);
