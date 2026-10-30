/**
 * ĐVT THÙNG ĐẶT HÀNG (MH27) — đặt hàng NCC chuẩn theo Thùng. Ba khối:
 *   ① Phạm vi: mã có tương tác mua gần đây (phiếu mua / đơn đặt, hoặc NCC khai mặt hàng & giá trong N ngày).
 *   ② Quy cách 1 thùng: sửa tay từng dòng hoặc nhập Excel ("12 Lốc", "48 Hộp", "12CAN/THÙNG") — luôn QUY VỀ ĐVT NHỎ NHẤT
 *      (12 Lốc × 4 = 48 Hộp). Không nhập thì phần mềm đoán (tên hàng, họ mã, cùng nhãn + dung tích), không có thì 48.
 *   ③ Chạy: thêm / sửa ĐVT Thùng, đặt làm ĐVT mua mặc định. Dòng giá NCC giữ nguyên (mỗi NCC × mã một dòng) — lập đơn tự quy đổi giá.
 *   Khối dọn: xoá dòng Thùng trống giá thừa mà bản đầu từng thêm. Máy chủ tính quy cách,
 *      màn này chỉ gửi chữ quy cách và hiện kết quả.
 */
import { useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { FileDown, FileUp } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { price as fmtPrice } from '@/lib/format';
import { P } from '../du-lieu';
import '../mua-hang.css';
import './dvt-thung.css';

interface NccRow { partnerCode: string; fromUnit: string; price: number | null; toPrice: number | null; action: 'auto' | 'ok' }
type Action = 'add' | 'ratio' | 'default' | 'ok' | 'error';
interface Row {
  sku: string; name: string; baseUnit: string; units: { unit: string; ratio: number; isPurchaseDefault: boolean }[];
  action: Action; thungUnit: string; ratio: number; source: string; reason: string; ncc: NccRow[]; spec?: string; error?: string; oldRatio?: number;
}
interface Plan { days: number; since: string; rows: Row[]; skipped: { sku: string; name: string; reason: string }[]; unknown: string[] }
interface Result { products: number; added: number; defaulted: number; ratioFixed: number; nccAdded: number; nccMarked: number; errors: number; skipped: number }

const ACTION: Record<Action, { label: string; cls: string; tip: string }> = {
  add: { label: 'Thêm Thùng', cls: 'add', tip: 'Mã chưa có ĐVT kiểu thùng: thêm ĐVT "Thùng" theo quy cách, đặt làm ĐVT mua mặc định' },
  ratio: { label: 'Sửa tỉ lệ thùng', cls: 'ratio', tip: 'Mã đã có thùng nhưng quy cách nhập vào khác: sửa tỉ lệ thùng theo quy cách mới, đặt làm ĐVT mua mặc định' },
  default: { label: 'Đặt mua theo thùng', cls: 'default', tip: 'Mã đã có ĐVT kiểu thùng (giữ tỉ lệ), chỉ đặt làm ĐVT mua mặc định' },
  ok: { label: 'Đã chuẩn', cls: 'ok', tip: 'Đã có thùng và đang là ĐVT mua mặc định — chỉ rà dòng giá NCC' },
  error: { label: 'Quy cách lỗi', cls: 'error', tip: 'Quy cách nhập vào không đọc được hoặc ĐVT không có ở mã — sửa ô quy cách, dòng này không chạy' },
};
const PAGE = 200;
const n0 = (n: number) => n.toLocaleString('vi-VN');
const busy = (r: Row) => r.action !== 'error' && r.action !== 'ok';
const plain = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

/**
 * Đọc Excel quy cách: tìm dòng tiêu đề trong 15 dòng đầu. Cột mã: "Mã hàng" / "Mã TGS" / "Mã". Quy cách: một cột "Quy cách" / "Loại"
 * (vd 12CAN/THÙNG), hoặc hai cột "SL trong thùng" + "ĐVT trong thùng". Ô mã trống (ô gộp) thì bỏ qua dòng.
 */
async function readSpecs(file: File): Promise<{ specs: Record<string, string>; rows: number; note: string }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const specs: Record<string, string> = {};
  let rows = 0;
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: '' });
    for (let h = 0; h < Math.min(15, grid.length); h++) {
      const head = (grid[h] ?? []).map(plain);
      const sku = head.findIndex((x) => /^ma( hang| tgs| sp)?$/.test(x));
      const spec = head.findIndex((x) => /quy cach|^loai$/.test(x));
      const qty = head.findIndex((x) => /^(sl|so luong).*thung/.test(x));
      const unit = head.findIndex((x) => /^dvt.*thung/.test(x));
      if (sku < 0 || (spec < 0 && qty < 0)) continue;
      for (const r of grid.slice(h + 1)) {
        const code = String(r[sku] ?? '').trim();
        const text = spec >= 0 ? String(r[spec] ?? '').trim() : `${String(r[qty] ?? '').trim()} ${unit >= 0 ? String(r[unit] ?? '').trim() : ''}`.trim();
        if (!code || !text || !/\d/.test(text)) continue;
        specs[code] = text; rows++;
      }
      break;
    }
  }
  return { specs, rows, note: rows ? '' : 'Không thấy cột "Mã hàng" và "Quy cách 1 thùng" (hoặc "Loại", hoặc "SL trong thùng" + "ĐVT trong thùng"). Tải file mẫu để xem.' };
}

export function DvtThungPage() {
  const [days, setDays] = useState(30);
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<Set<string> | null>(null);
  const [filter, setFilter] = useState<'' | Action | 'spec'>('');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [done, setDone] = useState<Result | null>(null);
  const [imp, setImp] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ['mua-hang', 'thung', days, specs], placeholderData: keepPreviousData,
    queryFn: () => api.post<Plan>(`${P}/units/thung/preview`, { days, specs }) });
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const todo = rows.filter(busy);
  const sel = pick ?? new Set(todo.map((r) => r.sku));
  const nSel = todo.filter((r) => sel.has(r.sku)).length;
  const count = (a: Action) => rows.filter((r) => r.action === a).length;
  const view = rows.filter((r) => (!filter || (filter === 'spec' ? Boolean(r.spec) : r.action === filter))
    && (!search || `${r.sku} ${r.name}`.toLowerCase().includes(search.trim().toLowerCase())));
  const toggle = (sku: string, on: boolean) => setPick(() => { const s = new Set(sel); if (on) s.add(sku); else s.delete(sku); return s; });
  const commit = (sku: string) => {
    const v = (draft[sku] ?? '').trim();
    setSpecs((x) => { const y = { ...x }; if (v) y[sku] = v; else delete y[sku]; return y; });
  };

  const run = useMutation({
    mutationFn: () => api.post<Result>(`${P}/units/thung/apply`, { days, specs, skus: todo.filter((r) => sel.has(r.sku)).map((r) => r.sku) }),
    onSuccess: async (r) => { setDone(r); setPick(null); setSpecs({}); setDraft({}); await q.refetch(); },
  });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setImp(null);
    try {
      const r = await readSpecs(f);
      if (!r.rows) { setImp({ ok: false, text: r.note }); return; }
      setSpecs((x) => ({ ...x, ...r.specs }));
      setDraft((x) => ({ ...x, ...r.specs }));
      setPick(null); setFilter('spec');
      setImp({ ok: true, text: `Đã đọc ${n0(r.rows)} dòng quy cách từ "${f.name}". Xem cột Quy cách 1 thùng — dòng đỏ là quy cách lỗi, sửa ngay trên dòng.` });
    } catch (e) { setImp({ ok: false, text: `Không đọc được tệp: ${errorText(e)}` }); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const template = async () => {
    const XLSX = await import('xlsx');
    const data = [['Mã hàng', 'Tên hàng', 'ĐVT nhỏ nhất', 'ĐVT đang có', 'Quy cách 1 thùng']];
    for (const r of rows) data.push([r.sku, r.name, r.baseUnit, r.units.map((u) => (u.ratio === 1 ? u.unit : `${u.unit}=${u.ratio} ${r.baseUnit}`)).join('; '), r.spec ?? '']);
    if (rows.length <= 1) data.push(['110154035', 'Ví dụ: Sữa 180ml', 'Hộp', 'Hộp; Lốc=4 Hộp', '12 Lốc'], ['171729007', 'Ví dụ: Nước giặt 1,2L', 'Can', 'Can', '12CAN/THÙNG']);
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 14 }, { wch: 46 }, { wch: 12 }, { wch: 30 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Quy cach thung');
    XLSX.writeFile(wb, 'quy-cach-thung.xlsx');
  };

  return (
    <>
      <PageHeader title="ĐVT Thùng đặt hàng" code="MH27" helpKey="mua-hang-dvt-thung"
        subtitle="Đặt hàng NCC chuẩn theo Thùng. Khai quy cách 1 thùng (12 Lốc, 48 Hộp, 12CAN/THÙNG…) — phần mềm quy về ĐVT nhỏ nhất, tạo ĐVT Thùng, đặt làm ĐVT mua mặc định." />
      <ErrorBox error={q.error ? errorText(q.error) : run.error ? errorText(run.error) : null} />

      <div className="th-steps">
        <section className="th-step s1">
          <div className="th-step-h"><span className="th-num">1</span> Chọn mã</div>
          <label title="Mã có phiếu mua / đơn đặt trong ngần này ngày, hoặc dòng Mặt hàng & giá mua của NCC khai / sửa trong ngần này ngày. 0 = mọi mã NCC đang khai">
            Mua / NCC khai trong <input className="input" type="number" min={0} max={3650} style={{ width: 64 }} value={days} onChange={(e) => { setDays(Math.max(0, Number(e.target.value) || 0)); setPick(null); }} /> ngày
          </label>
          <div className="th-step-note">{q.data ? (q.data.days ? `từ ${q.data.since.split('-').reverse().join('/')}` : 'mọi mã NCC đang khai') : '…'} · cộng mã có trong file quy cách</div>
        </section>
        <section className="th-step s2">
          <div className="th-step-h"><span className="th-num">2</span> Quy cách 1 thùng</div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()} title="Nạp file Excel có cột Mã hàng + Quy cách 1 thùng (hoặc Loại kiểu 12CAN/THÙNG, hoặc SL trong thùng + ĐVT trong thùng). Đọc được cả file đặt hàng của NCC"><FileUp size={14} /> Nhập Excel</button>
            <button className="btn btn-sm" onClick={() => void template()} title="Tải danh sách mã đang xem ra Excel (có ĐVT đang có của từng mã), điền cột Quy cách 1 thùng rồi nạp lại"><FileDown size={14} /> Tải file mẫu</button>
            {Object.keys(specs).length > 0 && <button className="btn btn-sm" onClick={() => { setSpecs({}); setDraft({}); }} title="Bỏ mọi quy cách đã nhập / sửa tay, quay về tỉ lệ phần mềm đoán">Bỏ quy cách đã nhập ({Object.keys(specs).length})</button>}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
          <div className="th-step-note">Ghi theo ĐVT NCC hay dùng: <b>12 Lốc</b>, <b>48 Hộp</b>, <b>12CAN/THÙNG</b>. Luôn quy về ĐVT nhỏ nhất: 12 Lốc × 4 = <b>48 Hộp</b>.</div>
        </section>
        <section className="th-step s3">
          <div className="th-step-h"><span className="th-num">3</span> Chạy</div>
          <button className="btn btn-primary" disabled={!nSel || run.isPending || q.isFetching}
            title="Ghi thật cho các mã đang tích: thêm / sửa ĐVT Thùng, đặt ĐVT mua mặc định; dòng giá NCC giữ nguyên, lập đơn tự quy đổi. Ghi vào Nhật ký mua hàng (MH10)"
            onClick={() => { if (window.confirm(`Chạy cho ${n0(nSel)} mã? Thêm / sửa ĐVT Thùng, đặt làm ĐVT mua mặc định. Dòng giá NCC giữ nguyên.`)) run.mutate(); }}>
            {run.isPending ? 'Đang chạy…' : `Chạy cho ${n0(nSel)} mã`}</button>
          <div className="th-step-note">Dòng giá NCC giữ nguyên — lập đơn tự lấy Thùng, giá quy đổi · dòng lỗi không chạy</div>
        </section>
      </div>

      <DonDongThungTrong />
      {imp && <div className={`alert ${imp.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 0 8px' }}>{imp.text}</div>}
      {q.data && q.data.unknown.length > 0 && <div className="alert alert-bad" style={{ margin: '0 0 8px' }}>
        {n0(q.data.unknown.length)} mã trong file quy cách chưa có ở danh mục mặt hàng: {q.data.unknown.slice(0, 15).join(', ')}{q.data.unknown.length > 15 ? '…' : ''}</div>}
      {done && <div className="alert alert-ok" style={{ margin: '0 0 8px' }}>
        Đã chạy: thêm Thùng {n0(done.added)} mã · sửa tỉ lệ {n0(done.ratioFixed)} mã · đặt mua theo thùng {n0(done.defaulted)} mã · đánh dấu {n0(done.nccMarked)} dòng NCC đã có thùng.
      </div>}

      <section className="mh-panel">
        <div className="th-chips">
          {([['', `Tất cả ${n0(rows.length)}`, 'all'], ['add', `Thêm Thùng ${n0(count('add'))}`, 'add'], ['ratio', `Sửa tỉ lệ ${n0(count('ratio'))}`, 'ratio'], ['default', `Đặt mua theo thùng ${n0(count('default'))}`, 'default'], ['ok', `Đã chuẩn ${n0(count('ok'))}`, 'ok'], ['error', `Quy cách lỗi ${n0(count('error'))}`, 'error'], ['spec', `Có quy cách nhập ${n0(rows.filter((r) => r.spec).length)}`, 'spec']] as const).map(([k, l, c]) => (
            <button key={k} type="button" className={`th-chip ${c}${filter === k ? ' on' : ''}`} onClick={() => { setFilter(k); setShown(PAGE); }} title="Lọc theo việc sẽ làm">{l}</button>
          ))}
          <input className="input" style={{ width: 220, marginLeft: 'auto' }} placeholder="Tìm mã / tên hàng" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} />
          {q.data && q.data.skipped.length > 0 && <span className="muted" style={{ fontSize: 12 }} title={q.data.skipped.slice(0, 40).map((s) => `${s.sku} ${s.name}: ${s.reason}`).join('\n')}>Bỏ qua {q.data.skipped.length} mã (rê chuột xem)</span>}
        </div>
        {q.isLoading ? <Loading /> : (
          <div className="table-wrap"><table className="grid th-grid">
            <thead><tr>
              <th title="Tích = chạy cho mã này. Mặc định tích mọi mã có việc phải làm (dòng lỗi không tích được)">
                <input type="checkbox" checked={nSel === todo.length && todo.length > 0} onChange={(e) => setPick(e.target.checked ? null : new Set())} />
              </th>
              <th title="Mã hàng, tên hàng; dưới tên là lý do có trong danh sách (mua gần đây / NCC khai / nhập quy cách)">Mặt hàng</th>
              <th title="Các ĐVT đang có: tên × tỉ lệ về ĐVT nhỏ nhất; ★ = ĐVT mua mặc định hiện tại">ĐVT hiện có</th>
              <th title="Quy cách 1 thùng theo ĐVT NCC hay dùng, vd 12 Lốc / 48 Hộp / 12CAN/THÙNG. Gõ xong bấm Enter hoặc rời ô để tính lại. Trống = phần mềm đoán">Quy cách 1 thùng</th>
              <th className="num" title="Kết quả cuối cùng: 1 thùng = bao nhiêu ĐVT NHỎ NHẤT (đây là tỉ lệ được ghi vào ĐVT Thùng)">= ĐVT nhỏ nhất</th>
              <th title="Việc sẽ làm với ĐVT của mặt hàng; dưới là căn cứ tỉ lệ (quy cách nhập, tên hàng, họ mã, cùng nhãn + dung tích, mặc định 48)">Việc làm · căn cứ</th>
              <th title="Theo từng NCC: dòng giá giữ nguyên, không thêm dòng. Lập đơn theo Thùng tự quy đổi (= giá ÷ tỉ lệ ĐVT của dòng × tỉ lệ thùng, số ≈ là để xem). NCC đã có dòng Thùng thì đánh dấu Đặt theo ĐVT này">Giá NCC theo Thùng</th>
            </tr></thead>
            <tbody>
              {view.slice(0, shown).map((r) => {
                const a = ACTION[r.action];
                const work = busy(r);
                return (
                  <tr key={r.sku} className={`th-row ${a.cls}`}>
                    <td><input type="checkbox" disabled={!work} checked={work && sel.has(r.sku)} onChange={(e) => toggle(r.sku, e.target.checked)} title={work ? 'Chạy cho mã này' : r.action === 'error' ? 'Quy cách lỗi — sửa ô quy cách' : 'Không có gì phải đổi'} /></td>
                    <td><span className="mono">{r.sku}</span><div style={{ fontSize: 12 }}>{r.name}</div><div className="muted" style={{ fontSize: 11 }}>{r.reason}</div></td>
                    <td style={{ fontSize: 12 }}>{r.units.map((u) => <div key={u.unit} title={u.isPurchaseDefault ? 'ĐVT mua mặc định hiện tại' : undefined}>{u.isPurchaseDefault ? '★ ' : ''}{u.unit}{u.ratio !== 1 ? <span className="muted"> = {n0(u.ratio)} {r.baseUnit}</span> : <span className="muted"> (nhỏ nhất)</span>}</div>)}</td>
                    <td style={{ width: 150 }}>
                      <input className={`input th-spec${r.error ? ' bad' : ''}`} placeholder={`vd 12 Lốc`} value={draft[r.sku] ?? r.spec ?? ''}
                        title="Quy cách 1 thùng — vd 12 Lốc, 48 Hộp, 12CAN/THÙNG. Enter hoặc rời ô để tính lại"
                        onChange={(e) => setDraft((x) => ({ ...x, [r.sku]: e.target.value }))} onBlur={() => commit(r.sku)} onKeyDown={(e) => { if (e.key === 'Enter') commit(r.sku); }} />
                      {r.error && <div className="th-err">{r.error}</div>}
                    </td>
                    <td className="num">
                      {r.action === 'error' ? <span className="muted">—</span> : (
                        <span className="th-base" title={`Ghi vào ĐVT ${r.thungUnit}: 1 ${r.thungUnit} = ${r.ratio} ${r.baseUnit}`}>
                          {r.oldRatio !== undefined && <s className="muted" style={{ marginRight: 4 }}>{n0(r.oldRatio)}</s>}{n0(r.ratio)} {r.baseUnit}
                        </span>)}
                    </td>
                    <td><span className={`th-badge ${a.cls}`} title={a.tip}>{a.label}</span><div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{r.source}</div></td>
                    <td style={{ fontSize: 12 }}>{r.ncc.length ? r.ncc.map((n) => (
                      <div key={n.partnerCode} title={n.action === 'ok' ? 'NCC đã có dòng giá theo thùng' : `Dòng ${n.fromUnit}${n.price !== null ? ` ${fmtPrice(n.price)}` : ''} giữ nguyên — lập đơn theo ${r.thungUnit} tự quy đổi`}>
                        <span className="mono">{n.partnerCode}</span>{' '}
                        {n.action === 'ok' ? <span className="muted">đã có {n.fromUnit}{n.toPrice !== null ? ` · ${fmtPrice(n.toPrice)}` : ''}</span>
                          : <>{n.fromUnit}{n.price !== null ? ` ${fmtPrice(n.price)}` : ''} → đặt theo <b>{r.thungUnit}</b>{n.toPrice !== null ? <span className="muted"> ≈ {fmtPrice(n.toPrice)}</span> : ''}</>}
                      </div>)) : <span className="muted">chưa NCC nào khai</span>}</td>
                  </tr>
                );
              })}
              {!view.length && <tr><td colSpan={7} className="muted">Không có mã nào.</td></tr>}
            </tbody>
          </table></div>
        )}
        {view.length > shown && <div style={{ marginTop: 8 }}><button className="btn btn-sm" onClick={() => setShown((n) => n + PAGE * 5)}>Xem thêm ({n0(view.length - shown)} mã nữa)</button></div>}
      </section>
    </>
  );
}

/** Dọn dòng Thùng trống giá mà bản MH27 đầu (30/10) từng thêm cho NCC — mỗi NCC × mã chỉ giữ dòng có giá. Xem trước, rồi xoá có xác nhận. */
function DonDongThungTrong() {
  const q = useQuery({ queryKey: ['mua-hang', 'thung', 'empty-rows'], queryFn: () => api.get<{ id: string; partnerCode: string; sku: string; name: string; unit: string; keepUnit: string; keepPrice: number }[]>(`${P}/units/thung/empty-rows`) });
  const [open, setOpen] = useState(false);
  const del = useMutation({ mutationFn: () => api.post<{ count: number }>(`${P}/units/thung/empty-rows/delete`, {}), onSuccess: () => void q.refetch() });
  const list = q.data ?? [];
  if (!list.length && !del.data) return null;
  return (
    <div className="alert alert-warn" style={{ margin: '0 0 8px' }}>
      {del.data ? <>Đã xoá {n0(del.data.count)} dòng Thùng trống giá thừa (ghi ở Nhật ký mua hàng MH10, đủ nội dung).</> : <>
        <b>{n0(list.length)} dòng Thùng trống giá thừa</b> ở <i>Mặt hàng &amp; giá mua</i> của NCC (bản đầu của màn này từng thêm). Mỗi NCC × mã chỉ cần một dòng giá — lập đơn tự lấy Thùng và quy đổi giá từ dòng đó.{' '}
        <button className="btn btn-sm" onClick={() => setOpen((x) => !x)}>{open ? 'Ẩn danh sách' : 'Xem danh sách'}</button>{' '}
        <button className="btn btn-sm btn-danger" disabled={del.isPending} title="Xoá vĩnh viễn các dòng trong danh sách; ghi đủ nội dung vào Nhật ký mua hàng (MH10)"
          onClick={() => { if (window.confirm(`Xoá vĩnh viễn ${n0(list.length)} dòng Thùng trống giá? Dòng có giá của NCC giữ nguyên.`)) del.mutate(); }}>{del.isPending ? 'Đang xoá…' : `Xoá ${n0(list.length)} dòng thừa`}</button>
        {del.error && <div className="mh-bad">{errorText(del.error)}</div>}
        {open && <div className="table-wrap" style={{ maxHeight: 260, marginTop: 6 }}><table className="grid"><thead><tr><th>NCC</th><th>Mã</th><th>Tên hàng</th><th title="Dòng trống sẽ xoá">Dòng xoá</th><th title="Dòng có giá của cùng NCC × mã — giữ nguyên">Dòng giữ</th></tr></thead>
          <tbody>{list.slice(0, 500).map((r) => <tr key={r.id}><td className="mono">{r.partnerCode}</td><td className="mono">{r.sku}</td><td>{r.name}</td><td>{r.unit} (trống giá)</td><td>{r.keepUnit} {fmtPrice(r.keepPrice)}</td></tr>)}</tbody></table></div>}
      </>}
    </div>
  );
}
