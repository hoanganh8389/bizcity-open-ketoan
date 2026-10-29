/**
 * Báo cáo công nợ theo nhân viên (ACC48) và theo mặt hàng (ACC68).
 *  - Theo nhân viên: nhân viên lấy từ dòng sổ (chứng từ bán hàng mang theo người lập phiếu; phiếu nhập tay chọn ở dòng).
 *  - Theo mặt hàng: phần còn nợ chia về các mặt hàng đã tạo ra khoản nợ; trả nợ trừ vào khoản nợ cũ nhất trước.
 * Bấm một dòng có đối tượng để mở sổ chi tiết công nợ.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { defaultFrom, defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { DEBT_EMPLOYEE_TEMPLATES, DEBT_ITEM_TEMPLATES, type EmpDebtSheet, type ItemDebtSheet } from './mauIn/congNoNhanVienMatHang';

interface Amounts { openingDebit: number; openingCredit: number; debit: number; credit: number; closingDebit: number; closingCredit: number }
interface EmpRow extends Amounts { employeeCode: string; employeeName: string; partnerCode: string; partnerName: string }
interface EmpData { rows: EmpRow[]; employees: (Amounts & { employeeCode: string; employeeName: string; partners: number })[]; totals: Amounts }
type EmpGrid = EmpRow & { kind: 'data' | 'group' };
interface Employee { code: string; name: string; isActive: boolean }

/** Đi tới sổ chi tiết công nợ của một đối tượng. */
function useOpenLedger() {
  const navigate = useNavigate();
  return (f: { account: string; from: string; to: string }, partnerCode: string) => {
    if (!partnerCode) return;
    const p = new URLSearchParams({ account: f.account, from: f.from, to: f.to, partnerCode });
    navigate(`/bao-cao/so-chi-tiet-cong-no?${p.toString()}`);
  };
}

export function DebtByEmployeePage() {
  const openLedger = useOpenLedger();
  const [f, setF] = useState({ account: '131', from: periodFrom(), to: defaultTo(), branchCodes: '', employee: '*' });
  const [byPartner, setByPartner] = useState(true);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const employees = useQuery({ queryKey: ['dimensions', 'employee'], queryFn: () => api.get<Employee[]>('/api/v1/dimensions/employee') });
  const { employee, ...rest } = f;
  const params = employee === '*' ? rest : { ...rest, employee: employee === '-' ? '' : employee };
  const q = useQuery({ queryKey: ['debt-by-employee', params], queryFn: () => api.get<EmpData>('/api/v1/reports/debt-by-employee', params), enabled: Boolean(f.account) });
  const d = q.data;
  const pick = [
    { code: '-', name: '(Chưa gắn nhân viên)' },
    ...(employees.data ?? []).map((e) => ({ code: e.code, name: e.name })),
  ];

  const rows = useMemo((): EmpGrid[] => {
    if (!d) return [];
    if (!byPartner) return d.employees.map((e) => ({ ...e, partnerCode: '', partnerName: `${e.partners.toLocaleString('vi-VN')} đối tượng`, kind: 'data' }));
    return d.employees.flatMap((e): EmpGrid[] => [
      { ...e, partnerCode: '', partnerName: '', kind: 'group' },
      ...d.rows.filter((r) => r.employeeCode === e.employeeCode).map((r): EmpGrid => ({ ...r, kind: 'data' })),
    ]);
  }, [d, byPartner]);

  return (
    <>
      <PageHeader title="Báo cáo công nợ theo nhân viên" code="ACC48" subtitle="Số dư và phát sinh công nợ theo nhân viên phụ trách, chi tiết từng đối tượng" helpKey="cong-no-theo-nhan-vien" />
      <FilterLayout
        print={<PrintButton screen="ACC48" templates={DEBT_EMPLOYEE_TEMPLATES} disabled={!d || !d.rows.length}
          getDocs={(): EmpDebtSheet[] => (d ? [{ from: f.from, to: f.to, account: f.account, branchCodes: f.branchCodes, byPartner,
            employee: f.employee === '*' ? '' : pick.find((p) => p.code === f.employee)?.name ?? f.employee, rows: rows.filter((r) => r.kind === 'data') }] : [])} />}
        filters={
          <>
            <div className="field"><label>Tài khoản</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account: account || '131' })} placeholder="131" /></div>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <div className="field">
              <label>Nhân viên</label>
              <ListPicker className="input w-md" items={pick} value={f.employee === '*' ? '' : f.employee} onChange={(v) => set({ employee: v || '*' })} placeholder="Tất cả nhân viên" />
            </div>
            <div className="field"><label className="checkbox"><input type="checkbox" checked={byPartner} onChange={(e) => setByPartner(e.target.checked)} /> Chi tiết từng đối tượng</label></div>
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Dư Nợ cuối kỳ</div><div className="value"><Money value={d.totals.closingDebit} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Dư Có cuối kỳ</div><div className="value"><Money value={d.totals.closingCredit} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Số nhân viên</div><div className="value">{d.employees.filter((e) => e.employeeCode).length.toLocaleString('vi-VN')}</div></div>
          </div>
        )}
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có công nợ trong khoảng này" /> : (
            <DataGrid
              storageKey="acc48"
              rows={rows}
              rowKey={(r, i) => `${r.kind}-${r.employeeCode}-${r.partnerCode}-${i}`}
              rowKind={(r) => r.kind}
              onRowClick={(r) => openLedger(f, r.partnerCode)}
              columns={[
                { key: 'employeeCode', header: 'Mã nhân viên', type: 'code' },
                { key: 'employeeName', header: 'Tên nhân viên' },
                { key: 'partnerCode', header: 'Mã đối tượng', type: 'code', hidden: !byPartner },
                { key: 'partnerName', header: byPartner ? 'Tên đối tượng' : 'Số đối tượng' },
                { key: 'openingDebit', header: 'Nợ', band: 'Số dư đầu kỳ', type: 'money', sum: true },
                { key: 'openingCredit', header: 'Có', band: 'Số dư đầu kỳ', type: 'money', sum: true },
                { key: 'debit', header: 'Nợ', band: 'Phát sinh trong kỳ', type: 'money', sum: true },
                { key: 'credit', header: 'Có', band: 'Phát sinh trong kỳ', type: 'money', sum: true },
                { key: 'closingDebit', header: 'Nợ', band: 'Số dư cuối kỳ', type: 'money', sum: true, bold: true },
                { key: 'closingCredit', header: 'Có', band: 'Số dư cuối kỳ', type: 'money', sum: true, bold: true },
              ] satisfies Column<EmpGrid>[]}
            />
          )}
          <p className="muted" style={{ margin: 12 }}>
            Nhân viên của chứng từ bán hàng là người lập phiếu trên hệ thống bán hàng; phiếu thu, chi, phiếu kế toán nhập tay thì chọn nhân viên ở từng dòng
            (bấm "Chiều phân tích" trên phiếu). Dòng sổ không có nhân viên gom vào "(chưa gắn nhân viên)".
          </p>
        </div>
      </FilterLayout>
    </>
  );
}

interface ItemRow { partnerCode: string; partnerName: string; sku: string; itemName: string; unit: string; opening: number; increase: number; decrease: number; closing: number }
interface ItemData { side: 'debit' | 'credit'; rows: ItemRow[]; totals: { opening: number; increase: number; decrease: number; closing: number } }
type ItemGrid = ItemRow & { kind: 'data' | 'group' };

export function DebtByItemPage() {
  const openLedger = useOpenLedger();
  const [f, setF] = useState({ account: '131', from: periodFrom(), to: defaultTo(), branchCodes: '', partnerCode: '' });
  const [view, setView] = useState<'partner' | 'item'>('partner');
  const [hideZero, setHideZero] = useState(true);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['debt-by-item', f], queryFn: () => api.get<ItemData>('/api/v1/reports/debt-by-item', f), enabled: Boolean(f.account) });
  const d = q.data;
  const payable = f.account.startsWith('3');

  const rows = useMemo((): ItemGrid[] => {
    if (!d) return [];
    const data = d.rows.filter((r) => !hideZero || r.closing !== 0 || r.increase !== 0 || r.decrease !== 0);
    if (view === 'item') {
      // Cộng mọi đối tượng theo mặt hàng.
      const m = new Map<string, ItemGrid>();
      for (const r of data) {
        const key = `${r.sku}\u0000${r.itemName}`;
        const cur = m.get(key) ?? { ...r, partnerCode: '', partnerName: '', opening: 0, increase: 0, decrease: 0, closing: 0, kind: 'data' as const };
        cur.opening += r.opening; cur.increase += r.increase; cur.decrease += r.decrease; cur.closing += r.closing;
        m.set(key, cur);
      }
      return [...m.values()].sort((x, y) => y.closing - x.closing);
    }
    const out: ItemGrid[] = [];
    let last: string | null = null;
    for (const r of data) {
      if (r.partnerCode !== last) {
        const mine = data.filter((x) => x.partnerCode === r.partnerCode);
        const s = (k: 'opening' | 'increase' | 'decrease' | 'closing') => mine.reduce((t, x) => t + x[k], 0);
        out.push({ ...r, sku: '', itemName: '', unit: '', opening: s('opening'), increase: s('increase'), decrease: s('decrease'), closing: s('closing'), kind: 'group' });
        last = r.partnerCode;
      }
      out.push({ ...r, kind: 'data' });
    }
    return out;
  }, [d, view, hideZero]);

  return (
    <>
      <PageHeader title="Báo cáo công nợ theo mặt hàng" code="ACC68" subtitle="Phần còn nợ của từng đối tượng chia theo mặt hàng đã bán (mua) chịu" helpKey="cong-no-theo-mat-hang" />
      <FilterLayout
        print={<PrintButton screen="ACC68" templates={DEBT_ITEM_TEMPLATES} disabled={!d || !rows.length}
          getDocs={(): ItemDebtSheet[] => (d ? [{ from: f.from, to: f.to, account: f.account, branchCodes: f.branchCodes, view,
            partnerName: f.partnerCode ? d.rows.find((r) => r.partnerCode === f.partnerCode)?.partnerName ?? f.partnerCode : undefined, rows: rows.filter((r) => r.kind === 'data') }] : [])} />}
        filters={
          <>
            <div className="field"><label>Tài khoản</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account: account || '131' })} placeholder="131" /></div>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <div className="field"><label>Đối tượng</label><PartnerPicker className="input w-md" value={f.partnerCode} onChange={(partnerCode) => set({ partnerCode })} placeholder="Tất cả" /></div>
            <div className="field">
              <label>Xem</label>
              <select className="select input" value={view} onChange={(e) => setView(e.target.value as 'partner' | 'item')}>
                <option value="partner">Theo đối tượng, chi tiết mặt hàng</option>
                <option value="item">Cộng theo mặt hàng</option>
              </select>
            </div>
            <div className="field"><label className="checkbox"><input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> Ẩn dòng không còn nợ, không phát sinh</label></div>
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">{payable ? 'Còn phải trả đầu kỳ' : 'Còn phải thu đầu kỳ'}</div><div className="value"><Money value={d.totals.opening} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">{payable ? 'Mua chịu trong kỳ' : 'Bán chịu trong kỳ'}</div><div className="value"><Money value={d.totals.increase} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">{payable ? 'Đã trả trong kỳ' : 'Đã thu trong kỳ'}</div><div className="value"><Money value={d.totals.decrease} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">{payable ? 'Còn phải trả cuối kỳ' : 'Còn phải thu cuối kỳ'}</div><div className="value"><Money value={d.totals.closing} blankZero={false} /></div></div>
          </div>
        )}
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || rows.length === 0 ? <Empty text="Không có công nợ trong khoảng này" /> : (
            <DataGrid
              storageKey="acc68"
              rows={rows}
              rowKey={(r, i) => `${r.kind}-${r.partnerCode}-${r.sku}-${r.itemName}-${i}`}
              rowKind={(r) => r.kind}
              onRowClick={(r) => openLedger(f, r.partnerCode)}
              columns={[
                { key: 'partnerCode', header: 'Mã đối tượng', type: 'code', hidden: view === 'item' },
                { key: 'partnerName', header: 'Tên đối tượng', hidden: view === 'item' },
                { key: 'sku', header: 'Mã hàng', type: 'code' },
                { key: 'itemName', header: 'Tên hàng' },
                { key: 'unit', header: 'ĐVT' },
                { key: 'opening', header: 'Còn nợ đầu kỳ', type: 'money', sum: true },
                { key: 'increase', header: payable ? 'Mua chịu' : 'Bán chịu', type: 'money', sum: true },
                { key: 'decrease', header: payable ? 'Đã trả' : 'Đã thu', type: 'money', sum: true },
                { key: 'closing', header: 'Còn nợ cuối kỳ', type: 'money', sum: true, bold: true },
              ] satisfies Column<ItemGrid>[]}
            />
          )}
          <p className="muted" style={{ margin: 12 }}>
            Mỗi khoản {payable ? 'mua' : 'bán'} chịu được chia về các mặt hàng theo tiền hàng (gồm thuế) của chứng từ. Khoản {payable ? 'trả' : 'thu'} nợ trừ vào khoản nợ cũ nhất trước,
            và trừ về từng mặt hàng theo phần còn nợ. Số âm ở dòng "{payable ? 'Trả trước cho người bán' : 'Khách trả trước, trả thừa'}" là tiền đã {payable ? 'trả' : 'thu'} chưa trừ vào khoản nợ nào.
          </p>
        </div>
      </FilterLayout>
    </>
  );
}
