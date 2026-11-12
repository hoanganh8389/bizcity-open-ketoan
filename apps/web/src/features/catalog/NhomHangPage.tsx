// [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — màn Nhóm hàng (DM11) làm lại gọn: cây trái, form trên, lưới nhóm con dưới; bỏ các thẻ ngành / nhãn / loại (đóng góp)
// [2026-11-12 Nguyễn Văn Thủy] DM11 thiết kế lại cho dễ hiểu: bên phải là thẻ của nhóm đang chọn (đường dẫn, mã, tên, ai tạo / sửa)
//   với nút ngay tại chỗ (Sửa, + Thêm nhóm con); thêm / sửa mở hộp thoại, mã điền sẵn gợi ý; lưới có lọc theo cấp; không xoá (0116) (đóng góp)
/**
 * NHÓM HÀNG (DM11) — một cây: cấp 1 → cấp 2 → cấp 3 (→ cấp 4, 5 chia nhỏ, không ghép mã hàng).
 *   Trái: cây. Phải: thẻ nhóm đang chọn + thẻ Nhóm con (lọc theo cấp) | Lịch sử.
 *   Mã nhóm hàng ghép vào mã hàng: cấp 1 = 2 chữ số (không bắt đầu bằng 0), cấp 2 = 3 ký tự, cấp 3 = 1 ký tự.
 *   Không có xoá: bỏ tích Đang dùng để ngừng. Mã nội bộ của nhóm tự cấp, không hiện.
 */
import { useMemo, useState } from 'react';
import { luuExcel } from '@/lib/excelChuan';
import { ProductEditor } from './ProductsPage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Pencil, Plus, RefreshCw } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { CayNhomHang, indexNhom, MA_NGAN_DAI, useNhomHang, type NhomHang, type NhomIndex } from '@/components/CayNhomHang';
import './lich-su.css';
import './nhom-hang.css';

// [2026-11-12 Nguyễn Văn Thủy] ba ô như danh mục cũ: Mã nhóm hàng (tên ngắn trên cây), Mã ngắn (ghép mã hàng), Tên nhóm hàng (đầy đủ) (đóng góp)
const QUY_TAC: Record<number, string> = { 1: '2 chữ số, không bắt đầu bằng 0', 2: '3 ký tự (chữ hoặc số)', 3: '1 ký tự (chữ hoặc số)' };
const luc = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/** Mã gợi ý cho nhóm mới dưới parent: số kế tiếp trong các nhóm cùng cha, đủ độ dài của cấp (cấp 1 từ 10). */
function goiYMa(ix: NhomIndex, parent: string | null): string {
  const lv = ix.level(parent) + 1;
  const n = MA_NGAN_DAI[lv];
  if (!n) return '';
  const used = (parent ? ix.kids.get(parent) ?? [] : ix.roots).map((c) => c.skuCode ?? '');
  const nums = used.filter((x) => x.length === n && /^\d+$/.test(x)).map(Number);
  for (let v = Math.max(lv === 1 ? 9 : 0, ...nums) + 1; String(v).length <= n; v++) { const s = String(v).padStart(n, '0'); if (!used.includes(s)) return s; }
  for (let v = lv === 1 ? 10 : 0; String(v).length <= n; v++) { const s = String(v).padStart(n, '0'); if (!used.includes(s)) return s; }
  return '';
}

export function NhomHangPage() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const q = useNhomHang();
  const ix = useMemo(() => indexNhom(q.data), [q.data]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [tim, setTim] = useState('');
  const [cap, setCap] = useState(0); // 0 = cây; 1..5 = danh sách phẳng một cấp
  const [form, setForm] = useState<null | { mode: 'add'; parent: string | null } | { mode: 'edit'; code: string }>(null);
  const [lichSu, setLichSu] = useState<NhomHang | null>(null);
  const [vua, setVua] = useState<string | null>(null); // dòng vừa ghi: tô sáng
  const [themMH, setThemMH] = useState<string | null>(null); // nhóm cấp 3 đang thêm mặt hàng
  // Cột phụ ẩn / hiện (nhớ theo trình duyệt): Tên nhóm hàng, Ghi chú, Người tạo, Người sửa.
  const COT_PHU = [['full', 'Tên nhóm hàng'], ['note', 'Ghi chú'], ['tao', 'Người tạo'], ['sua', 'Người sửa']] as const;
  const [cot, setCot] = useState<Record<string, boolean>>(() => { try { return { full: true, note: true, tao: false, sua: false, ...JSON.parse(localStorage.getItem('dm11-cot') ?? '{}') }; } catch { return { full: true, note: true, tao: false, sua: false }; } });
  const doiCot = (k: string) => setCot((x) => { const n = { ...x, [k]: !x[k] }; try { localStorage.setItem('dm11-cot', JSON.stringify(n)); } catch { /* bỏ qua */ } return n; });
  const [moCot, setMoCot] = useState(false);

  const thieuMa = (c: NhomHang) => Boolean(MA_NGAN_DAI[ix.level(c.code)]) && !c.skuCode;
  // Số mặt hàng cộng dồn cả nhánh con.
  const tongMH = useMemo(() => {
    const m = new Map<string, number>();
    const of = (code: string): number => { if (m.has(code)) return m.get(code)!; m.set(code, 0); const n = (ix.byCode.get(code)?.products ?? 0) + (ix.kids.get(code) ?? []).reduce((s, k) => s + of(k.code), 0); m.set(code, n); return n; };
    for (const c of q.data ?? []) of(c.code);
    return m;
  }, [q.data, ix]);
  const bo = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  // Đang tìm: giữ nhóm khớp + mọi nhóm cha của nó (mở sẵn).
  const khop = useMemo(() => {
    const t = bo(tim.trim());
    if (!t) return null;
    const keep = new Set<string>();
    for (const c of q.data ?? []) if (bo(`${c.skuCode ?? ''} ${c.name} ${c.fullName ?? ''}`).includes(t)) for (let x: string | null = c.code; x; x = ix.parentOf(x)) keep.add(x);
    return keep;
  }, [tim, q.data, ix]); // eslint-disable-line react-hooks/exhaustive-deps

  type Dong = { c: NhomHang; depth: number; hasKids: boolean; isOpen: boolean };
  const dong: Dong[] = [];
  if (cap) {
    for (const c of (q.data ?? []).filter((x) => ix.level(x.code) === cap && (!khop || khop.has(x.code))).sort((a, b) => ix.path(a.code).localeCompare(ix.path(b.code), 'vi'))) dong.push({ c, depth: 0, hasKids: false, isOpen: false });
  } else {
    const walk = (list: NhomHang[], depth: number) => {
      for (const c of list) {
        if (khop && !khop.has(c.code)) continue;
        const kids = ix.kids.get(c.code) ?? [];
        const isOpen = Boolean(khop) || open.has(c.code);
        dong.push({ c, depth, hasKids: kids.length > 0, isOpen });
        if (isOpen) walk(kids, depth + 1);
      }
    };
    walk(ix.roots, 0);
  }
  const lat = (code: string) => setOpen((o) => { const n = new Set(o); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const moHet = () => setOpen(new Set((q.data ?? []).filter((c) => (ix.kids.get(c.code) ?? []).length).map((c) => c.code)));

  const xuat = () => void luuExcel('nhom-hang.xlsx', [{ name: 'Nhóm hàng', plainBody: true, rows: [
    ['Nhóm cha', 'Mã nhóm hàng', 'Mã ngắn', 'Tên nhóm hàng', 'Cấp', 'Số mặt hàng', 'Đang dùng', 'Ghi chú', 'Người tạo', 'Lúc tạo', 'Người sửa', 'Lúc sửa'],
    ...(q.data ?? []).map((c) => [ix.path(ix.parentOf(c.code)), c.name, c.skuCode ?? '', c.fullName ?? '', ix.level(c.code), tongMH.get(c.code) ?? 0, c.isActive ? 'Có' : 'Không', c.note ?? '', c.createdBy ?? '', luc(c.createdAt), c.updatedBy ?? '', c.updatedBy ? luc(c.updatedAt) : '']),
  ] }]);

  return (
    <>
      <PageHeader title="Nhóm hàng" code="DM11" helpKey="nhom-hang" subtitle="Cây nhóm hàng — mã hàng ghép từ mã nhóm cấp 1, 2, 3" />
      <div className="card">
        <div className="nh-bar">
          <input className="input" style={{ width: 260 }} placeholder="Tìm theo mã hoặc tên nhóm…" value={tim} onChange={(e) => setTim(e.target.value)} />
          <select className="select input" style={{ width: 190 }} value={cap} onChange={(e) => setCap(Number(e.target.value))}>
            <option value={0}>Xem dạng cây</option>
            {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>Chỉ nhóm cấp {l}</option>)}
          </select>
          {!cap && <button className="btn btn-sm" onClick={moHet}>Mở hết</button>}
          {!cap && <button className="btn btn-sm" onClick={() => setOpen(new Set())}>Thu hết</button>}
          <span style={{ flex: 1 }} />
          <span style={{ position: 'relative' }}>
            <button className="btn btn-sm" onClick={() => setMoCot((x) => !x)} title="Ẩn / hiện cột">Cột ▾</button>
            {moCot && <div className="nh-cot" onMouseLeave={() => setMoCot(false)}>{COT_PHU.map(([k, l]) => <label key={k} className="checkbox"><input type="checkbox" checked={Boolean(cot[k])} onChange={() => doiCot(k)} /> {l}</label>)}</div>}
          </span>
          <button className="btn btn-sm" onClick={() => void q.refetch()}><RefreshCw size={14} /> Nạp</button>
          <button className="btn btn-sm" onClick={xuat}><FileDown size={14} /> Xuất</button>
          {canWrite && <NutNhapExcel loai={nhapLoai('nhom-hang')!} />}
        </div>
        <div className="muted nh-rule">Mã ngắn — cấp 1: {QUY_TAC[1]} · cấp 2: {QUY_TAC[2]} · cấp 3: {QUY_TAC[3]}</div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <div className="nh-table-wrap">
            <table className="nh-table">
              <thead><tr>
                <th style={{ width: 45 }} className="num">STT</th><th style={{ width: 80 }} title="Mã ngắn (mã ghép) — ghép vào mã hàng">Mã ngắn</th><th>Mã nhóm hàng</th>{cot.full && <th>Tên nhóm hàng</th>}<th style={{ width: 50 }}>Cấp</th>
                <th style={{ width: 95 }} className="num" title="Số mặt hàng trong nhóm, cộng cả các nhóm con">Số mặt hàng</th><th style={{ width: 80 }}>Đang dùng</th>{cot.note && <th style={{ width: 180 }}>Ghi chú</th>}
                {cot.tao && <th style={{ width: 160 }}>Người tạo</th>}{cot.sua && <th style={{ width: 160 }}>Người sửa</th>}<th style={{ width: 240 }} />
              </tr></thead>
              <tbody>
                {/* [2026-11-12 Nguyễn Văn Thủy] thêm ngành mới: dòng mờ đầu cây thay cho nút xanh trên thanh (đóng góp) */}
                {canWrite && !cap && !tim && (
                  <tr className="nh-them" onClick={() => setForm({ mode: 'add', parent: null })}>
                    <td colSpan={20}><Plus size={13} /> Thêm nhóm cấp 1 (ngành hàng mới)</td>
                  </tr>
                )}
                {dong.map(({ c, depth, hasKids, isOpen }, stt) => (
                  <tr key={c.code} className={`${c.isActive ? '' : 'muted'} ${vua === c.code ? 'nh-vua' : ''} ${hasKids ? 'nh-mo' : ''}`} onClick={(e) => { if (hasKids && !(e.target as HTMLElement).closest('button')) lat(c.code); }}>
                    <td className="num muted">{stt + 1}</td>
                    <td className="mono">{thieuMa(c) ? <span className="neg" title="Nhóm chưa có mã ngắn — bấm Sửa để nhập">chưa có</span> : c.skuCode}</td>
                    <td>
                      <span style={{ paddingLeft: depth * 20, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span className="nh-tog">{hasKids ? (isOpen ? '▾' : '▸') : ''}</span>
                        <span style={{ fontWeight: depth === 0 && !cap ? 600 : 400 }}>{c.name}</span>
                        {cap > 0 && <span className="muted" style={{ fontSize: 12 }}>· {ix.path(ix.parentOf(c.code))}</span>}
                      </span>
                    </td>
                    {cot.full && <td className="nh-full">{c.fullName}</td>}
                    <td>{ix.level(c.code)}</td>
                    <td className="num">{tongMH.get(c.code) || ''}</td>
                    <td>{c.isActive ? 'Có' : <span className="neg">Ngừng</span>}</td>
                    {cot.note && <td className="nh-note" title={c.note}>{c.note}</td>}
                    {cot.tao && <td className="nh-ai">{c.createdBy}{c.createdAt ? <span>{luc(c.createdAt)}</span> : null}</td>}
                    {cot.sua && <td className="nh-ai">{c.updatedBy}{c.updatedBy && c.updatedAt ? <span>{luc(c.updatedAt)}</span> : null}</td>}
                    <td className="nh-act">
                      {canWrite && <button className="btn btn-xs" onClick={() => setForm({ mode: 'edit', code: c.code })}><Pencil size={12} /> Sửa</button>}
                      {canWrite && ix.level(c.code) === 3
                        ? <button className="btn btn-xs btn-primary" onClick={() => setThemMH(c.code)} title={`Thêm mặt hàng vào nhóm "${c.name}" — mã tự sinh theo nhóm`}><Plus size={12} /> Mặt hàng</button>
                        : canWrite && ix.level(c.code) < 3 && <button className="btn btn-xs" onClick={() => setForm({ mode: 'add', parent: c.code })} title={`Thêm nhóm cấp ${ix.level(c.code) + 1} dưới "${c.name}"`}><Plus size={12} /> Nhóm con</button>}
                      <button className="btn btn-xs" onClick={() => setLichSu(c)}>Lịch sử</button>
                    </td>
                  </tr>
                ))}
                {!dong.length && <tr><td colSpan={11} className="muted" style={{ padding: 12 }}>{tim ? 'Không có nhóm khớp' : 'Chưa có nhóm hàng — bấm Thêm nhóm cấp 1'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {form && <NhomForm ix={ix} list={q.data ?? []} form={form} onClose={() => setForm(null)} onSaved={(code, parent) => {
        setForm(null); setVua(code);
        if (parent) setOpen((o) => { const n = new Set(o); for (let x: string | null = parent; x; x = ix.parentOf(x)) n.add(x); return n; });
      }} />}
      {themMH && <ProductEditor sku={null} initial={{ groupCode: themMH }} onClose={() => setThemMH(null)} onSaved={() => void q.refetch()} />}
      {lichSu && <Modal title={`Lịch sử nhóm "${lichSu.name}"`} onClose={() => setLichSu(null)} footer={<button className="btn" onClick={() => setLichSu(null)}>Đóng</button>}><div className="full"><LichSuNhom code={lichSu.code} /></div></Modal>}
    </>
  );
}

/** Hộp thoại thêm / sửa nhóm: thuộc nhóm, mã (điền sẵn gợi ý), tên, đang dùng. */
function NhomForm({ ix, list, form, onClose, onSaved }: { ix: NhomIndex; list: NhomHang[]; form: { mode: 'add'; parent: string | null } | { mode: 'edit'; code: string }; onClose: () => void; onSaved: (code: string, parent: string | null) => void }) {
  const qc = useQueryClient();
  const old = form.mode === 'edit' ? ix.byCode.get(form.code)! : null;
  const [parent, setParent] = useState<string | null>(form.mode === 'add' ? form.parent : ix.parentOf(form.code));
  // Nhóm cũ chưa có mã ngắn: điền sẵn mã gợi ý (nhập lần đầu không làm đổi mã hàng đã có).
  const [ma, setMa] = useState(form.mode === 'add' ? goiYMa(ix, form.parent) : old?.skuCode || (old ? goiYMa(ix, ix.parentOf(old.code)) : ''));
  const [ghiChu, setGhiChu] = useState(old?.note ?? '');
  const tenDu = (p: string | null, t: string) => [p ? ix.byCode.get(p)?.fullName || ix.path(p).split(' / ').join(' ') : '', t.trim()].filter(Boolean).join(' ');
  // [2026-11-12 Nguyễn Văn Thủy] thêm mới: điền sẵn cả 3 ô (mã nhóm, mã ngắn, tên đầy đủ) — sửa lại cho đúng rồi Ghi (đóng góp)
  const goiYTen = form.mode === 'add' ? `${form.parent ? ix.byCode.get(form.parent)?.name ?? 'Nhóm' : 'Nhóm mới'} ${1000 + Math.floor(Math.random() * 9000)}` : '';
  const [ten, setTen] = useState(old?.name ?? goiYTen);
  const [full, setFull] = useState(old?.fullName || (old ? tenDu(ix.parentOf(old.code), old.name) : tenDu(form.mode === 'add' ? form.parent : null, goiYTen)));
  const [fullTay, setFullTay] = useState(Boolean(old)); // sửa tay rồi thì thôi tự điền
  const [dung, setDung] = useState(old?.isActive ?? true);
  const [moving, setMoving] = useState(false);
  const [err, setErr] = useState('');
  const lv = ix.level(parent) + 1;
  const len = MA_NGAN_DAI[lv];
  // Nhóm (hoặc nhóm con bên dưới) đã có mặt hàng: khoá mã ngắn và chuyển nhóm — mã hàng đã ghép theo.
  const soMH = old ? [...ix.subtree(old.code)].reduce((n, k) => n + (ix.byCode.get(k)?.products ?? 0), 0) : 0;
  const khoa = soMH > 0 && Boolean(old?.skuCode); // khoá mã ngắn: đã có mã và đã có mặt hàng
  const khoaChuyen = soMH > 0;

  const loiMa = (() => {
    if (!len || khoa) return '';
    if (!ma) return `Nhập mã ngắn cấp ${lv}: ${QUY_TAC[lv]}`;
    if (lv === 1 ? !/^[1-9][0-9]$/.test(ma) : !/^[A-Z0-9]+$/.test(ma) || ma.length !== len) return `Mã ngắn cấp ${lv} phải là ${QUY_TAC[lv]} (đang "${ma}")`;
    const sib = (parent ? ix.kids.get(parent) ?? [] : ix.roots).find((c) => c.code !== old?.code && c.skuCode === ma);
    return sib ? `Mã ${ma} đã dùng cho nhóm "${sib.name}" cùng cấp` : '';
  })();

  const save = useMutation({
    mutationFn: async () => {
      const nums = list.map((c) => Number(c.code)).filter((n) => Number.isInteger(n));
      const code = old ? old.code : String((nums.length ? Math.max(...nums) : 0) + 1);
      await api.put(`/api/v1/item-classes/group/${encodeURIComponent(code)}${old ? '' : '?new=1'}`, { name: ten.trim(), fullName: full.trim(), note: ghiChu, parentCode: parent || undefined, isActive: dung, skuCode: len ? ma : '' });
      return code;
    },
    onSuccess: (code) => { void qc.invalidateQueries({ queryKey: ['item-classes'] }); void qc.invalidateQueries({ queryKey: ['item-class-history'] }); onSaved(code, parent); },
    onError: (e) => setErr(errorText(e)),
  });
  const nn = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
  const trungTen = ten.trim() && (!old || nn(old.name) !== nn(ten)) ? list.find((x) => x.code !== old?.code && nn(x.name) === nn(ten)) : undefined;
  const loiTen = trungTen ? `Mã nhóm hàng đã dùng cho nhóm "${ix.path(trungTen.code)}" — đặt mã khác` : '';
  const ghi = () => { const e = !ten.trim() ? 'Nhập mã nhóm hàng' : loiTen || loiMa || (!full.trim() ? 'Nhập tên nhóm hàng' : ''); setErr(e); if (!e) save.mutate(); };

  return (
    <>
      <Modal title={old ? `Sửa nhóm "${old.name}"` : parent ? `Thêm nhóm con của "${ix.byCode.get(parent)?.name}"` : 'Thêm nhóm cấp 1'} helpKey="nhom-hang" onClose={onClose}
        footer={<>{err && <span className="neg" style={{ marginRight: 'auto', fontWeight: 600, fontSize: 13 }}>{err}</span>}<button className="btn btn-primary" disabled={save.isPending} onClick={ghi}>{save.isPending ? 'Đang ghi…' : 'Ghi'}</button><button className="btn" onClick={onClose}>Huỷ bỏ</button></>}>
        <Field label="Thuộc nhóm" full>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div className="nh-chi-xem" style={{ flex: 1 }} title="Không sửa ở đây">{parent ? ix.path(parent) : 'Nhóm hàng (gốc)'}</div>
            <span className="badge">Cấp {lv}</span>
            {old && !khoaChuyen && <button type="button" className="btn btn-sm" title="Chuyển sang nhóm khác" onClick={() => setMoving(true)}>Đổi…</button>}
          </div>
        </Field>
        <Field label="Mã nhóm hàng (*)" tip="Tên ngắn hiện trên cây, vd Bỉm/ Tã quần trẻ em">
          <input className="input" value={ten} autoFocus onFocus={(e) => e.target.select()} onChange={(e) => { setTen(e.target.value); setErr(''); if (!fullTay) setFull(tenDu(parent, e.target.value)); }} />
          {loiTen && <div className="neg" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>{loiTen}</div>}
        </Field>
        <Field label={len ? 'Mã ngắn (mã ghép) (*)' : 'Mã ngắn (mã ghép)'}>
          {(!len || khoa) ? <div className="nh-chi-xem mono">{ma || '—'}</div> : <input className="input mono" value={ma} maxLength={len || 1} placeholder={len ? QUY_TAC[lv] : ''}
            onChange={(e) => { setMa(e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase()); setErr(''); }} />}
          {khoa
            ? <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>🔒 Nhóm đã có {soMH} mặt hàng — không đổi mã ngắn, không chuyển nhóm (mã hàng đã ghép theo). Đổi tên thì được.</div>
            : loiMa
            ? <div className="neg" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>{loiMa}</div>
            : <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{len ? `Cấp ${lv}: ${QUY_TAC[lv]}` : 'Cấp 4 trở đi không ghép vào mã hàng'}</div>}
        </Field>
        <Field label="Tên nhóm hàng (*)" full tip="Tên đầy đủ — tự ghép theo nhóm cha, sửa được">
          <input className="input" value={full} onChange={(e) => { setFull(e.target.value); setFullTay(true); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') ghi(); }} />
        </Field>
        <Field label="Ghi chú" full><textarea className="input" rows={2} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} /></Field>
        <Field label=" "><label className="checkbox"><input type="checkbox" checked={dung} onChange={(e) => setDung(e.target.checked)} /> Đang dùng</label></Field>
      </Modal>
      {moving && old && (
        <ChuyenNhom list={list} self={old.code} current={parent} onClose={() => setMoving(false)}
          onPick={(p) => { if (ix.level(p) !== ix.level(parent)) setMa(goiYMa(ix, p)); setParent(p); if (!fullTay) setFull(tenDu(p, ten)); setMoving(false); }} />
      )}
    </>
  );
}

/** Lịch sử thêm / sửa một nhóm: ai, lúc nào, đổi gì. */
function LichSuNhom({ code }: { code: string }) {
  const h = useQuery({ queryKey: ['item-class-history', code], queryFn: () => api.get<{ at: string; by: string; action: string; changes: string }[]>(`/api/v1/item-classes/group/${encodeURIComponent(code)}/history`) });
  if (h.isLoading) return <Loading />;
  if (h.error) return <ErrorBox error={errorText(h.error)} />;
  if (!h.data?.length) return <div className="muted" style={{ padding: 8 }}>Chưa có thay đổi nào được ghi (lịch sử ghi từ 12/11/2026).</div>;
  return (
    <div className="ls-wrap">
      {h.data.map((e, i) => (
        <div key={i} className="ls-row">
          <div className="ls-meta"><span className="ls-time">{luc(e.at)}</span><span className="ls-by">{e.by}</span></div>
          <div className="ls-body"><div className="ls-head">{e.action === 'create' ? 'Thêm mới' : 'Sửa'}</div><ul>{e.changes.split('\n').map((x, j) => <li key={j}>{x}</li>)}</ul></div>
        </div>
      ))}
    </div>
  );
}

/** Chọn nhóm cha mới (không chọn được chính nó và nhánh con của nó). */
function ChuyenNhom({ list, self, current, onClose, onPick }: { list: NhomHang[]; self: string; current: string | null; onClose: () => void; onPick: (code: string | null) => void }) {
  const ix = useMemo(() => indexNhom(list), [list]);
  const banned = useMemo(() => ix.subtree(self), [ix, self]);
  const [pick, setPick] = useState<string | null>(current);
  return (
    <Modal title="Chuyển sang nhóm" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={pick !== null && banned.has(pick)} onClick={() => onPick(pick)}>Chọn</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full">
        <CayNhomHang list={list.filter((c) => !banned.has(c.code))} selected={pick} onSelect={setPick} height={420} />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Chọn "Nhóm hàng" (gốc) để thành nhóm cấp 1. Đổi cấp thì mã nhóm điền lại theo cấp mới; mã hàng đã có không đổi.</div>
      </div>
    </Modal>
  );
}
