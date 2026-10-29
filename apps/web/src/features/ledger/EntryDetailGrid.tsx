/**
 * Lưới dòng hạch toán chi tiết — MỘT bộ cột dùng chung cho "Thông tin hạch toán chi tiết" (bấm dòng sổ) và thẻ "Bút toán"
 * của modal chứng từ gốc: Bộ phận, Hợp đồng, Khoản mục, Tài khoản, Nợ, Có, Mã lưu chuyển tiền tệ, Ghi chú, Mã hàng, Tên hàng,
 * Mã / Tên nhân viên, KH/NCC (ẩn sẵn: Tên tài khoản, Loại thuế; bấm "Cột" để hiện). Đổi cột ở đây, hai nơi đổi theo.
 */
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import type { EntryLine } from './EntryLinesTable';

export interface DetailLine extends EntryLine {
  partnerCode: string | null; productSku: string | null; productName: string | null;
  department: string; contract: string; costItem: string; employeeCode: string; employeeName: string; flowCode: string;
}

export const DETAIL_COLUMNS: Column<DetailLine>[] = [
  { key: 'department', header: 'Bộ phận', type: 'code' },
  { key: 'contract', header: 'Hợp đồng', type: 'code' },
  { key: 'costItem', header: 'Khoản mục', type: 'code' },
  { key: 'accountCode', header: 'Tài khoản', type: 'code', render: (l) => <span title={l.accountName}>{l.accountCode}</span> },
  { key: 'debit', header: 'Nợ', type: 'money', sum: true },
  { key: 'credit', header: 'Có', type: 'money', sum: true },
  { key: 'flowCode', header: 'Mã lưu chuyển tiền tệ', type: 'code' },
  { key: 'description', header: 'Ghi chú' },
  { key: 'productSku', header: 'Mã hàng', type: 'code' },
  { key: 'productName', header: 'Tên hàng' },
  { key: 'employeeCode', header: 'Mã nhân viên', type: 'code' },
  { key: 'employeeName', header: 'Tên nhân viên' },
  { key: 'partnerCode', header: 'KH/NCC', type: 'code' },
  { key: 'partnerName', header: 'Tên KH/NCC' },
  { key: 'accountName', header: 'Tên tài khoản', hidden: true },
  { key: 'taxCode', header: 'Loại thuế', type: 'code', hidden: true },
];

export function EntryDetailGrid({ lines, storageKey = 'entry-detail', compact }: { lines: DetailLine[]; storageKey?: string; compact?: boolean }) {
  return <DataGrid storageKey={storageKey} compact={compact} rows={lines} rowKey={(l) => String(l.lineNo)} columns={DETAIL_COLUMNS} />;
}

/** Dòng hạch toán chi tiết của một bút toán (tự tải theo id) — dùng trong thẻ Bút toán của modal chứng từ. */
export function EntryLinesById({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['entry', id], queryFn: () => api.get<{ lines: DetailLine[] }>(`/api/v1/ledger/entries/${id}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  // Cùng storageKey với "Thông tin hạch toán chi tiết": cột ẩn / hiện, độ rộng chọn một lần dùng chung.
  return <EntryDetailGrid lines={q.data?.lines ?? []} compact />;
}
