/**
 * CÀI ĐẶT MUA HÀNG (MH12) — 4 khối, chịu được dữ liệu lớn (nhiều năm lễ, nhiều nhãn × chi nhánh):
 *   ① Ngày nghỉ, lễ: lọc theo năm, cuộn trong khung; thêm một ngày, thêm nhanh lễ cố định của năm, dán nhiều ngày, nhập / xuất Excel.
 *   ② Số dư nợ theo nhãn tại chi nhánh lúc bắt đầu dùng (hạn mức nhãn): tìm, cuộn, chọn nhãn / chi nhánh từ danh mục, nhập / xuất Excel.
 *   ③ Cảnh báo sắp đến hạn · ④ Tài khoản hạch toán (trống = phần mềm tự chọn theo hệ thống tài khoản).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileUp, Plus } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Loading, Modal } from '@/components/ui';
import { BranchPicker } from '@/components/filters';
import { P, useBrands, useNames, vnd } from '../du-lieu';
import { BrandInput, dmy } from '../chung';
import { NhapExcelChung, docNgay, xuatExcel } from '../thanh-phan/NhapExcelChung';
import '../mua-hang.css';

interface Settings { holidays: string[]; warnDays: number; priceWarnPct?: number; requireOrder?: boolean; brandOpening: Record<string, Record<string, number>>; accounts: Record<string, string>; resolvedAccounts: Record<string, string> }
const ACC_LABEL: Record<string, string> = { stock: 'Hàng hoá (kho)', vatIn: 'Thuế GTGT đầu vào', payable: 'Phải trả nhà cung cấp', bank: 'Tiền gửi ngân hàng (trả chuyển khoản)', cash: 'Tiền mặt', giftIncome: 'Thu nhập từ quà tặng không hoá đơn', giftExpense: 'Chi phí xuất quà tặng khách', finIncome: 'Chiết khấu thanh toán được hưởng' };
const THU = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const LE_CO_DINH: [string, string][] = [['01-01', 'Tết Dương lịch'], ['04-30', 'Giải phóng miền Nam'], ['05-01', 'Quốc tế Lao động'], ['09-02', 'Quốc khánh']];
const num = (s: string) => Number(String(s).replace(/\./g, '').replace(/,/g, '').trim()) || 0;

export function CaiDatMuaPage() {
  const q = useQuery({ queryKey: ['mua-hang', 'settings'], queryFn: () => api.get<Settings>(`${P}/settings`) });
  const brands = useBrands();
  const names = useNames();
  const [s, setS] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [day, setDay] = useState('');
  const [pasteDays, setPasteDays] = useState(false);
  const [imp, setImp] = useState<'' | 'days' | 'open'>('');
  const [find, setFind] = useState('');
  const [ob, setOb] = useState({ brand: '', branch: '', amount: '' });
  useEffect(() => { if (q.data) { setS(q.data); setDirty(false); } }, [q.data]);
  const years = useMemo(() => [...new Set([String(new Date().getFullYear()), ...(s?.holidays ?? []).map((h) => h.slice(0, 4))])].sort().reverse(), [s]);
  if (q.isLoading || !s) return <><PageHeader title="Cài đặt mua hàng" code="MH12" helpKey="mua-hang-cai-dat" /><Loading /></>;
  const upd = (p: Partial<Settings>) => { setS({ ...s, ...p }); setDirty(true); };
  const addDays = (list: string[]) => upd({ holidays: [...new Set([...s.holidays, ...list])].sort() });
  const save = async () => {
    setMsg(null);
    try { await api.put(`${P}/settings`, { holidays: s.holidays, warnDays: s.warnDays, priceWarnPct: s.priceWarnPct ?? 2, requireOrder: Boolean(s.requireOrder), brandOpening: s.brandOpening, accounts: Object.fromEntries(Object.entries(s.accounts).filter(([, v]) => v)) }); setMsg({ ok: true, text: 'Đã lưu cài đặt' }); void q.refetch(); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };
  const days = s.holidays.filter((h) => h.startsWith(year));
  const openings = Object.entries(s.brandOpening).flatMap(([brand, m]) => Object.entries(m).map(([branch, amount]) => ({ brand, branch, amount })))
    .filter((o) => !find || `${o.brand} ${brands.find((b) => b.code === o.brand)?.name ?? ''} ${o.branch} ${names.branchName(o.branch)}`.toLowerCase().includes(find.toLowerCase()));
  const setOpening = (list: { brand: string; branch: string; amount: number }[]) => { const m = { ...s.brandOpening }; for (const o of list) m[o.brand] = { ...(m[o.brand] ?? {}), [o.branch]: o.amount }; upd({ brandOpening: m }); };
  const brandName = (c: string) => brands.find((b) => b.code === c)?.name;

  return (
    <>
      <PageHeader title="Cài đặt mua hàng" code="MH12" helpKey="mua-hang-cai-dat" subtitle="Ngày nghỉ lễ (tính hạn theo ngày làm việc), số dư nợ nhãn đầu kỳ, cảnh báo trước hạn, tài khoản hạch toán" />
      <div className="blk-stack">
        <div className="mh-grid2">
          <section className="blk blk-orange">
            <header><div><b>① Ngày nghỉ, lễ</b><span>Không tính vào hạn "ngày làm việc". Thứ 7, chủ nhật luôn được bỏ qua.</span></div></header>
            <div className="blk-body">
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <div className="tabs" style={{ margin: 0 }}>{years.map((y) => <button key={y} className={`tab ${y === year ? 'active' : ''}`} onClick={() => setYear(y)}>{y} ({s.holidays.filter((h) => h.startsWith(y)).length})</button>)}</div>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
                <button className="btn btn-sm" disabled={!day || s.holidays.includes(day)} onClick={() => { addDays([day]); setYear(day.slice(0, 4)); setDay(''); }}><Plus size={13} /> Thêm ngày</button>
                <button className="btn btn-sm" title={LE_CO_DINH.map(([d, n]) => `${d.split('-').reverse().join('/')} ${n}`).join('\n')} onClick={() => addDays(LE_CO_DINH.map(([d]) => `${year}-${d}`))}>+ Lễ cố định năm {year}</button>
                <button className="btn btn-sm" onClick={() => setPasteDays(true)}>Dán nhiều ngày…</button>
                <button className="btn btn-sm" onClick={() => setImp('days')}><FileUp size={13} /> Nhập Excel</button>
                <button className="btn btn-sm" disabled={!s.holidays.length} onClick={() => void xuatExcel('ngay-nghi-le.xlsx', 'Ngay nghi', s.holidays.map((h) => ({ 'Ngày': dmy(h), 'Thứ': THU[new Date(h).getDay()] })))}><Download size={13} /> Xuất Excel</button>
              </div>
              <div className="scroll-box" style={{ maxHeight: 260 }}>
                <table className="mh-mini"><thead><tr><th style={{ width: 50 }}>STT</th><th>Ngày</th><th>Thứ</th><th style={{ width: 40 }} /></tr></thead><tbody>
                  {days.map((h, i) => <tr key={h}><td>{i + 1}</td><td>{dmy(h)}</td><td>{THU[new Date(`${h}T00:00:00`).getDay()]}</td><td><button className="btn btn-xs" title="Bỏ ngày này" onClick={() => upd({ holidays: s.holidays.filter((x) => x !== h) })}>×</button></td></tr>)}
                  {!days.length && <tr><td colSpan={4} className="muted">Năm {year} chưa khai ngày nghỉ — bấm "+ Lễ cố định năm {year}" rồi thêm Tết âm lịch.</td></tr>}
                </tbody></table>
              </div>
            </div>
          </section>

          <section className="blk blk-purple">
            <header><div><b>② Số dư nợ theo nhãn tại chi nhánh lúc bắt đầu dùng</b><span>Cho hạn mức nhãn phân bổ chi nhánh: nợ nhãn tại chi nhánh = số dư này + phần chưa trả của phiếu nhập đã duyệt.</span></div></header>
            <div className="blk-body">
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <input className="input" style={{ width: 200 }} placeholder="Tìm nhãn / chi nhánh" value={find} onChange={(e) => setFind(e.target.value)} />
                <button className="btn btn-sm" onClick={() => setImp('open')}><FileUp size={13} /> Nhập Excel</button>
                <button className="btn btn-sm" onClick={() => void xuatExcel('so-du-no-nhan.xlsx', 'So du no nhan', Object.entries(s.brandOpening).flatMap(([brand, m]) => Object.entries(m).map(([branch, amount]) => ({ 'Nhãn': brand, 'Tên nhãn': brandName(brand) ?? '', 'Chi nhánh': branch, 'Số dư': amount }))))}><Download size={13} /> Xuất Excel</button>
                <span className="muted" style={{ fontSize: 12 }}>{openings.length} dòng</span>
              </div>
              <div className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ width: 200 }}><BrandInput value={ob.brand} brands={brands} onChange={(b) => setOb({ ...ob, brand: b })} /></span>
                <span style={{ width: 200 }}><BranchPicker value={ob.branch} onChange={(b) => setOb({ ...ob, branch: b })} activeOnly /></span>
                <input className="input num" style={{ width: 130 }} placeholder="Số dư" value={ob.amount} onChange={(e) => setOb({ ...ob, amount: e.target.value })} />
                <button className="btn btn-sm" disabled={!ob.brand || !ob.branch} onClick={() => { setOpening([{ brand: ob.brand, branch: ob.branch, amount: num(ob.amount) }]); setOb({ brand: '', branch: '', amount: '' }); }}><Plus size={13} /> Thêm / cập nhật</button>
              </div>
              <div className="scroll-box" style={{ maxHeight: 260 }}>
                <table className="mh-mini"><thead><tr><th>Nhãn</th><th>Chi nhánh</th><th className="num">Số dư</th><th style={{ width: 40 }} /></tr></thead><tbody>
                  {openings.map((o) => <tr key={o.brand + o.branch}><td><b>{brandName(o.brand) ?? o.brand}</b> <span className="mono muted">{o.brand}</span></td><td>{names.branchName(o.branch)} <span className="mono muted">{o.branch}</span></td><td className="num">{vnd(o.amount)}</td>
                    <td><button className="btn btn-xs" title="Bỏ dòng" onClick={() => { const m = { ...s.brandOpening, [o.brand]: { ...s.brandOpening[o.brand] } }; delete m[o.brand]![o.branch]; upd({ brandOpening: m }); }}>×</button></td></tr>)}
                  {!openings.length && <tr><td colSpan={4} className="muted">{find ? 'Không có dòng khớp.' : 'Chưa khai — chọn nhãn, chi nhánh, số dư rồi bấm Thêm; nhiều dòng thì Nhập Excel.'}</td></tr>}
                </tbody></table>
              </div>
            </div>
          </section>
        </div>

        <div className="mh-grid2">
          <section className="blk blk-blue">
            <header><div><b>③ Cảnh báo sắp đến hạn trả</b><span>Khoản nợ NCC còn ít ngày hơn số này thì hiện "sắp đến hạn".</span></div></header>
            <div className="blk-body"><div className="row" style={{ gap: 6, alignItems: 'center' }}>Báo trước <input className="input num" style={{ width: 70 }} value={s.warnDays} onChange={(e) => upd({ warnDays: Number(e.target.value) || 0 })} /> ngày</div>
              <div className="row" style={{ gap: 6, alignItems: 'center', marginTop: 8 }} title="Áp cho mọi mặt hàng, mọi NCC — không phải khai từng dòng giá">Đơn giá trên phiếu lệch quá <input className="input num" style={{ width: 60 }} value={s.priceWarnPct ?? 2} onChange={(e) => upd({ priceWarnPct: Number(e.target.value.replace(',', '.')) || 0 })} /> % so với giá NCC (hoặc lần nhập trước) thì cảnh báo; lệch quá gấp đôi mức này thì báo đỏ</div>
              <label className="row" style={{ gap: 6, alignItems: 'center', marginTop: 8 }} title="Quy trình: khai mã + giá của NCC → đơn đặt (duyệt, giữ hạn mức) → phiếu nhập lập từ đơn"><input type="checkbox" checked={Boolean(s.requireOrder)} onChange={(e) => upd({ requireOrder: e.target.checked })} /> Phiếu nhập mua phải lập từ đơn đặt đã duyệt (bật: chặn duyệt phiếu nhập không theo đơn; tắt: chỉ cảnh báo vàng)</label></div>
          </section>
          <section className="blk blk-green">
            <header><div><b>④ Tài khoản hạch toán khi duyệt phiếu mua</b><span>Để trống = phần mềm tự chọn theo hệ thống tài khoản (cột "Đang dùng").</span></div></header>
            <div className="blk-body">
              <table className="mh-mini"><thead><tr><th>Khoản</th><th style={{ width: 150 }}>Tài khoản riêng</th><th style={{ width: 120 }}>Đang dùng</th></tr></thead><tbody>
                {Object.entries(ACC_LABEL).map(([k, l]) => <tr key={k}><td>{l}</td><td><input className="input mono" value={s.accounts[k] ?? ''} placeholder="tự chọn" onChange={(e) => upd({ accounts: { ...s.accounts, [k]: e.target.value.trim() } })} /></td><td className="mono">{s.resolvedAccounts[k]}</td></tr>)}
              </tbody></table>
            </div>
          </section>
        </div>
      </div>
      <div className="mh-savebar">
        <button className="btn btn-primary" disabled={!dirty} onClick={() => void save()}>Lưu cài đặt</button>
        {dirty && <span className="mh-warn">Có thay đổi chưa lưu</span>}
        {msg && <span className={msg.ok ? 'mh-ok' : 'mh-bad'}>{msg.text}</span>}
      </div>

      {pasteDays && <DanNgay onClose={() => setPasteDays(false)} onAdd={(list) => { setPasteDays(false); addDays(list); }} />}
      {imp === 'days' && <NhapExcelChung<'day' | 'note', { day: string; note: string }> onClose={() => setImp('')} onAdd={(list) => { setImp(''); addDays(list.map((x) => x.day)); }} s={{
        title: 'Nhập ngày nghỉ, lễ từ Excel', file: 'mau-ngay-nghi-le.xlsx', keyField: 'day',
        columns: [{ name: 'Ngày', required: true, aliases: 'Ngày nghỉ, Ngày lễ', example: '17/02/2026', note: 'dd/mm/yyyy (hoặc ô kiểu ngày của Excel)' }, { name: 'Ghi chú', example: 'Tết Nguyên đán', note: 'Tuỳ ý' }],
        spec: [['day', ['ngay', 'ngay nghi', 'ngay le']], ['note', ['ghi chu']]],
        map: (r) => { const d = docNgay(r.day); return d ? { value: { day: d, note: r.note } } : { error: `ngày "${r.day}" không đọc được` }; },
        head: ['Ngày', 'Ghi chú'], cells: (x) => [dmy(x.day), x.note],
      }} />}
      {imp === 'open' && <NhapExcelChung<'brand' | 'branch' | 'amount', { brand: string; branch: string; amount: number }> onClose={() => setImp('')} onAdd={(list) => { setImp(''); setOpening(list); }} s={{
        title: 'Nhập số dư nợ theo nhãn tại chi nhánh từ Excel', file: 'mau-so-du-no-nhan.xlsx', keyField: 'brand',
        columns: [{ name: 'Nhãn', required: true, aliases: 'Mã nhãn, Nhãn hàng', example: 'ANLENE', note: 'Mã nhãn trong danh mục nhãn hàng (DM11)' }, { name: 'Chi nhánh', required: true, aliases: 'Mã chi nhánh', example: 'CN-ND', note: 'Mã chi nhánh' }, { name: 'Số dư', required: true, aliases: 'Số tiền', example: 250000000, note: 'Nợ nhãn tại chi nhánh lúc bắt đầu dùng (đ)' }],
        spec: [['brand', ['nhan', 'ma nhan', 'nhan hang']], ['branch', ['chi nhanh', 'ma chi nhanh']], ['amount', ['so du', 'so tien']]],
        map: (r) => { const b = String(r.brand).trim().toUpperCase(), br = String(r.branch).trim(); if (!brands.some((x) => x.code === b)) return { error: `nhãn ${b} chưa có trong danh mục` }; if (!names.branches.some((x) => x.code === br)) return { error: `chi nhánh ${br} không có` }; return { value: { brand: b, branch: br, amount: num(r.amount) } }; },
        head: ['Nhãn', 'Chi nhánh', 'Số dư'], cells: (x) => [x.brand, x.branch, vnd(x.amount)], note: 'Nhãn + chi nhánh đã có thì số dư được cập nhật.',
      }} />}
    </>
  );
}

function DanNgay({ onClose, onAdd }: { onClose: () => void; onAdd: (l: string[]) => void }) {
  const [text, setText] = useState('');
  const list = text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean).map((t) => ({ t, d: docNgay(t) }));
  const ok = [...new Set(list.filter((x) => x.d).map((x) => x.d!))];
  return (
    <Modal title="Dán nhiều ngày nghỉ" onClose={onClose} footer={<><button className="btn btn-primary" disabled={!ok.length} onClick={() => onAdd(ok)}>Thêm {ok.length} ngày</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full muted" style={{ fontSize: 12 }}>Mỗi ngày một dòng hoặc cách nhau bằng dấu phẩy, dạng dd/mm/yyyy (copy cột ngày từ Excel được).</div>
      <div className="full"><textarea className="input" rows={6} style={{ width: '100%' }} placeholder={'16/02/2026\n17/02/2026\n18/02/2026'} value={text} onChange={(e) => setText(e.target.value)} /></div>
      {list.some((x) => !x.d) && <div className="full mh-bad" style={{ fontSize: 12 }}>Không đọc được: {list.filter((x) => !x.d).map((x) => x.t).join(', ')}</div>}
    </Modal>
  );
}
