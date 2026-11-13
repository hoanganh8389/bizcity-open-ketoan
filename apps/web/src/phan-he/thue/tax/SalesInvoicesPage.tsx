// [2026-11-11 Nguyễn Văn Thủy] Bảng kê hoá đơn, chứng từ HHDV bán ra / mua vào (mẫu quản trị) — làm lại theo chuẩn (đóng góp)
/**
 * Bảng kê hoá đơn, chứng từ hàng hoá, dịch vụ bán ra (ACC65) / mua vào (ACC64) — mẫu quản trị.
 *   Tham số: kỳ, cộng gộp theo từng hoá đơn, lấy ĐVT / số lượng / đơn giá; nhiều chi nhánh (lớp gắn thêm): chọn chi nhánh,
 *   tách theo chi nhánh — chỉ hiện khi đơn vị có từ 2 chi nhánh.
 *   Bảng: nhóm HHDV (nhãn theo phụ lục 01-1/GTGT, 01-2/GTGT), dòng "Cộng nhóm", "Tổng cộng". Bấm số hoá đơn mở chứng từ.
 *   In: mẫu quản trị, phụ lục 01-1/GTGT (01-2/GTGT) — mauIn/bangKeThue.tsx.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { date as fmtDate, defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange, useBranches } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { PrintButton } from '@/components/print';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { taxInvoiceTemplates, type TaxInvoiceRow, type TaxInvoiceGroup } from '../mauIn/bangKeThue';

interface Data { groups: TaxInvoiceGroup[]; totals: { amount: number; tax: number; invoices: number } }
type GridRow = Partial<TaxInvoiceRow> & { kind: 'data' | 'group' | 'subtotal'; key: string; label?: string; counted: boolean; amount: number; tax: number };

/** Chia các nhóm HHDV theo chi nhánh (lớp nhiều chi nhánh): mỗi chi nhánh một khối nhóm riêng. */
export function tachChiNhanh(groups: TaxInvoiceGroup[]): { branch: string; groups: TaxInvoiceGroup[] }[] {
  const map = new Map<string, TaxInvoiceGroup[]>();
  for (const g of groups) for (const r of g.rows) {
    const list = map.get(r.branchCode) ?? [];
    map.set(r.branchCode, list);
    let gg = list.find((x) => x.group === g.group);
    if (!gg) { gg = { ...g, rows: [], amount: 0, tax: 0 }; list.push(gg); }
    gg.rows.push(r);
    gg.amount = Math.round((gg.amount + r.amount) * 100) / 100;
    gg.tax = Math.round((gg.tax + r.tax) * 100) / 100;
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([branch, gs]) => ({ branch, groups: gs }));
}

/** `direction`: 'output' = bán ra (mặc định), 'input' = mua vào. */
export function SalesInvoicesPage({ direction = 'output' }: { direction?: 'output' | 'input' }) {
  const input = direction === 'input';
  const { data: branches = [] } = useBranches();
  const multi = branches.length > 1;
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '', direction, merge: false, unitQty: false, split: false });
  const [docId, setDocId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['sales-invoices', f.from, f.to, f.branchCodes, direction, f.merge], queryFn: () => api.get<Data>('/api/v1/reports/sales-invoices', { from: f.from, to: f.to, branchCodes: f.branchCodes, direction, merge: f.merge ? '1' : '0' }) });
  const d = q.data;
  const blocks = useMemo(() => (d ? (multi && f.split ? tachChiNhanh(d.groups) : [{ branch: '', groups: d.groups }]) : []), [d, multi, f.split]);
  const branchName = (c: string) => branches.find((b) => b.code === c)?.name ?? c;

  const rows: GridRow[] = blocks.flatMap((b) => [
    ...(b.branch ? [{ kind: 'group' as const, key: `cn-${b.branch}`, label: `Chi nhánh: ${b.branch} - ${branchName(b.branch)}`, counted: false, amount: 0, tax: 0 }] : []),
    ...b.groups.flatMap((g): GridRow[] => [
      { kind: 'group', key: `${b.branch}-h-${g.group}`, label: `Nhóm HHDV${input ? ' mua vào' : ''}: ${g.label || 'Không thuộc nhóm kê khai (không cộng vào tổng)'} (${g.rows.length})`, counted: g.counted, amount: 0, tax: 0 },
      ...g.rows.map((r, i) => ({ ...r, kind: 'data' as const, key: `${b.branch}-${g.group}-${r.invoiceNo}-${r.docNo}-${i}`, counted: g.counted })),
      { kind: 'subtotal', key: `${b.branch}-t-${g.group}`, label: 'Cộng nhóm', counted: g.counted, amount: g.amount, tax: g.tax },
    ]),
  ]);
  const columns: Column<GridRow>[] = [
    { key: 'invoiceNo', header: 'Số hóa đơn', type: 'code', width: 110, render: (r) => (r.kind === 'data' ? <a onClick={() => r.sourceDocumentId && setDocId(r.sourceDocumentId)}>{r.invoiceNo}</a> : r.kind === 'subtotal' ? r.label : '') },
    { key: 'invoiceDate', header: 'Ngày hóa đơn', type: 'date', width: 100 },
    { key: 'buyerName', header: input ? 'Tên người bán' : 'Tên người mua', width: 230 },
    { key: 'buyerTaxCode', header: input ? 'Mã số thuế người bán' : 'Mã số thuế người mua', type: 'code', width: 130 },
    { key: 'itemName', header: 'Mặt hàng', width: 220, value: (r) => (r.kind === 'data' ? (r.itemCount && r.itemCount > 1 ? `${r.itemName} và ${r.itemCount - 1} mặt hàng khác` : r.itemName ?? '') : '') },
    ...(f.unitQty ? [
      { key: 'unit', header: 'ĐVT', width: 70 },
      { key: 'qty', header: 'Số lượng', type: 'number', width: 90 },
      { key: 'price', header: 'Đơn giá', type: 'money', width: 110 },
    ] as Column<GridRow>[] : []),
    { key: 'amount', header: input ? 'Giá trị HHDV mua vào chưa có thuế' : 'Doanh số bán chưa có thuế GTGT', type: 'money', width: 150, showZero: true,
      value: (r) => (r.kind === 'group' ? null : r.amount), footerValue: () => d?.totals.amount ?? 0 },
    { key: 'taxRate', header: 'Thuế suất', width: 80, value: (r) => (r.kind === 'data' ? `${r.taxRate} %` : '') },
    { key: 'tax', header: 'Thuế GTGT', type: 'money', width: 130, showZero: true, value: (r) => (r.kind === 'group' ? null : r.tax), footerValue: () => d?.totals.tax ?? 0 },
    { key: 'taxAccount', header: 'Tài khoản thuế', type: 'code', width: 90 },
    { key: 'docNo', header: 'Số chứng từ', type: 'code', width: 110, hidden: true },
    { key: 'docDate', header: 'Ngày chứng từ', type: 'date', width: 100, hidden: true },
    { key: 'invoiceSerial', header: 'Ký hiệu', type: 'code', width: 90, hidden: true },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 90, hidden: !multi },
  ];
  const ky = `Từ ngày ${fmtDate(f.from)} đến ngày ${fmtDate(f.to)}`;

  return (
    <>
      <PageHeader title={input ? 'Bảng kê hóa đơn, chứng từ hàng hóa, dịch vụ mua vào' : 'Bảng kê hóa đơn, chứng từ hàng hóa, dịch vụ bán ra'} code={input ? 'ACC64' : 'ACC65'}
        helpKey={input ? 'bang-ke-mua-vao' : 'bang-ke-ban-ra'} />
      <FilterLayout
        boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen={input ? 'ACC64' : 'ACC65'} templates={taxInvoiceTemplates(direction)} disabled={!d}
          getDocs={() => (d ? [{ direction, from: f.from, to: f.to, branchCodes: f.branchCodes, unitQty: f.unitQty, blocks: blocks.map((b) => ({ branch: b.branch ? `${b.branch} - ${branchName(b.branch)}` : '', groups: b.groups })) }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => setF((x) => ({ ...x, from, to }))} />
            <label className="checkbox"><input type="checkbox" checked={f.merge} onChange={(e) => setF((x) => ({ ...x, merge: e.target.checked }))} /> Cộng gộp theo từng hóa đơn</label>
            <label className="checkbox"><input type="checkbox" checked={f.unitQty} onChange={(e) => setF((x) => ({ ...x, unitQty: e.target.checked }))} /> Lấy số liệu ĐVT, số lượng, đơn giá lên báo cáo</label>
            {multi && <BranchSelect value={f.branchCodes} onChange={(branchCodes) => setF((x) => ({ ...x, branchCodes }))} />}
            {multi && <label className="checkbox" title="Mỗi chi nhánh một khối, có cộng nhóm riêng"><input type="checkbox" checked={f.split} onChange={(e) => setF((x) => ({ ...x, split: e.target.checked }))} /> Tách theo chi nhánh</label>}
          </>
        }
      >
        <div className="card">
          <div className="rp-tieu-de">
            <h2>{input ? 'BẢNG KÊ HÓA ĐƠN, CHỨNG TỪ HÀNG HÓA, DỊCH VỤ MUA VÀO (MẪU QUẢN TRỊ)' : 'BẢNG KÊ HÓA ĐƠN, CHỨNG TỪ HÀNG HÓA, DỊCH VỤ BÁN RA (MẪU QUẢN TRỊ)'}</h2>
            <i>{ky}</i>
          </div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.groups.length === 0 ? <Empty text="Không có hóa đơn trong kỳ này" /> : (
            <DataGrid storageKey={input ? 'acc64-v3' : 'acc65-v3'} rows={rows} rowKey={(r) => r.key} rowKind={(r) => r.kind}
              groupLabel={(r) => r.label} columns={columns} footerLabel="Tổng cộng"
              exportName={input ? 'bang-ke-mua-vao' : 'bang-ke-ban-ra'} exportTitle={`${input ? 'Bảng kê hóa đơn, chứng từ HHDV mua vào' : 'Bảng kê hóa đơn, chứng từ HHDV bán ra'} — ${ky}`} />
          )}
        </div>
      </FilterLayout>
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
    </>
  );
}
