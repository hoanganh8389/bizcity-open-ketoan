// [2026-11-20 Nguyễn Văn Thủy] Cơ cấu tổ chức (DM16) — Hộp thoại thêm / sửa đơn vị, phân kho, bộ phận và hộp xoá (xem ảnh hưởng trước). (đóng góp)
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Network, Plus, Trash2, Users, Warehouse as WarehouseIcon } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { Field, Hoi, Modal } from '@/components/ui';
import { ListPicker } from '@/components/pickers';
import { TaxCodeField } from '@/components/TaxCodeField';
import { LoaiKhoForm, useWarehouseTypes } from '../WarehouseTypesPage';
import { type BoPhan, type CC, MST_OK, OIc, duongCua, duongTen, homNay, iconDonVi, ngung, useLamMoi } from './du-lieu';

/* ------------------------------------------------------------------ hộp thoại đơn vị */

export const GOI_Y_CAP = ['Công ty', 'Miền', 'Chi nhánh', 'Tỉnh', 'Cửa hàng', 'Kho trung gian', 'Văn phòng'];

export function DonViModal({ cc, code, cha, onClose, onSaved }: { cc: CC; code: string | null; cha: string | null; onClose: () => void; onSaved: (code: string, text: string, tiep: boolean) => void }) {
  const lamMoi = useLamMoi();
  const u = code ? cc.byCode.get(code) ?? null : null;
  const moi = () => ({ code: '', name: '', parentCode: cha ?? '', levelLabel: '', taxCode: '', companyName: '', address: '', phone: '', note: '', isActive: true, departmentName: '', departmentCode: '', validFrom: homNay() });
  const [f, setF] = useState(() => (u ? { code: u.code, name: u.name, parentCode: u.parentCode ?? '', levelLabel: u.levelLabel, taxCode: u.taxCode, companyName: u.companyName, address: u.address, phone: u.phone, note: u.note, isActive: u.isActive, departmentName: '', departmentCode: u.departmentCode ?? '', validFrom: homNay() } : moi()));
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [daBam, setDaBam] = useState(false);
  const cam = useMemo(() => new Set(u ? [u.code, ...cc.under(u.code).map((x) => x.code)] : []), [cc, u]);
  const chaList = useMemo(() => cc.units.filter((x) => !cam.has(x.code) && !ngung(x)).map((x) => ({ code: x.code, name: duongTen(cc, x) })), [cc, cam]);
  const chaU = f.parentCode ? cc.byCode.get(f.parentCode) : null;
  const doiCha = !!u && (f.parentCode || null) !== (u.parentCode || null);
  const doiMst = !!u && f.taxCode.trim() !== u.taxCode.trim();
  const maMoi = f.code.trim();
  const trungMa = !!maMoi && (!u || maMoi.toLowerCase() !== u.code.toLowerCase()) && cc.ma.has(maMoi.toLowerCase());
  // MST cũ chưa chuẩn (dữ liệu cũ) không chặn khi không đổi.
  const mstSai = !!f.taxCode.trim() && !MST_OK.test(f.taxCode.trim()) && (!u || f.taxCode.trim() !== u.taxCode.trim());
  const loi: Record<string, string> = {};
  if (daBam) {
    if (!maMoi) loi.code = 'Nhập mã'; else if (trungMa) loi.code = `Mã đã dùng cho ${cc.ma.get(maMoi.toLowerCase())}`;
    if (!f.name.trim()) loi.name = 'Nhập tên';
  }
  const luu = useMutation({
    mutationFn: async () => {
      const body = { name: f.name.trim(), levelLabel: f.levelLabel.trim(), taxCode: f.taxCode.trim(), companyName: f.companyName, address: f.address, phone: f.phone, note: f.note };
      if (!u) { await api.post('/api/v1/co-cau/units', { ...body, code: maMoi, parentCode: f.parentCode || null, ...(f.departmentName.trim() ? { departmentName: f.departmentName.trim() } : {}) }); return maMoi; }
      await api.patch(`/api/v1/co-cau/units/${encodeURIComponent(u.code)}`, {
        ...body, isActive: f.isActive, departmentCode: f.departmentCode || null, ...(maMoi !== u.code ? { newCode: maMoi } : {}),
        ...(doiCha ? { parentCode: f.parentCode || null } : {}), ...(doiCha || doiMst ? { validFrom: f.validFrom || null } : {}),
      });
      return maMoi;
    },
  });
  const ghi = (tiep: boolean) => {
    setDaBam(true);
    if (!maMoi || !f.name.trim() || trungMa || mstSai) return;
    luu.mutate(undefined, {
      onSuccess: (ma) => {
        lamMoi();
        onSaved(ma, `Đã lưu đơn vị ${ma} · ${f.name.trim()}`, tiep);
        if (tiep) { setF({ ...moi(), parentCode: f.parentCode, levelLabel: f.levelLabel }); setDaBam(false); }
      },
    });
  };
  const bpList = u ? (cc.bpCua.get(u.code) ?? []).map((d) => ({ code: d.code, name: d.name })) : [];
  return (
    <Modal title={<span className="ccm-md-dau"><OIc>{u ? iconDonVi(u, !!cc.kids.get(u.code)?.length) : <Network />}</OIc><span><span className="ccm-md-ten">{u ? `Sửa đơn vị ${u.code}` : 'Thêm đơn vị'}</span><span className="ccm-md-mo">{chaU ? `Thuộc ${duongTen(cc, chaU)}` : 'Cấp cao nhất'}</span></span></span>}
      onClose={onClose} helpKey="so-do-to-chuc"
      footer={<>
        <button className="btn" onClick={onClose}>Huỷ</button>
        <button className="btn btn-primary" disabled={luu.isPending} onClick={() => ghi(false)}>Lưu</button>
        {!u && <button className="btn" disabled={luu.isPending} onClick={() => ghi(true)}><Plus size={14} /> Lưu và thêm tiếp</button>}
      </>}>
      <Field label="Mã (*)" error={loi.code} tip="Không trùng với mã đơn vị, phân kho, bộ phận khác"><input className="input mono" value={f.code} maxLength={32} autoFocus={!u} onChange={(e) => set({ code: e.target.value })} /></Field>
      <Field label="Tên (*)" error={loi.name}><input className="input" value={f.name} autoFocus={!!u} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Thuộc" full tip="Đơn vị cha. Trống = cấp cao nhất">
        <ListPicker items={chaList} value={f.parentCode} onChange={(c) => set({ parentCode: c })} placeholder="Tìm và chọn đơn vị cha (trống = cấp cao nhất)" />
      </Field>
      <Field label="Tên gọi cấp" tip="Chỉ là tên gọi để dễ nhìn: Công ty, Miền, Chi nhánh, Tỉnh, Cửa hàng… Trống = Cơ cấu cấp N">
        <input className="input" list="ccm-goi-y-cap" value={f.levelLabel} placeholder={`Cơ cấu cấp ${(chaU?.level ?? 0) + 1}`} onChange={(e) => set({ levelLabel: e.target.value })} />
        <datalist id="ccm-goi-y-cap">{GOI_Y_CAP.map((x) => <option key={x} value={x} />)}</datalist>
      </Field>
      {u ? <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Đang hoạt động</label></Field> : <div />}
      <TaxCodeField label="MST" full value={f.taxCode} showExisting={false} autoWhenEmpty={false}
        onChange={(v) => set({ taxCode: v.replace(/[^0-9-]/g, '') })}
        onFill={(t, overwrite) => setF((x) => ({ ...x, companyName: overwrite || !x.companyName.trim() ? t.name || x.companyName : x.companyName, address: overwrite || !x.address.trim() ? t.address || x.address : x.address }))} />
      <div className="ccm-goi full">{mstSai ? <span className="o-loi-chu">MST gồm 10 số hoặc 10 số-3 số</span> : f.taxCode.trim() ? 'Đơn vị dùng MST này; đơn vị con không tự khai sẽ lấy theo.' : chaU?.taxUsed ? <>Để trống: dùng MST <b className="mono">{chaU.taxUsed}</b> của {cc.byCode.get(chaU.taxFrom ?? chaU.code)?.name}.</> : 'Để trống: chưa có cấp trên nào khai MST.'}</div>
      <Field label="Tên in chứng từ" full tip="Tên đơn vị in trên hoá đơn, phiếu"><input className="input" value={f.companyName} onChange={(e) => set({ companyName: e.target.value })} /></Field>
      <Field label="Địa chỉ" full><input className="input" value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <Field label="Điện thoại"><input className="input" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
      {!u
        ? <Field label="Tên bộ phận mặc định" tip="Tạo đơn vị là tự có một bộ phận (vd Kế toán). Trống = theo tên đơn vị"><input className="input" value={f.departmentName} placeholder={f.name || 'Theo tên đơn vị'} onChange={(e) => set({ departmentName: e.target.value })} /></Field>
        : <Field label="Bộ phận mặc định" tip="Chứng từ của đơn vị chưa chọn bộ phận thì tính vào bộ phận này"><ListPicker items={bpList} value={f.departmentCode} onChange={(c) => set({ departmentCode: c })} /></Field>}
      {(doiCha || doiMst) && (
        <Field label="Áp dụng từ ngày" tip="Chứng từ từ ngày này theo nơi thuộc / MST mới; trước đó giữ như cũ"><input className="input" type="date" value={f.validFrom} onChange={(e) => set({ validFrom: e.target.value })} /></Field>
      )}
      <Field label="Ghi chú" full><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      {luu.error && <div className="alert alert-bad full">{errorText(luu.error)}</div>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ hộp thoại phân kho / bộ phận */

export function chonDonVi(cc: CC) { return cc.units.filter((x) => !ngung(x)).map((x) => ({ code: x.code, name: duongTen(cc, x) })); }

export function PhanKhoModal({ cc, code, donVi, onClose, onSaved }: { cc: CC; code: string | null; donVi: string | null; onClose: () => void; onSaved: (text: string) => void }) {
  const lamMoi = useLamMoi();
  const w = code ? cc.warehouses.find((x) => x.code === code) ?? null : null;
  const [f, setF] = useState({ code: w?.code ?? '', name: w?.name ?? '', branchCode: w?.branchCode ?? donVi ?? '', typeCode: w?.typeCode || 'KHH', isDefault: w?.isDefault ?? false, address: w?.address ?? '', note: w?.note ?? '', isActive: w?.isActive ?? true });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const types = (useWarehouseTypes().data?.types ?? []).filter((t) => t.isActive || t.code === f.typeCode);
  const [themLoai, setThemLoai] = useState<string | null>(null);
  const [daBam, setDaBam] = useState(false);
  const items = useMemo(() => chonDonVi(cc), [cc]);
  const trung = !w && !!f.code.trim() && cc.ma.has(f.code.trim().toLowerCase());
  const loi: Record<string, string> = {};
  if (daBam) {
    if (!f.code.trim()) loi.code = 'Nhập mã'; else if (trung) loi.code = `Mã đã dùng cho ${cc.ma.get(f.code.trim().toLowerCase())}`;
    if (!f.name.trim()) loi.name = 'Nhập tên';
    if (!f.branchCode) loi.branchCode = 'Chọn đơn vị';
  }
  const luu = useMutation({
    mutationFn: () => {
      const body = { branchCode: f.branchCode, name: f.name.trim(), typeCode: f.typeCode || 'KHH', isDefault: f.isDefault, address: f.address, note: f.note, isActive: f.isActive };
      return w ? api.patch(`/api/v1/warehouses/${encodeURIComponent(w.code)}`, body) : api.post('/api/v1/warehouses', { ...body, code: f.code.trim() });
    },
    onSuccess: () => { lamMoi(); onSaved(`Đã lưu phân kho ${f.code.trim()} · ${f.name.trim()}`); },
  });
  const ok = () => { setDaBam(true); if (f.code.trim() && f.name.trim() && f.branchCode && !trung) luu.mutate(); };
  return (
    <Modal title={<span className="ccm-md-dau"><OIc><WarehouseIcon /></OIc><span><span className="ccm-md-ten">{w ? `Sửa phân kho ${w.code}` : 'Thêm phân kho'}</span><span className="ccm-md-mo">{f.branchCode ? `Thuộc ${duongCua(cc, f.branchCode) || f.branchCode}` : 'Chọn đơn vị sở hữu'}</span></span></span>}
      onClose={onClose} helpKey="so-do-to-chuc" footer={<><button className="btn" onClick={onClose}>Huỷ</button><button className="btn btn-primary" disabled={luu.isPending} onClick={ok}>Lưu</button></>}>
      <Field label="Mã phân kho (*)" error={loi.code} tip="Tối đa 12 ký tự, không trùng mã khác"><input className="input mono" value={f.code} maxLength={12} disabled={!!w} autoFocus={!w} onChange={(e) => set({ code: e.target.value })} /></Field>
      <Field label="Tên phân kho (*)" error={loi.name}><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Thuộc đơn vị (*)" full error={loi.branchCode}><ListPicker items={items} value={f.branchCode} onChange={(c) => set({ branchCode: c })} placeholder="Tìm và chọn đơn vị" /></Field>
      <Field label="Loại kho (*)" tip="Loại quyết định phân kho dùng cho nghiệp vụ nào (nhập mua, bán, trả lại…)">
        <ListPicker items={types.map((t) => ({ code: t.code, name: t.name, hint: t.purpose }))} value={f.typeCode} onChange={(c) => set({ typeCode: c || 'KHH' })} onAdd={(t) => setThemLoai(t)} addLabel="Thêm loại kho" />
        {themLoai !== null && <LoaiKhoForm value={{ isNew: true, name: themLoai }} onClose={() => setThemLoai(null)} onSaved={(c) => set({ typeCode: c })} />}
      </Field>
      <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} /> Phân kho mặc định<Hoi text="Nhận các dòng nhập xuất không ghi mã kho của đơn vị" /></label></Field>
      <Field label="Địa chỉ" full><input className="input" value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <Field label="Ghi chú" full><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      {w && <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Đang hoạt động</label></Field>}
      {luu.error && <div className="alert alert-bad full">{errorText(luu.error)}</div>}
    </Modal>
  );
}

export function BoPhanModal({ cc, code, donVi, cha, onClose, onSaved }: { cc: CC; code: string | null; donVi: string | null; cha: string | null; onClose: () => void; onSaved: (text: string) => void }) {
  const lamMoi = useLamMoi();
  const d = code ? cc.departments.find((x) => x.code === code) ?? null : null;
  const [f, setF] = useState({ code: d?.code ?? '', name: d?.name ?? '', branchCode: d?.branchCode ?? donVi ?? '', parentCode: (d ? cc.chaBp(d)?.code : cha) ?? '', note: d?.note ?? '', isActive: d?.isActive ?? true });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [daBam, setDaBam] = useState(false);
  const items = useMemo(() => chonDonVi(cc), [cc]);
  // Bộ phận cha: bộ phận cùng đơn vị, trừ chính nó và các bộ phận con cháu của nó.
  const chaList = useMemo(() => {
    const cam = new Set<string>(); if (d) { const st = [d.code]; while (st.length) { const c = st.pop()!; cam.add(c); for (const x of cc.bpCon.get(c) ?? []) st.push(x.code); } }
    return cc.xepCay((cc.bpCua.get(f.branchCode) ?? []).filter((x) => !cam.has(x.code) && !ngung(x))).map((x) => { const t: string[] = []; for (let y: BoPhan | undefined = x, n = 0; y && n < 30; y = cc.chaBp(y), n++) t.unshift(y.name); return { code: x.code, name: t.join(' / ') }; });
  }, [cc, d, f.branchCode]);
  const trung = !d && !!f.code.trim() && cc.ma.has(f.code.trim().toLowerCase());
  const loi: Record<string, string> = {};
  if (daBam) {
    if (!f.code.trim()) loi.code = 'Nhập mã'; else if (trung) loi.code = `Mã đã dùng cho ${cc.ma.get(f.code.trim().toLowerCase())}`;
    if (!f.name.trim()) loi.name = 'Nhập tên';
    if (!f.branchCode) loi.branchCode = 'Chọn đơn vị';
  }
  const luu = useMutation({
    mutationFn: () => api.put(`/api/v1/co-cau/departments/${encodeURIComponent(f.code.trim())}`, { name: f.name.trim(), branchCode: f.branchCode, parentCode: f.parentCode, note: f.note, isActive: f.isActive }),
    onSuccess: () => { lamMoi(); onSaved(`Đã lưu bộ phận ${f.code.trim()} · ${f.name.trim()}`); },
  });
  const ok = () => { setDaBam(true); if (f.code.trim() && f.name.trim() && f.branchCode && !trung) luu.mutate(); };
  return (
    <Modal title={<span className="ccm-md-dau"><OIc><Users /></OIc><span><span className="ccm-md-ten">{d ? `Sửa bộ phận ${d.code}` : 'Thêm bộ phận'}</span><span className="ccm-md-mo">{f.branchCode ? `Thuộc ${duongCua(cc, f.branchCode) || f.branchCode}` : 'Chọn đơn vị'}</span></span></span>}
      onClose={onClose} helpKey="so-do-to-chuc" footer={<><button className="btn" onClick={onClose}>Huỷ</button><button className="btn btn-primary" disabled={luu.isPending} onClick={ok}>Lưu</button></>}>
      <Field label="Mã bộ phận (*)" error={loi.code}><input className="input mono" value={f.code} maxLength={64} disabled={!!d} autoFocus={!d} onChange={(e) => set({ code: e.target.value })} /></Field>
      <Field label="Tên bộ phận (*)" error={loi.name}><input className="input" value={f.name} placeholder="vd Kế toán, Kinh doanh…" onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Thuộc đơn vị (*)" full error={loi.branchCode}><ListPicker items={items} value={f.branchCode} onChange={(c) => set({ branchCode: c, parentCode: c === f.branchCode ? f.parentCode : '' })} placeholder="Tìm và chọn đơn vị" /></Field>
      <Field label="Thuộc bộ phận" full tip="Không bắt buộc. Chỉ chọn được bộ phận trong cùng đơn vị, ví dụ Kế toán thuế thuộc Kế toán.">
        <ListPicker items={chaList} value={f.parentCode} onChange={(c) => set({ parentCode: c })} placeholder={f.branchCode ? 'Trống = bộ phận cấp cao nhất của đơn vị' : 'Chọn đơn vị trước'} disabled={!f.branchCode} />
      </Field>
      <Field label="Ghi chú" full><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      {d && <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Đang hoạt động</label></Field>}
      {luu.error && <div className="alert alert-bad full">{errorText(luu.error)}</div>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ xoá */

export interface XoaKQ { ten: string; dem: { donVi: number; kho: number; boPhan: number }; donVi: string[]; kho: string[]; boPhan: string[]; chan: string[]; daXoa: boolean }
export function XoaModal({ cc, hop, onClose, onDone }: { cc: CC; hop: { key: string; ten: string; ma: string }; onClose: () => void; onDone: (text: string, cha: string | null) => void }) {
  const lamMoi = useLamMoi();
  const [go, setGo] = useState('');
  const xem = useQuery({ queryKey: ['co-cau-xoa', hop.key], queryFn: () => api.post<XoaKQ>('/api/v1/co-cau/delete', { key: hop.key, dryRun: true }), gcTime: 0 });
  const cha = hop.key.startsWith('u:') ? cc.byCode.get(hop.ma)?.parentCode ?? null : null;
  const xoa = useMutation({
    mutationFn: () => api.post<XoaKQ>('/api/v1/co-cau/delete', { key: hop.key, dryRun: false }),
    onSuccess: (r) => { lamMoi(); onDone(`Đã xoá vĩnh viễn ${r.ten}: ${r.dem.donVi} đơn vị, ${r.dem.kho} phân kho, ${r.dem.boPhan} bộ phận`, cha); },
  });
  const r = xem.data;
  const dong = (ic: ReactNode, ten: string, list: string[]) => (list.length ? (
    <details className="ccx-dong"><summary><OIc>{ic}</OIc> <b>{list.length}</b> {ten}</summary><div className="ccx-ds">{list.slice(0, 300).map((x) => <div key={x}>{x}</div>)}{list.length > 300 && <div className="muted">… và {list.length - 300} mục nữa</div>}</div></details>
  ) : null);
  return (
    <Modal title={<span className="ccm-md-dau"><span className="ccm-o-ic ccx-ic"><Trash2 /></span><span><span className="ccm-md-ten">Xoá vĩnh viễn {hop.ma}</span><span className="ccm-md-mo">{hop.ten}</span></span></span>}
      onClose={onClose} helpKey="so-do-to-chuc"
      footer={<><button className="btn" onClick={onClose}>Huỷ</button><button className="btn btn-danger" disabled={!r || r.chan.length > 0 || xoa.isPending || go.trim() !== hop.ma} onClick={() => xoa.mutate()}><Trash2 size={14} /> Xoá vĩnh viễn</button></>}>
      <div className="full">
        {xem.isLoading ? <div className="muted">Đang kiểm tra ảnh hưởng…</div> : xem.error ? <div className="alert alert-bad">{errorText(xem.error)}</div> : r && (
          <>
            <div className="ccx-canh">Xoá <b>{r.ten}</b> sẽ xoá luôn mọi thứ dưới đây, <b>không khôi phục được</b>:</div>
            {dong(<Network />, 'đơn vị (gồm chính nó và mọi đơn vị con)', r.donVi)}
            {dong(<WarehouseIcon />, 'phân kho', r.kho)}
            {dong(<Users />, 'bộ phận', r.boPhan)}
            {r.chan.length > 0 ? (
              <div className="alert alert-bad" style={{ marginTop: 10 }}>
                <b>Không xoá được</b> vì đã có dữ liệu phát sinh:
                <ul style={{ margin: '4px 0 0 18px' }}>{r.chan.map((x) => <li key={x}>{x}</li>)}</ul>
                Hãy bỏ tích <b>Đang hoạt động</b> để ngừng dùng thay vì xoá.
              </div>
            ) : (
              <Field label={`Gõ mã ${hop.ma} để xác nhận`} full><input className="input mono" value={go} onChange={(e) => setGo(e.target.value)} placeholder={hop.ma} autoFocus /></Field>
            )}
          </>
        )}
        {xoa.error && <div className="alert alert-bad" style={{ marginTop: 8 }}>{errorText(xoa.error)}</div>}
      </div>
    </Modal>
  );
}
