// [2026-11-11 Nguyễn Văn Thủy] DANH SÁCH TRÊN – DƯỚI: chi tiết dòng của phiếu đang chọn (đóng góp)
/**
 * Nửa dưới của danh sách chứng từ: các dòng hạch toán của phiếu đang chọn (Diễn giải, TK Nợ, TK Có, Số tiền, Đối tượng, Khoản mục…).
 * Đọc GET /api/v1/documents/:id (payload.lines). Thu gọn được (nhớ theo máy).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { DataGrid } from '@/components/DataGrid';

interface Line { debitAccount: string; creditAccount: string; amount: number; description?: string; partnerCode?: string; costItem?: string; department?: string; taxCode?: string; taxAmount?: number; invoiceNo?: string }
interface Doc { docNo: string; payload: { partnerCode?: string; lines: Line[] } }
const KEY = 'ketoan.ct-duoi.gon';

export function ChiTietChungTu({ id }: { id: string | null }) {
  const [gon, setGon] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const flip = () => setGon((v) => { try { localStorage.setItem(KEY, v ? '0' : '1'); } catch { /* bỏ qua */ } return !v; });
  const q = useQuery({ queryKey: ['document', id], queryFn: () => api.get<Doc>(`/api/v1/documents/${id}`), enabled: Boolean(id) && !gon, staleTime: 30_000 });
  const lines = (q.data?.payload.lines ?? []).map((l, i) => ({ ...l, i: i + 1, partnerCode: l.partnerCode || q.data?.payload.partnerCode || '' }));
  return (
    <div className="card ct-duoi">
      <button type="button" className="ct-duoi-head" onClick={flip} title={gon ? 'Mở phần chi tiết' : 'Thu gọn phần chi tiết'}>
        <b>Chi tiết{q.data ? ` · ${q.data.docNo}` : ''}</b>
        <span className="muted">{id ? 'bấm đúp phiếu ở trên để mở' : 'bấm một phiếu ở trên để xem dòng hạch toán'}</span>
        {gon ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {!gon && id && (
        <DataGrid
          storageKey="ct-duoi-v1" rows={lines} rowKey={(l) => String(l.i)} maxHeight="210px" footerLabel="Cộng"
          emptyText={q.isLoading ? 'Đang tải…' : 'Phiếu không có dòng'}
          columns={[
            { key: 'i', header: '#', type: 'number', width: 40 },
            { key: 'description', header: 'Diễn giải', width: 320 },
            { key: 'debitAccount', header: 'TK Nợ', type: 'code', width: 90 },
            { key: 'creditAccount', header: 'TK Có', type: 'code', width: 90 },
            { key: 'amount', header: 'Số tiền', type: 'money', sum: true, width: 130 },
            { key: 'partnerCode', header: 'Đối tượng', type: 'code', width: 130 },
            { key: 'costItem', header: 'Khoản mục', type: 'code', width: 110 },
            { key: 'department', header: 'Bộ phận', type: 'code', width: 110 },
            { key: 'taxCode', header: 'Thuế', type: 'code', width: 80 },
            { key: 'taxAmount', header: 'Tiền thuế', type: 'money', width: 110 },
            { key: 'invoiceNo', header: 'Số HĐ', type: 'code', width: 100 },
          ]}
        />
      )}
    </div>
  );
}
