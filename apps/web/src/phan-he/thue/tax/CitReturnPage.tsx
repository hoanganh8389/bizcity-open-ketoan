/**
 * Tờ khai quyết toán thuế TNDN (mẫu 03/TNDN) — phần chỉ tiêu chính.
 * [A1] lấy từ báo cáo kết quả kinh doanh cả năm; [E] gợi ý từ phát sinh Nợ 3334; còn lại kế toán nhập.
 * Công thức tính lại ngay khi gõ (giống máy chủ: cit-return.service.ts → computeCit).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading, Money } from '@/components/ui';

const MANUAL = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B9', 'B10', 'B11', 'B14', 'C2', 'C3a', 'C3b', 'C5', 'rate', 'C11', 'C12', 'C13', 'C14', 'D2', 'E'] as const;
type Manual = Partial<Record<(typeof MANUAL)[number], number>>;

function computeCit(auto: Record<string, number>, manual: Manual): Record<string, number> {
  const v: Record<string, number> = { ...auto };
  for (const k of MANUAL) if (manual[k] !== undefined) v[k] = Number(manual[k]);
  const g = (k: string) => v[k] ?? 0;
  for (const k of MANUAL) v[k] = g(k);
  if (manual.rate === undefined) v.rate = auto.rate ?? 20;
  if (manual.E === undefined) v.E = auto.E ?? 0;
  v.B1 = g('B2') + g('B3') + g('B4') + g('B5') + g('B6') + g('B7');
  v.B8 = g('B9') + g('B10') + g('B11');
  v.B12 = g('A1') + g('B1') - g('B8');
  v.B13 = g('B12') - g('B14');
  v.C1 = g('B13');
  v.C3 = g('C3a') + g('C3b');
  v.C4 = Math.max(g('C1') - g('C2') - g('C3'), 0);
  v.C6 = Math.max(g('C4') - g('C5'), 0);
  v.C10 = Math.round((g('C6') * g('rate')) / 100);
  v.C15 = Math.max(g('C10') - g('C11') - g('C12') - g('C13') - g('C14'), 0);
  v.D = g('C15') + g('D2');
  v.G = g('D') - g('E');
  return v;
}

interface CitData {
  form: { code: string; name: string; bold?: boolean; manual?: boolean; percent?: boolean }[];
  year: number; auto: Record<string, number>; manual: Manual; values: Record<string, number>; revenue: number;
  accounting: { tax: number; profitAfterTax: number };
  prepaidCheck: { minPrepaid: number; shortfall: number; q4Deadline: string };
  deadline: string;
  saved: { status: 'draft' | 'final'; values: Record<string, number>; updatedBy: string; updatedAt: string } | null;
}

export function CitReturnPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0));
  const q = useQuery({ queryKey: ['cit-return', year], queryFn: () => api.get<CitData>('/api/v1/cit-returns/build', { year }) });
  const d = q.data;
  const [manual, setManual] = useState<Manual>({});
  useEffect(() => { if (d) setManual(d.manual); }, [d]);
  const final = d?.saved?.status === 'final';
  const recomputed = useMemo(() => (d ? computeCit(d.auto, manual) : {}), [d, manual]);
  const values = final && d?.saved ? d.saved.values : recomputed;
  const save = useMutation({
    mutationFn: (status: 'draft' | 'final') => api.put('/api/v1/cit-returns', { year, status, manual }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cit-return'] }),
  });
  const editable = (k: string) => (MANUAL as readonly string[]).includes(k) && can('documents:write') && !final;
  const v = (k: string) => values[k] ?? 0;
  const minPrepaid = Math.round(v('D') * 0.8);
  const shortfall = Math.max(minPrepaid - v('E'), 0);
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i);

  const exportExcel = async () => {
    if (!d) return;
    const XLSX = await import('xlsx');
    const rows = [['TỜ KHAI QUYẾT TOÁN THUẾ THU NHẬP DOANH NGHIỆP (Mẫu số 03/TNDN)'], [`Kỳ tính thuế: năm ${year}`], [], ['Mã chỉ tiêu', 'Chỉ tiêu', 'Số tiền'],
      ...d.form.map((l) => [l.code, l.name, l.code.length === 1 && !['D', 'E', 'G'].includes(l.code) ? '' : v(l.code)])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '03-TNDN');
    XLSX.writeFile(wb, `to-khai-03-tndn-${year}.xlsx`);
  };

  return (
    <>
      <PageHeader title="Quyết toán thuế TNDN" code="TNDN03" subtitle="Mẫu 03/TNDN — lợi nhuận lấy từ báo cáo kết quả kinh doanh; điều chỉnh, ưu đãi, tạm nộp do kế toán nhập" helpKey="quyet-toan-tndn"
        actions={<>
          <button className="btn" disabled={!d} onClick={() => void exportExcel()}><Download size={16} /> Xuất Excel</button>
          {can('documents:write') && !final && <button className="btn" disabled={!d || save.isPending} onClick={() => save.mutate('draft')}>Lưu nháp</button>}
          {can('documents:write') && !final && <button className="btn btn-primary" disabled={!d || save.isPending} onClick={() => save.mutate('final')}>Lưu chính thức</button>}
          {can('documents:write') && final && <button className="btn" disabled={save.isPending} onClick={() => window.confirm('Mở lại tờ khai quyết toán đã lưu chính thức để sửa?') && save.mutate('draft')}>Mở lại để sửa</button>}
        </>} />
      <div className="card">
        <div className="filters">
          <div className="field">
            <label>Năm quyết toán</label>
            <select className="select input w-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
          </div>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
        {save.isSuccess && <div className="alert alert-ok" style={{ margin: 12 }}>Đã lưu tờ khai quyết toán.</div>}
        {q.isLoading || !d ? <Loading /> : (
          <>
            <div className="card-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
              <span>Kỳ tính thuế: <b>năm {year}</b> — hạn nộp tờ khai và tiền thuế: {date(d.deadline)}</span>
              {d.saved ? <span className={`badge ${final ? 'badge-ok' : 'badge-gray'}`} style={{ marginLeft: 10 }}>{final ? 'Đã lưu chính thức' : 'Bản nháp'}</span> : <span className="badge badge-gray" style={{ marginLeft: 10 }}>Chưa lưu</span>}
              <p className="muted" style={{ margin: '6px 0 0' }}>
                Tổng doanh thu năm (doanh thu thuần + doanh thu tài chính + thu nhập khác): <b>{money(d.revenue, { blankZero: false })}</b> → thuế suất gợi ý {d.auto.rate}%
                (Luật Thuế TNDN 67/2025/QH15: tổng doanh thu năm đến 3 tỷ đồng 15%, trên 3 đến 50 tỷ đồng 17%, còn lại 20%; kế toán kiểm tra điều kiện áp dụng).
                Chi phí thuế TNDN hiện hành đã ghi sổ (8211): {money(d.accounting.tax, { blankZero: false })}.
              </p>
            </div>
            {v('E') > 0 || v('D') > 0 ? (
              shortfall > 0
                ? <div className="alert alert-warn" style={{ margin: '0 12px 8px' }}>Thuế đã tạm nộp {money(v('E'), { blankZero: false })} chưa đủ 80% số thuế quyết toán ({money(minPrepaid, { blankZero: false })}): phần thiếu {money(shortfall, { blankZero: false })} phải tính tiền chậm nộp từ ngày kế tiếp hạn nộp thuế quý 4 ({date(d.prepaidCheck.q4Deadline)}).</div>
                : <div className="muted" style={{ margin: '0 12px 8px' }}>Thuế đã tạm nộp đạt từ 80% số thuế quyết toán.</div>
            ) : null}
            <div className="table-wrap">
              <table className="grid vat-form">
                <thead><tr><th style={{ width: 70 }}>Mã</th><th>Chỉ tiêu</th><th className="num" style={{ width: 200 }}>Số tiền</th></tr></thead>
                <tbody>
                  {d.form.map((l) => {
                    const heading = l.code.length === 1 && !['D', 'E', 'G'].includes(l.code);
                    return (
                      <tr key={l.code} className={l.bold ? 'bold' : ''}>
                        <td className="mono">{heading ? l.code : `[${l.code === 'rate' ? '%' : l.code}]`}</td>
                        <td>{l.name}</td>
                        <td className="num">
                          {heading ? null : editable(l.code) ? (
                            <input className="input num" style={{ width: 170 }} inputMode="numeric"
                              value={manual[l.code as keyof Manual] === undefined ? '' : l.percent ? String(manual[l.code as keyof Manual]) : money(manual[l.code as keyof Manual]!, { blankZero: false })}
                              placeholder={l.code === 'rate' ? String(d.auto.rate) : l.code === 'E' ? money(d.auto.E ?? 0, { blankZero: false }) : '0'}
                              onChange={(e) => { const s = e.target.value.replace(l.percent ? /[^\d.]/g : /[^\d-]/g, ''); setManual((m) => ({ ...m, [l.code]: s === '' ? undefined : Number(s) })); }} />
                          ) : l.percent ? `${v(l.code)}%` : <Money value={v(l.code)} blankZero={false} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ margin: 12 }}>
              Ô có khung nhập tay. [E] để trống = phát sinh Nợ 3334 trong năm. Phụ lục chuyển lỗ (03-2/TNDN), ưu đãi (03-3) lập riêng theo số đã nhập ở [C3a], [C12].
              Nộp qua cổng thuế điện tử: nhập lại số hoặc nhập từ tệp Excel.
            </p>
          </>
        )}
      </div>
    </>
  );
}
