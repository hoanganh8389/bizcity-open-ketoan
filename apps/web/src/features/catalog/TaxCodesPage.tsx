/**
 * Loại thuế (ACC43).
 */
// [2026-11-19 kiennt] NT-DM-012 — màn chỉ xem: loại thuế GTGT cố định theo quy định nhà nước (KCT, 0, 5, 8, 10, KKKN), dùng chung mua / bán,
// TK thuế theo Quy tắc hạch toán (ACC41). Bỏ Thêm / Sửa / Xoá / Nhập Excel; mã cũ (V…, R…) chỉ xem, kèm loại thay thế (đóng góp)
import { useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { errorText } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ghiChuHieuLuc, loaiDangDung, nhanLoai, type LoaiThue } from '@/lib/thueGtgt';

const NHOM: Record<string, string> = { KCT: 'Không chịu thuế', '0': '0%', '5': '5%', '8': '8%', '10': '10%', KKK: 'Không kê khai' };

const COT_DANG_DUNG: Column<LoaiThue>[] = [
  { key: 'code', header: 'Mã', type: 'code', width: 80 },
  { key: 'name', header: 'Loại thuế', width: 300 },
  { key: 'rate', header: 'Thuế suất', width: 110, value: (t) => nhanLoai(t) },
  { key: 'reportGroup', header: 'Nhóm bảng kê / tờ khai', width: 160, value: (t) => NHOM[t.reportGroup] ?? t.reportGroup },
  { key: 'hieuLuc', header: 'Hiệu lực', width: 140, value: (t) => ghiChuHieuLuc(t) || 'Không giới hạn' },
  { key: 'legalBasis', header: 'Căn cứ', width: 360, value: (t) => t.legalBasis ?? '' },
];
const COT_MA_CU: Column<LoaiThue>[] = [
  { key: 'code', header: 'Mã cũ', type: 'code', width: 90 },
  { key: 'name', header: 'Tên', width: 380 },
  { key: 'rate', header: 'Thuế suất', type: 'number', width: 90, showZero: true, render: (t) => `${t.rate}%` },
  { key: 'direction', header: 'Chiều cũ', width: 90, value: (t) => (t.direction === 'output' ? 'Đầu ra' : 'Đầu vào') },
  { key: 'accountCode', header: 'TK cũ', type: 'code', width: 80 },
  { key: 'replacedBy', header: 'Thay bằng', width: 120, value: (t) => t.replacedBy ?? 'chưa xác định' },
];

export function TaxCodesPage() {
  const q = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<LoaiThue[]>('/api/v1/tax-codes') });
  const [maCu, setMaCu] = useState(false);
  const exportRef = useRef<(() => void) | null>(null);
  const ds = q.data ?? [];
  const rows = maCu ? ds.filter((t) => t.isLegacy) : loaiDangDung(ds);
  return (
    <>
      <PageHeader title="Loại thuế" code="ACC43" subtitle="Loại thuế GTGT theo quy định nhà nước — dùng chung cho mua và bán" helpKey="loai-thue" />
      <div className="card">
        <div className="alert alert-info" style={{ marginBottom: 8 }}>
          Danh mục do phần mềm cấu hình sẵn theo quy định (Luật Thuế GTGT, nghị quyết giảm thuế) — <b>không thêm, sửa, xoá</b>; thuế suất thay đổi
          được cập nhật trong bản phần mềm mới. Một loại dùng cho cả phiếu mua và phiếu bán; tiền thuế ghi vào tài khoản ở <b>Quy tắc hạch toán (ACC41)</b>:
          mua hàng hoá, dịch vụ 1331 · mua tài sản cố định 1332 · bán ra 33311.
        </div>
        <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 6 }}>
          <label className="checkbox"><input type="checkbox" checked={maCu} onChange={(e) => setMaCu(e.target.checked)} /> Xem mã cũ (trước khi cố định — chỉ để đọc chứng từ đã ghi)</label>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm" onClick={() => q.refetch()}>Nạp</button>
          <button type="button" className="btn btn-sm" onClick={() => exportRef.current?.()}>Xuất</button>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey={maCu ? 'acc43-ma-cu' : 'acc43-v3'}
            exportName={maCu ? 'loai-thue-ma-cu' : 'loai-thue'}
            exportRef={exportRef}
            rows={rows}
            rowKey={(t) => t.code}
            footerLabel={false}
            columns={maCu ? COT_MA_CU : COT_DANG_DUNG}
          />
        )}
      </div>
    </>
  );
}
