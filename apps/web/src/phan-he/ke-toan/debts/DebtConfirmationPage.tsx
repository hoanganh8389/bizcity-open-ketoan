/**
 * Biên bản đối chiếu công nợ (CN07, KT-18): chọn kỳ, tài khoản công nợ, xem số từng đối tác,
 * tick các đối tác rồi "In biên bản": mỗi đối tác một biên bản (thông tin hai bên, bảng số dư / phát sinh theo
 * tài khoản, kết luận số còn nợ kèm bằng chữ, chi tiết chứng từ nếu chọn, chữ ký hai bên).
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { date, firstDayOfMonth, money, today } from '@/lib/format';
import { amountInWords } from '@/lib/docso';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading } from '@/components/ui';
import { useTenant } from '../../../features/system/TenantPage';

interface Line { date: string; docNo: string; invoiceNo: string; description: string; debit: number; credit: number }
interface Part { accountCode: string; accountName: string; opening: number; debit: number; credit: number; closing: number; lines?: Line[] }
interface PartnerDC { partner: { code: string; name: string; taxCode: string; address: string; phone: string; contactName: string }; accounts: Part[]; opening: number; debit: number; credit: number; closing: number }
interface Result { company: { name: string; taxCode: string; address: string; phone: string }; from: string; to: string; partners: PartnerDC[] }

export function DebtConfirmationPage() {
  const [f, setF] = useState({ from: firstDayOfMonth(), to: today(), account: '*' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [withDetail, setWithDetail] = useState(true);
  const [printing, setPrinting] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => { setSelected(new Set()); setF((x) => ({ ...x, ...p })); };
  const q = useQuery({ queryKey: ['debt-confirmation', f], queryFn: () => api.get<Result>('/api/v1/reports/debt-confirmation', f) });
  const rows = q.data?.partners ?? [];

  const print = async () => {
    setBusy(true);
    setErr(null);
    try {
      const codes = rows.filter((r) => selected.has(r.partner.code)).map((r) => r.partner.code);
      setPrinting(await api.get<Result>('/api/v1/reports/debt-confirmation', { ...f, partnerCodes: codes.join(','), detail: withDetail ? 'true' : 'false' }));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo<Column<PartnerDC>[]>(() => [
    {
      key: 'pick', noFilter: true, noSort: true, width: 34, value: () => '',
      header: <input type="checkbox" title="Chọn tất cả" checked={rows.length > 0 && rows.every((r) => selected.has(r.partner.code))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.partner.code)) : new Set())} />,
      render: (r) => <input type="checkbox" checked={selected.has(r.partner.code)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.partner.code); else n.delete(r.partner.code); return n; })} />,
    },
    { key: 'code', header: 'Mã đối tác', type: 'code', value: (r) => r.partner.code, width: 110 },
    { key: 'name', header: 'Tên đối tác', value: (r) => r.partner.name, width: 240 },
    { key: 'taxCode', header: 'Mã số thuế', type: 'code', value: (r) => r.partner.taxCode, width: 120 },
    { key: 'accounts', header: 'Tài khoản', value: (r) => r.accounts.map((a) => a.accountCode).join(', '), width: 110 },
    { key: 'opening', header: 'Dư đầu kỳ', type: 'money', sum: true, showZero: true },
    { key: 'debit', header: 'Phát sinh Nợ', type: 'money', sum: true },
    { key: 'credit', header: 'Phát sinh Có', type: 'money', sum: true },
    { key: 'closing', header: 'Dư cuối kỳ', type: 'money', sum: true, showZero: true, bold: true },
  ], [rows, selected]);

  return (
    <>
      <PageHeader title="Biên bản đối chiếu công nợ" code="CN07" subtitle="Đối chiếu công nợ phải thu, phải trả với từng khách hàng, nhà cung cấp; in biên bản để hai bên ký xác nhận" helpKey="doi-chieu-cong-no" />
      <FilterLayout
        filters={
          <>
            <div className="field"><label>Từ ngày</label><input type="date" className="input" value={f.from} onChange={(e) => set({ from: e.target.value })} /></div>
            <div className="field"><label>Đến ngày</label><input type="date" className="input" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
            <div className="field"><label>Tài khoản</label>
              <select className="select input" value={f.account} onChange={(e) => set({ account: e.target.value })}>
                <option value="*">Mọi tài khoản công nợ</option><option value="131">131 — Phải thu khách hàng</option><option value="331">331 — Phải trả người bán</option>
                <option value="141">141 — Tạm ứng</option><option value="1388">1388 — Phải thu khác</option><option value="3388">3388 — Phải trả khác</option>
              </select>
            </div>
          </>
        }
      >
        <div className="card">
          <div style={{ padding: '0 16px 16px' }}>
            <div className="row" style={{ gap: 10, marginBottom: 10, alignItems: 'center' }}>
              <span>Đã chọn <b>{selected.size}</b> đối tác</span>
              <label className="checkbox"><input type="checkbox" checked={withDetail} onChange={(e) => setWithDetail(e.target.checked)} /> Kèm chi tiết chứng từ trong kỳ</label>
              <button className="btn btn-primary" disabled={!selected.size || busy} onClick={() => void print()}><Printer size={16} /> In biên bản</button>
            </div>
            <div className="muted" style={{ marginBottom: 6 }}>Dư dương: đối tác nợ đơn vị; dư âm: đơn vị nợ đối tác. Đối tác vừa mua vừa bán thì biên bản ghi từng tài khoản và số còn nợ sau bù trừ.</div>
            <ErrorBox error={q.error ? errorText(q.error) : err} />
            {q.isLoading ? <Loading /> : <DataGrid storageKey="cn07" rows={rows} rowKey={(r) => r.partner.code} columns={columns} exportName={`doi-chieu-cong-no-${f.from}-${f.to}`} exportTitle={`Đối chiếu công nợ từ ${date(f.from)} đến ${date(f.to)}`} />}
          </div>
        </div>
      </FilterLayout>
      {printing && <ConfirmationPrint data={printing} onDone={() => setPrinting(null)} />}
    </>
  );
}

const vnDate = (d: string) => { const [y, m, dd] = d.split('-'); return `ngày ${dd} tháng ${m} năm ${y}`; };

function ConfirmationPrint({ data, onDone }: { data: Result; onDone: () => void }) {
  const { data: tenant } = useTenant();
  useEffect(() => {
    document.body.classList.add('printing-sheet');
    const done = () => { document.body.classList.remove('printing-sheet'); onDone(); };
    window.addEventListener('afterprint', done, { once: true });
    const t = window.setTimeout(() => window.print(), 80);
    return () => { window.clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('printing-sheet'); };
  }, [onDone]);
  const c = data.company;
  return createPortal(
    <>
      {data.partners.map((p) => {
        const owes = p.closing >= 0;
        return (
          <div className="print-sheet bbdc" key={p.partner.code}>
            <div className="ps-top">
              <div>{tenant?.logo && <img src={tenant.logo} alt="" style={{ maxHeight: 40, maxWidth: 130, display: 'block' }} />}<b>{c.name}</b></div>
              <div style={{ textAlign: 'center' }}><b>CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br /><u>Độc lập – Tự do – Hạnh phúc</u></div>
            </div>
            <h1>BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ</h1>
            <div className="ps-date">Từ {date(data.from)} đến {date(data.to)}</div>
            <p>Hôm nay, {vnDate(today())}, chúng tôi gồm:</p>
            <table className="ps-info">
              <tbody>
                <tr><td><b>Bên A</b>:</td><td><b>{c.name}</b></td></tr>
                <tr><td>Địa chỉ:</td><td>{c.address}</td></tr>
                <tr><td>Mã số thuế:</td><td>{c.taxCode}{c.phone ? ` · Điện thoại: ${c.phone}` : ''}</td></tr>
                <tr><td>Đại diện:</td><td>……………………………… Chức vụ: ………………</td></tr>
                <tr><td><b>Bên B</b>:</td><td><b>{p.partner.name}</b> ({p.partner.code})</td></tr>
                <tr><td>Địa chỉ:</td><td>{p.partner.address}</td></tr>
                <tr><td>Mã số thuế:</td><td>{p.partner.taxCode}{p.partner.phone ? ` · Điện thoại: ${p.partner.phone}` : ''}</td></tr>
                <tr><td>Đại diện:</td><td>{p.partner.contactName || '………………………………'} Chức vụ: ………………</td></tr>
              </tbody>
            </table>
            <p>Cùng nhau đối chiếu công nợ giữa hai bên như sau (đơn vị tính: đồng):</p>
            <table className="ps-lines">
              <thead><tr><th>Tài khoản</th><th>Dư đầu kỳ</th><th>Phát sinh Nợ</th><th>Phát sinh Có</th><th>Dư cuối kỳ</th></tr></thead>
              <tbody>
                {p.accounts.map((a) => (
                  <tr key={a.accountCode}><td>{a.accountCode} {a.accountName}</td><td className="num">{money(a.opening, { blankZero: false })}</td><td className="num">{money(a.debit, { blankZero: false })}</td><td className="num">{money(a.credit, { blankZero: false })}</td><td className="num">{money(a.closing, { blankZero: false })}</td></tr>
                ))}
                <tr><td><b>Cộng</b></td><td className="num"><b>{money(p.opening, { blankZero: false })}</b></td><td className="num"><b>{money(p.debit, { blankZero: false })}</b></td><td className="num"><b>{money(p.credit, { blankZero: false })}</b></td><td className="num"><b>{money(p.closing, { blankZero: false })}</b></td></tr>
              </tbody>
            </table>
            {p.accounts.some((a) => a.lines?.length) && (
              <>
                <p><b>Chi tiết phát sinh trong kỳ</b></p>
                <table className="ps-lines">
                  <thead><tr><th>Ngày</th><th>Số chứng từ</th><th>Số hoá đơn</th><th>Diễn giải</th><th>TK</th><th>Phát sinh Nợ</th><th>Phát sinh Có</th></tr></thead>
                  <tbody>
                    {p.accounts.flatMap((a) => (a.lines ?? []).map((l, i) => (
                      <tr key={`${a.accountCode}-${i}`}><td>{date(l.date)}</td><td>{l.docNo}</td><td>{l.invoiceNo}</td><td>{l.description}</td><td>{a.accountCode}</td><td className="num">{l.debit ? money(l.debit) : ''}</td><td className="num">{l.credit ? money(l.credit) : ''}</td></tr>
                    )))}
                  </tbody>
                </table>
              </>
            )}
            <p>
              Tính đến hết {vnDate(data.to)}, {p.closing === 0 ? 'hai bên không còn công nợ với nhau.' : <>
                <b>{owes ? 'Bên B còn nợ Bên A' : 'Bên A còn nợ Bên B'}</b> số tiền: <b>{money(Math.abs(p.closing), { blankZero: false })} đồng</b> (bằng chữ: <i>{amountInWords(Math.abs(p.closing))}</i>).</>}
            </p>
            <p>Biên bản được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị như nhau. Nếu có chênh lệch, đề nghị Bên B ghi rõ số liệu và gửi lại chứng từ để hai bên đối chiếu.</p>
            <div className="ps-signs" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <div><b>ĐẠI DIỆN BÊN A</b><span>(Ký, họ tên, đóng dấu)</span></div>
              <div><b>ĐẠI DIỆN BÊN B</b><span>(Ký, họ tên, đóng dấu)</span></div>
            </div>
          </div>
        );
      })}
    </>,
    document.body,
  );
}
