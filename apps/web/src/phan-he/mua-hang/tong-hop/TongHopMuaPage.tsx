/**
 * TỔNG HỢP MUA HÀNG (MH11) — phiếu đã duyệt trong kỳ, gom theo nhà cung cấp / nhãn hàng / ngành hàng / nhóm hàng / mã hàng /
 * chi nhánh: SL mua, SL tặng, tiền hàng trước CK, chiết khấu, giá trị nhập, thuế, hàng trả, chi phí phân bổ, thưởng / CK sau
 * mua, giá trị thuần, giá vốn thực tế / ĐVT (theo mã), còn nợ NCC (phần chưa trả của phiếu nhập chia theo giá trị dòng).
 * Bấm số ở cột "Số phiếu" (hoặc bấm đúp dòng) → danh sách phiếu của dòng, bấm số phiếu mở phiếu ở MH11.
 * Nằm trong MH11 (kiểu xem "Gom theo NCC / chi nhánh / mã…"), kỳ lấy từ bộ lọc bên trái của MH11.
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading } from '@/components/ui';
import { PrintButton } from '@/components/print';
import { buyTemplates } from '../mauIn/baoCaoMua';
import { KIND_LABEL, P, useNames } from '../du-lieu';
import { dmy } from '../chung';
import '../mua-hang.css';

type GroupBy = 'partner' | 'brand' | 'industry' | 'group' | 'sku' | 'branch';
interface Row { key: string; label: string; name: string; baseUnit: string; invoiceUnit: string; invoiceQty: number | null; invoiceQtyText: string; buyQty: number; giftQty: number; returnQty: number; gross: number; discount: number; net: number; tax: number; returns: number; cost: number; rebate: number; value: number; unitCost: number | null; openDebt: number; documents: number; docList: { id: string; docNo: string; kind: string; docDate: string }[] }
const GROUPS: [GroupBy, string][] = [['sku', 'Mã hàng'], ['group', 'Nhóm hàng'], ['industry', 'Ngành hàng'], ['brand', 'Nhãn hàng'], ['partner', 'Nhà cung cấp'], ['branch', 'Chi nhánh']];

export function TongHopTheoNhom({ from, to }: { from: string; to: string }) {
  const names = useNames();
  const [groupBy, setGroupBy] = useState<GroupBy>('sku');
  const exportRef = useRef<(() => void) | null>(null);
  const [sel, setSel] = useState<Row | null>(null);
  const q = useQuery({ queryKey: ['mua-hang', 'summary', groupBy, from, to], queryFn: () => api.get<{ rows: Row[] }>(`${P}/summary`, { ...(from ? { from } : {}), ...(to ? { to } : {}), groupBy }) });
  // Mã và tên tách hai cột (mã hàng / nhóm / ngành / nhãn: tên từ máy chủ; NCC, chi nhánh: tên từ danh mục).
  const nameOf = (r: Row) => (groupBy === 'partner' ? names.partnerName(r.key) : groupBy === 'branch' ? names.branchName(r.key) : r.name);
  const label = (r: Row) => [r.key, nameOf(r)].filter(Boolean).join(' — ');
  const what = GROUPS.find((g) => g[0] === groupBy)![1].toLowerCase();
  const columns: Column<Row>[] = [
    { key: 'key', header: groupBy === 'sku' ? 'Mã hàng' : `Mã ${what}`, type: 'code', width: 110, value: (r) => r.key },
    { key: 'name', header: groupBy === 'sku' ? 'Tên hàng' : `Tên ${what}`, width: 260, value: nameOf },
    { key: 'baseUnit', header: 'ĐVT nhỏ nhất', width: 80, title: 'ĐVT nhỏ nhất của mặt hàng (tỉ lệ 1) — các cột SL tính theo ĐVT này' },
    { key: 'buyQty', header: 'SL mua', type: 'qty', width: 80, sum: groupBy === 'sku', title: 'SL mua quy về ĐVT nhỏ nhất' },
    { key: 'giftQty', header: 'SL tặng', type: 'qty', width: 80, sum: groupBy === 'sku', title: 'SL hàng tặng quy về ĐVT nhỏ nhất' },
    { key: 'returnQty', header: 'SL trả', type: 'qty', width: 70, sum: groupBy === 'sku', title: 'SL trả NCC quy về ĐVT nhỏ nhất' },
    { key: 'invoiceUnit', header: 'ĐVT trên hoá đơn', width: 100, title: 'ĐVT ghi trên phiếu / hoá đơn NCC (nhiều ĐVT thì liệt kê)' },
    { key: 'invoiceQty', header: 'SL mua theo hoá đơn', type: 'qty', width: 120, value: (r) => r.invoiceQty ?? r.invoiceQtyText, render: (r) => (r.invoiceQty !== null ? r.invoiceQty.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) : <span title="Mua theo nhiều ĐVT">{r.invoiceQtyText}</span>), title: 'SL mua đúng như trên hoá đơn (theo ĐVT trên hoá đơn)' },
    { key: 'gross', header: 'Tiền hàng trước CK', type: 'money', width: 130, sum: true },
    { key: 'discount', header: 'Chiết khấu', type: 'money', width: 110, sum: true },
    { key: 'net', header: 'Giá trị nhập', type: 'money', width: 130, sum: true },
    { key: 'tax', header: 'Thuế GTGT', type: 'money', width: 110, sum: true },
    { key: 'returns', header: 'Hàng trả lại', type: 'money', width: 110, sum: true },
    { key: 'cost', header: '+ Chi phí phân bổ', type: 'money', width: 120, sum: true },
    { key: 'rebate', header: '− Thưởng / CK sau mua', type: 'money', width: 130, sum: true },
    { key: 'value', header: 'Giá trị thuần', type: 'money', width: 130, sum: true, bold: true },
    ...(groupBy === 'sku' ? [{ key: 'unitCost', header: 'Giá vốn TT / ĐVT', type: 'price', width: 120 } as Column<Row>] : []),
    { key: 'openDebt', header: 'Còn nợ NCC', type: 'money', width: 120, sum: true },
    { key: 'documents', header: 'Số phiếu', type: 'number', width: 70, render: (r) => <button type="button" className="btn btn-xs" title="Xem các phiếu của dòng này" onClick={() => setSel(r)}>{r.documents}</button> },
  ];
  return (
    <>
        <div className="tabs" style={{ marginBottom: 0 }}>{GROUPS.map(([k, l]) => <button key={k} className={`tab ${groupBy === k ? 'active' : ''}`} onClick={() => setGroupBy(k)}>Theo {l.toLowerCase()}</button>)}</div>
        <div className="filters">
          <button className="btn btn-sm" onClick={() => exportRef.current?.()}>Xuất Excel</button>
          <PrintButton small screen="MH11" templates={buyTemplates(groupBy)} disabled={!q.data}
            getDocs={() => (q.data ? [{ from, to, groupBy, groupLabel: GROUPS.find((g) => g[0] === groupBy)![1], rows: q.data.rows.map((r) => ({ ...r, label: label(r) })) }] : [])} />
          <span className="muted" style={{ fontSize: 12 }}>Chỉ phiếu đã duyệt (đã vào sổ), kỳ theo Từ ngày / Đến ngày bên trái (bộ lọc NCC, chi nhánh, trạng thái không áp cho kiểu này). Tiền trước thuế.</span>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey={`mh-tong-hop-${groupBy}`} exportName={`tong-hop-mua-hang-${groupBy}`} exportRef={exportRef} rows={q.data?.rows ?? []} rowKey={(r) => r.key} columns={columns} footerLabel="Cộng" emptyText="Không có phiếu đã duyệt trong kỳ" onRowDoubleClick={(r) => setSel(r)} />
        )}
        {sel && (
          <div className="mh-panel" style={{ margin: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>Phiếu của: {label(sel)} — {sel.docList.length} phiếu</h4>
              <button className="btn btn-sm" onClick={() => setSel(null)}>Đóng</button>
            </div>
            <table className="mh-mini" style={{ marginTop: 6 }}><thead><tr><th>Ngày</th><th>Số phiếu</th><th>Loại</th></tr></thead><tbody>
              {sel.docList.map((d) => <tr key={d.id}><td>{dmy(d.docDate)}</td><td className="mono"><Link to={`/mua-hang/chung-tu?mo=${encodeURIComponent(d.id)}`} title="Mở phiếu">{d.docNo}</Link></td><td>{KIND_LABEL[d.kind as keyof typeof KIND_LABEL] ?? d.kind}</td></tr>)}
            </tbody></table>
          </div>
        )}
    </>
  );
}
