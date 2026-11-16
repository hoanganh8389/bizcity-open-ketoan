// [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — màn Nhóm hàng (DM11) làm lại gọn: cây trái, form trên, lưới nhóm con dưới; bỏ các thẻ ngành / nhãn / loại (đóng góp)
// [2026-11-12 Nguyễn Văn Thủy] DM11 thiết kế lại cho dễ hiểu: bên phải là thẻ của nhóm đang chọn (đường dẫn, mã, tên, ai tạo / sửa)
//   với nút ngay tại chỗ (Sửa, + Thêm nhóm con); thêm / sửa mở hộp thoại, mã điền sẵn gợi ý; lưới có lọc theo cấp; không xoá (0116) (đóng góp)
/**
 * NHÓM HÀNG (DM11) — một cây: cấp 1 → cấp 2 → cấp 3 (→ cấp 4, 5 chia nhỏ, không ghép mã hàng).
 *   Trái: cây (tìm, mở / thu). Phải: nhóm đang chọn — đường dẫn, số liệu, cấu trúc mã hàng, bảng nhóm con (bấm để đi xuống).
 *   Mã nhóm hàng ghép vào mã hàng: cấp 1 = 2 chữ số (không bắt đầu bằng 0), cấp 2 = 3 ký tự, cấp 3 = 1 ký tự.
 *   Không có xoá: bỏ tích Đang dùng để ngừng. Mã nội bộ của nhóm tự cấp, không hiện.
 */
import { useMemo, useState } from 'react';
import { luuExcel } from '@/lib/excelChuan';
import { ProductEditor } from './ProductsPage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileDown, History, Pencil, Plus, Printer, RefreshCw } from 'lucide-react';
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

// [2026-11-16 kiennt] DM11 thiết kế lại kiểu cây – chi tiết (như MISA / Odoo): trái là cây nhóm, phải là nhóm đang chọn —
//   đường dẫn bấm được, thẻ số liệu, cấu trúc mã hàng (đoạn nào do cấp nào quyết), bảng nhóm con bấm để đi xuống (đóng góp)
export function NhomHangPage() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const q = useNhomHang();
  const ix = useMemo(() => indexNhom(q.data), [q.data]);
  const [sel, setSel] = useState<string | null>(null); // null = gốc (mọi ngành hàng)
  const [form, setForm] = useState<null | { mode: 'add'; parent: string | null } | { mode: 'edit'; code: string }>(null);
  const [lichSu, setLichSu] = useState<NhomHang | null>(null);
  const [themMH, setThemMH] = useState<string | null>(null); // nhóm cấp 3 đang thêm mặt hàng

  const thieuMa = (c: NhomHang) => Boolean(MA_NGAN_DAI[ix.level(c.code)]) && !c.skuCode;
  // Số mặt hàng cộng dồn cả nhánh con.
  const tongMH = useMemo(() => {
    const m = new Map<string, number>();
    const of = (code: string): number => { if (m.has(code)) return m.get(code)!; m.set(code, 0); const n = (ix.byCode.get(code)?.products ?? 0) + (ix.kids.get(code) ?? []).reduce((t, k) => t + of(k.code), 0); m.set(code, n); return n; };
    for (const c of q.data ?? []) of(c.code);
    return m;
  }, [q.data, ix]);

  const xuat = () => void luuExcel('nhom-hang.xlsx', [{ name: 'Nhóm hàng', plainBody: true, rows: [
    ['Nhóm cha', 'Mã nhóm hàng', 'Mã ngắn', 'Tên nhóm hàng', 'Cấp', 'Số mặt hàng', 'Đang dùng', 'Ghi chú', 'Người tạo', 'Lúc tạo', 'Người sửa', 'Lúc sửa'],
    ...(q.data ?? []).map((c) => [ix.path(ix.parentOf(c.code)), c.name, c.skuCode ?? '', c.fullName ?? '', ix.level(c.code), tongMH.get(c.code) ?? 0, c.isActive ? 'Có' : 'Không', c.note ?? '', c.createdBy ?? '', luc(c.createdAt), c.updatedBy ?? '', c.updatedBy ? luc(c.updatedAt) : '']),
  ] }]);

  const g = sel ? ix.byCode.get(sel) ?? null : null;
  const lv = g ? ix.level(g.code) : 0;
  const con = g ? ix.kids.get(g.code) ?? [] : ix.roots;
  const chain: NhomHang[] = [];
  for (let c = sel; c; c = ix.parentOf(c)) { const n = ix.byCode.get(c); if (n) chain.unshift(n); }
  // Nút thêm theo cấp: gốc → ngành hàng (cấp 1); cấp 1, 2 → nhóm con; cấp 3 → mặt hàng (mã tự sinh theo nhóm).
  const themCon = !canWrite ? null
    : lv === 3 ? { label: 'Thêm mặt hàng', title: `Thêm mặt hàng vào nhóm "${g!.name}" — mã tự sinh theo nhóm`, run: () => setThemMH(g!.code) }
    : lv < 3 ? { label: lv === 0 ? 'Thêm ngành hàng' : 'Thêm nhóm con', title: lv === 0 ? 'Thêm nhóm cấp 1 (ngành hàng mới)' : `Thêm nhóm cấp ${lv + 1} dưới "${g!.name}"`, run: () => setForm({ mode: 'add', parent: sel }) }
    : null;
  // Cấu trúc mã hàng: ngành (cấp 1) · nhãn (cấp 2) · nhóm (cấp 3) · số thứ tự.
  const doan = [1, 2, 3].map((l) => ({ l, ten: ['Ngành', 'Nhãn', 'Nhóm'][l - 1]!, ma: chain[l - 1]?.skuCode || '', dai: MA_NGAN_DAI[l]! }));

  return (
    <>
      <PageHeader title="Danh mục nhóm hàng" code="DM11" helpKey="nhom-hang" subtitle="Cây nhóm hàng — mã hàng ghép từ mã nhóm cấp 1, 2, 3" />
      <div className="nh2">
        <div className="card nh2-tree">
          {q.isLoading ? <Loading /> : <CayNhomHang list={q.data} selected={sel} onSelect={setSel} height="calc(100vh - 250px)" openLevel={1} />}
        </div>
        <div className="card nh2-main">
          <div className="catalog-toolbar canh-phai">
            <nav className="nh2-crumb" aria-label="Đường dẫn nhóm">
              <button type="button" className={!sel ? 'on' : ''} onClick={() => setSel(null)}>Nhóm hàng</button>
              {chain.map((c) => <span key={c.code}><ChevronRight size={13} /><button type="button" className={c.code === sel ? 'on' : ''} onClick={() => setSel(c.code)}>{c.name}</button></span>)}
            </nav>
            <span className="spacer" />
            {themCon && <button className="btn btn-sm btn-primary" title={themCon.title} onClick={themCon.run}><Plus size={14} /> {themCon.label}</button>}
            <button className="btn btn-sm" onClick={() => void q.refetch()}><RefreshCw size={14} /> Nạp</button>
            <button className="btn btn-sm" onClick={xuat}><FileDown size={14} /> Xuất</button>
            <button className="btn btn-sm" onClick={() => window.print()} title="In màn hình đang xem"><Printer size={14} /> In</button>
            {canWrite && <NutNhapExcel loai={nhapLoai('nhom-hang')!} />}
          </div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : (
            <div className="nh2-body">
              <div className="nh2-head">
                {g ? <i className={`nh-cap c${Math.min(lv, 4)}`}>Cấp {lv}</i> : <i className="nh-cap c0">Gốc</i>}
                <h2>{g ? g.name : 'Tất cả ngành hàng'}</h2>
                {g && !g.isActive && <span className="badge badge-gray">Ngừng dùng</span>}
                <span className="spacer" />
                {g && canWrite && <button className="btn btn-sm" onClick={() => setForm({ mode: 'edit', code: g.code })}><Pencil size={13} /> Sửa</button>}
                {g && <button className="btn btn-sm btn-ghost" onClick={() => setLichSu(g)}><History size={13} /> Lịch sử</button>}
              </div>
              {g?.fullName && g.fullName !== g.name && <div className="nh2-sub">Tên đầy đủ: {g.fullName}</div>}

              <div className="nh2-stats">
                {g && <div><small>Mã ngắn</small><b className="mono">{thieuMa(g) ? <span className="neg">chưa có</span> : g.skuCode || '—'}</b></div>}
                <div><small>{g ? 'Nhóm con' : 'Ngành hàng'}</small><b>{con.length}</b></div>
                <div><small>Mặt hàng{g && con.length ? ' (cả nhánh)' : ''}</small><b>{(g ? tongMH.get(g.code) ?? 0 : (q.data ?? []).reduce((t, c) => t + (c.products ?? 0), 0)).toLocaleString('vi-VN')}</b></div>
                {g && <div><small>Sửa lần cuối</small><b className="nh2-ai">{g.updatedBy || g.createdBy || '—'}<span>{luc(g.updatedBy ? g.updatedAt : g.createdAt)}</span></b></div>}
              </div>

              <div className="nh2-ma" title="Mã hàng = mã ngắn cấp 1 + cấp 2 + cấp 3 + số thứ tự (cấp 4, 5 chỉ chia nhỏ, không ghép vào mã)">
                <small>Mã hàng trong nhóm này</small>
                <div className="nh2-seg">
                  {doan.map((d) => (
                    <span key={d.l} className={`${d.l === lv ? 'on' : ''} ${d.l > lv ? 'trong' : ''}`}>
                      <b className="mono">{d.l <= lv ? d.ma || '?'.repeat(d.dai) : '·'.repeat(d.dai)}</b><small>{d.ten} · cấp {d.l}</small>
                    </span>
                  ))}
                  <span className="trong"><b className="mono">###</b><small>Số thứ tự</small></span>
                </div>
                {lv >= 4 && <small className="muted">Cấp {lv} chỉ chia nhỏ để xem, lọc — không ghép vào mã hàng.</small>}
              </div>

              <div className="nh2-sec">
                <b>{g ? `Nhóm con (${con.length})` : `Ngành hàng (${con.length})`}</b>
                <span className="muted">Bấm một dòng để mở nhóm đó</span>
              </div>
              {con.length ? (
                <table className="grid nh2-con">
                  <thead><tr><th style={{ width: 90 }}>Mã ngắn</th><th>Tên nhóm</th><th style={{ width: 90 }} className="num">Nhóm con</th><th style={{ width: 100 }} className="num">Mặt hàng</th><th style={{ width: 110 }}>Trạng thái</th></tr></thead>
                  <tbody>{con.map((c) => (
                    <tr key={c.code} className={c.isActive ? '' : 'muted'} onClick={() => setSel(c.code)} title={`Mở nhóm ${c.name}`}>
                      <td className="mono">{thieuMa(c) ? <span className="neg">chưa có</span> : c.skuCode}</td>
                      <td><i className={`nh-cap c${Math.min(ix.level(c.code), 4)}`}>{ix.level(c.code)}</i> {c.name}</td>
                      <td className="num">{(ix.kids.get(c.code) ?? []).length || ''}</td>
                      <td className="num">{(tongMH.get(c.code) ?? 0).toLocaleString('vi-VN')}</td>
                      <td>{c.isActive ? <span className="badge badge-ok">Đang dùng</span> : <span className="badge badge-gray">Ngừng</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : (
                <div className="nh2-empty">
                  {lv === 3 ? 'Nhóm cấp 3 là nhóm cuối ghép mã hàng — thêm mặt hàng vào nhóm này.' : g ? 'Nhóm chưa có nhóm con.' : 'Chưa có nhóm hàng.'}
                  {themCon && <button className="btn btn-sm" onClick={themCon.run}><Plus size={13} /> {themCon.label}</button>}
                </div>
              )}
              {g?.note && <div className="nh2-note"><small>Ghi chú</small>{g.note}</div>}
            </div>
          )}
        </div>
      </div>
      {form && <NhomForm ix={ix} list={q.data ?? []} form={form} onClose={() => setForm(null)} onSaved={(code) => { setForm(null); setSel(code); }} />}
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
  const goiYTen = form.mode === 'add' ? `Nhóm mới ${1000 + Math.floor(Math.random() * 9000)}` : '';
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
            ? <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>🔒 Đã có {soMH} mặt hàng — giữ nguyên mã ngắn</div>
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
