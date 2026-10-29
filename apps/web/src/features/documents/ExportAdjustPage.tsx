/**
 * Danh sách Phiếu xuất điều chỉnh (BH06, phân hệ Bán hàng): xuất dùng nội bộ, tặng, dùng thử, huỷ hỏng… do cửa hàng lập (bill giấy, không
 * hoá đơn điện tử). Chứng từ là phiếu bán NỘI BỘ có lý do xuất (sourceRef.type = export_adjust), không tính vào báo cáo
 * bán hàng. Bảng lọc trái: Từ ngày, Đến ngày, Chi nhánh; bấm một dòng mở chi tiết phiếu (xem trước / định khoản).
 * In: tích các phiếu, bấm In (phiếu điều chỉnh giảm, phiếu xuất kho 02-VT — ExportAdjustPrint.tsx).
 */
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, ALL_ROWS } from '@/lib/api';
import type { Column } from '@/components/DataGrid';
import { VoucherListPage, dateTimeShort, useListFilter } from '@/components/voucher/VoucherListPage';
import { DocumentDetail } from './DocumentDetail';
import { PrintButton } from '@/components/print';
import { EXPORT_ADJUST_TEMPLATES, loadExportAdjust } from './ExportAdjustPrint';

interface Row {
  id: string; docKey: string; docNo: string; docDate: string; total: number; status: string; postedVersion: number | null; version: number;
  cancelRequestedAt: string | null; branchCode: string; branchName: string; partnerCode: string | null; partnerName: string | null;
  description: string; reasonCode: string; employeeName: string; createdAt: string | null;
}
interface Reason { code: string; name: string }

const STATUS: Record<string, string> = { pending: 'Chờ định khoản', posted: 'Đã định khoản', error: 'Lỗi định khoản', cancelled: 'Đã huỷ' };
const statusOf = (r: Row) => (r.cancelRequestedAt && r.status === 'pending' ? 'Chờ huỷ'
  : r.status === 'posted' && r.postedVersion !== null && r.version > r.postedVersion ? 'Chờ định khoản lại' : STATUS[r.status] ?? r.status);

export function ExportAdjustPage() {
  const filter = useListFilter();
  const { f } = filter;
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reasons = useQuery({ queryKey: ['reasons'], queryFn: () => api.get<Reason[]>('/api/v1/posting/reasons'), staleTime: 60_000 }).data ?? [];
  const reasonName = (code: string) => reasons.find((x) => x.code === code)?.name ?? '';

  const q = useQuery({
    queryKey: ['documents', 'export-adjust', f],
    queryFn: async () => (await api.getPage<Row[]>('/api/v1/documents', {
      from: f.from, to: f.to, branchCodes: f.branchCodes || undefined, docType: 'sale', sourceType: 'export_adjust', voucherInfo: true, pageSize: ALL_ROWS,
    })).data,
    placeholderData: keepPreviousData,
  });

  const columns: Column<Row>[] = [
    { key: 'docDate', header: 'Ngày', type: 'date' },
    { key: 'docNo', header: 'Số phiếu', type: 'code' },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
    { key: 'branchName', header: 'Tên chi nhánh' },
    { key: 'reasonCode', header: 'Lý do', type: 'code' },
    { key: 'reasonName', header: 'Tên lý do', value: (r) => reasonName(r.reasonCode) },
    { key: 'partnerName', header: 'Đối tượng', value: (r) => r.partnerName ?? '' },
    { key: 'description', header: 'Diễn giải' },
    { key: 'total', header: 'Tổng tiền', type: 'money', sum: true, showZero: true },
    { key: 'status', header: 'Trạng thái', value: statusOf },
    { key: 'employeeName', header: 'Nhân viên', hidden: true },
    { key: 'createdAt', header: 'Ngày nhận', value: (r) => dateTimeShort(r.createdAt), hidden: true },
  ];

  return (
    <VoucherListPage
      title="Phiếu xuất điều chỉnh" code="BH06" subtitle="Xuất dùng nội bộ, tặng, dùng thử, huỷ hỏng… của cửa hàng — không tính vào báo cáo bán hàng" helpKey="export-adjust"
      filter={filter} query={{ ...q, queryKey: ['documents', 'export-adjust'] }} columns={columns} storageKey="export-adjust-list" canWrite={false}
      notice={notice} setNotice={setNotice} addButtons={[]}
      emptyText="Không có phiếu xuất điều chỉnh trong khoảng đã chọn."
      onOpen={(r) => setOpenId(r.id)}
      extraPanel={(picked) => <PrintButton screen="BH06" templates={EXPORT_ADJUST_TEMPLATES} label="In các phiếu đã chọn" disabled={!picked.length} getDocs={() => Promise.all(picked.map((r) => loadExportAdjust(r.id, reasonName)))} />}
      extraToolbar={(picked) => <PrintButton bare screen="BH06" templates={EXPORT_ADJUST_TEMPLATES} disabled={!picked.length} title="In các phiếu đã tích" getDocs={() => Promise.all(picked.map((r) => loadExportAdjust(r.id, reasonName)))} />}
    >
      {openId && <DocumentDetail id={openId} onClose={() => setOpenId(null)} />}
    </VoucherListPage>
  );
}
