/**
 * Báo cáo tình hình tài chính (mẫu B01-DN, Thông tư 99/2025; trước đây là Bảng cân đối kế toán): tài sản và nguồn vốn tại ngày cuối kỳ, so với đầu kỳ.
 * Bấm một chỉ tiêu lấy số để mở sổ chi tiết của tài khoản tạo nên số đó.
 */
import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { date, defaultFrom, defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { ErrorBox, Loading, Money } from '@/components/ui';
import { PrintButton } from '@/components/print';
import { BALANCE_SHEET_TEMPLATES } from './mauIn/baoCaoTaiChinh';

interface Row { code: string; name: string; level: number; accounts: string; section: 'assets' | 'sources'; closing: number; opening: number }
interface Data {
  asOf: string; openingAsOf: string; rows: Row[];
  totals: { assets: number; sources: number; difference: number };
  unclosedProfit: number;
  unmapped: { account: string; debit: number; credit: number }[];
  longTerm?: { applied: boolean; openingDate: string; closing: TermMove[]; opening: TermMove[] };
}
interface TermMove { account: string; from: string; to: string; amount: number; requested: number; source: 'manual' | 'schedule'; note: string }

export function BalanceSheetPage() {
  const navigate = useNavigate();
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '' });
  const [hideEmpty, setHideEmpty] = useState(true);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['balance-sheet', f], queryFn: () => api.get<Data>('/api/v1/reports/balance-sheet', f) });
  const d = q.data;
  const drill = (r: Row) => {
    const first = r.accounts.split(/[,(]/)[0]?.trim();
    if (first) navigate(`/bao-cao/so-chi-tiet?${new URLSearchParams({ account: first, from: f.from, to: f.to }).toString()}`);
  };
  const shown = d?.rows.filter((r) => !hideEmpty || r.level <= 2 || r.closing !== 0 || r.opening !== 0) ?? [];

  return (
    <>
      <PageHeader
        title="Báo cáo tình hình tài chính"
        code="ACC8"
        subtitle="Mẫu B01-DN — tài sản và nguồn vốn tại ngày cuối kỳ"
        helpKey="can-doi-ke-toan"
        actions={<button className="btn" disabled={!d} onClick={() => api.download('/api/v1/addins/excel-export/balance-sheet.csv', f, `can-doi-ke-toan-${f.to}.csv`)}><Download size={16} /> Xuất Excel</button>}
      />
      {d && d.totals.difference !== 0 && (
        <div className="alert alert-bad" style={{ marginBottom: 12 }}>
          Bảng chưa cân: tổng tài sản lệch tổng nguồn vốn <b><Money value={d.totals.difference} blankZero={false} /></b>.
          {d.unmapped.length > 0 && <> Tài khoản có số dư nhưng chưa thuộc chỉ tiêu nào: {d.unmapped.map((u) => `${u.account} (${u.debit ? 'dư Nợ' : 'dư Có'})`).join(', ')}.</>}
        </div>
      )}
      {d && d.unclosedProfit !== 0 && (
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          Kỳ này còn {d.unclosedProfit > 0 ? 'lãi' : 'lỗ'} <b><Money value={Math.abs(d.unclosedProfit)} blankZero={false} /></b> chưa kết chuyển. Số này đã được cộng vào chỉ tiêu 420b để bảng cân; kết chuyển lãi lỗ (ACC6) thì số chuyển hẳn về tài khoản 4212.
        </div>
      )}
      <FilterLayout
        print={<PrintButton screen="ACC8" templates={BALANCE_SHEET_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, asOf: d.asOf, openingAsOf: d.openingAsOf, rows: shown }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <label className="checkbox" style={{ marginBottom: 8 }}><input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Ẩn chỉ tiêu không có số</label>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {d?.longTerm && (
            <div className="card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
              {!d.longTerm.applied ? (
                <span className="muted">Đang lọc chi nhánh: số dư trình bày hết ở chỉ tiêu ngắn hạn (phần dài hạn chỉ tách khi xem cả đơn vị).</span>
              ) : d.longTerm.closing.length === 0 ? (
                <span className="muted">Số dư phải thu, phải trả, vay đang trình bày ngắn hạn. Có khoản còn trên 12 tháng thì khai ở màn <a href="/bao-cao/phan-loai-dai-han" onClick={(e) => { e.preventDefault(); navigate('/bao-cao/phan-loai-dai-han'); }}>Phân loại dài hạn</a> cho ngày {date(d.asOf)}.</span>
              ) : (
                <details>
                  <summary>Đã tách ngắn hạn / dài hạn tại {date(d.asOf)}: {d.longTerm.closing.length} khoản (<a href="/bao-cao/phan-loai-dai-han" onClick={(e) => { e.preventDefault(); navigate('/bao-cao/phan-loai-dai-han'); }}>sửa</a>)</summary>
                  <table className="grid" style={{ marginTop: 6, maxWidth: 900 }}>
                    <thead><tr><th>Khoản</th><th>Từ chỉ tiêu</th><th>Sang chỉ tiêu</th><th className="num">Số chuyển</th><th>Nguồn</th></tr></thead>
                    <tbody>{d.longTerm.closing.map((m, i) => (
                      <tr key={i}><td>{m.note}{m.requested > m.amount && <span className="text-bad"> — khai {m.requested.toLocaleString('vi-VN')}, vượt số dư</span>}</td><td className="mono">{m.from}</td><td className="mono">{m.to}</td><td className="num"><Money value={m.amount} blankZero={false} /></td><td>{m.source === 'manual' ? 'Kế toán khai' : 'Lịch phân bổ thẻ tài sản'}</td></tr>
                    ))}</tbody>
                  </table>
                </details>
              )}
            </div>
          )}
          {q.isLoading || !d ? <Loading /> : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Chỉ tiêu</th><th style={{ width: 80 }}>Mã số</th>
                    <th className="num" style={{ width: 200 }}>Số cuối kỳ<div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{date(d.asOf)}</div></th>
                    <th className="num" style={{ width: 200 }}>Số đầu kỳ<div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>trước {date(d.openingAsOf)}</div></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => {
                    const firstSource = r.section === 'sources' && shown[i - 1]?.section === 'assets';
                    return (
                      <Fragment key={r.code}>
                        {i === 0 && <tr className="group-row"><td colSpan={4}>TÀI SẢN</td></tr>}
                        {firstSource && <tr className="group-row"><td colSpan={4}>NGUỒN VỐN</td></tr>}
                        <tr className={`${r.level <= 2 ? 'bold' : ''} ${r.accounts ? 'clickable' : ''}`} onClick={() => drill(r)} title={r.accounts ? `Lấy từ tài khoản ${r.accounts}. Bấm để xem sổ chi tiết.` : ''}>
                          <td style={{ paddingLeft: 12 + Math.max(r.level - 1, 0) * 16 }}>{r.name}</td>
                          <td className="mono">{r.code}</td>
                          <td className="num"><Money value={r.closing} bold={r.level <= 2} blankZero={r.level > 2} /></td>
                          <td className="num"><Money value={r.opening} bold={r.level <= 2} blankZero={r.level > 2} /></td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </FilterLayout>
    </>
  );
}
