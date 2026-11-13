// @bizcity-layer P ui-kit
// [2026-11-12 10:00 PM Võ Hoàng] POS-UIKIT — BIZCITY-EXTENSION 1.4.0-draft §3b: bảng lưới, thẻ chỉ số, bộ tham số kỳ / chi nhánh, ô chọn cho màn module (đóng góp)
/**
 * Phần mở rộng 1.4.0-draft của @bizcity/ui-kit (BIZCITY-EXTENSION §3b). Như các thành phần cũ: ở đây chỉ có CHỮ KÝ (hợp đồng) và
 * hàm chuyển; bản thật là chính thành phần Core (DataGrid, KpiCards, FilterLayout…) do khung giao diện đăng ký bằng provideUiKit.
 * Props là TẬP CON của thành phần Core — Core thêm props mới không làm vỡ module; muốn dùng thêm props thì thêm vào hợp đồng.
 */
import type { ComponentType, ReactNode } from 'react';

/** Kiểu cột — đúng ColType của DataGrid Core. */
export type GridColType = 'text' | 'code' | 'number' | 'money' | 'price' | 'qty' | 'date' | 'check';

export interface GridColumn<T> {
  key: string;
  header: ReactNode;
  type?: GridColType;
  /** Giá trị dùng để lọc / sắp xếp / xuất Excel (mặc định đọc row[key]). */
  value?: (row: T) => string | number | boolean | null | undefined;
  render?: (row: T) => ReactNode;
  /** Cộng dòng tổng cuối bảng. */
  sum?: boolean;
  width?: number;
  hidden?: boolean;
  noFilter?: boolean;
  noSort?: boolean;
  bold?: boolean | ((row: T) => boolean);
}

export interface DataGridProps<T> {
  rows: T[];
  columns: GridColumn<T>[];
  rowKey: (row: T, index: number) => string;
  /** Khoá nhớ độ rộng / cột ẩn theo máy (vd `pos.don-ban`). */
  storageKey?: string;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  emptyText?: string;
  maxHeight?: string;
  /** Tên tệp / tiêu đề khi Xuất Excel (định dạng chuẩn của phần mềm). */
  exportName?: string;
  exportTitle?: string;
  /** Nhãn dòng tổng; false = không có dòng tổng. */
  footerLabel?: string | false;
  note?: ReactNode;
}

export interface KpiItem {
  key: string;
  label: string;
  value: number | null | undefined;
  tone?: 'ok' | 'warn' | 'bad' | 'info';
  onClick?: () => void;
}
export interface KpiCardsProps { items: KpiItem[]; at?: string | number | Date | null }

/** Bộ tham số đã lưu (docs/cap-nhat-ux/07-bo-tham-so-bao-cao.md): màn đưa state đang xem và hàm đặt lại. */
export interface SavedParams { value: object; onApply: (v: never) => void; id?: string }
export interface FilterLayoutProps { filters: ReactNode; children: ReactNode; onSearch?: () => void; boThamSo?: SavedParams }
export interface PeriodFieldProps { from: string; to: string; onChange: (from: string, to: string) => void }
/** `value`: mã chi nhánh cách nhau dấu phẩy (rỗng = tất cả). */
export interface BranchCheckListProps { value: string; onChange: (v: string) => void }
export interface PickerProps { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }

/** Bản thật khung giao diện cung cấp (thêm vào UiKitImpl). */
export interface UiKitGridImpl {
  // Kiểu tổng quát hoá: bản thật là DataGrid<T> của Core.
  DataGrid: ComponentType<DataGridProps<never>>;
  KpiCards: ComponentType<KpiCardsProps>;
  FilterLayout: ComponentType<FilterLayoutProps>;
  PeriodField: ComponentType<PeriodFieldProps>;
  BranchCheckList: ComponentType<BranchCheckListProps>;
  ItemPicker: ComponentType<PickerProps>;
  BranchPicker: ComponentType<PickerProps>;
}
