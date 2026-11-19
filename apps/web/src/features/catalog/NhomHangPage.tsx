// [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — màn Nhóm hàng (DM11) làm lại gọn: cây trái, form trên, lưới nhóm con dưới; bỏ các thẻ ngành / nhãn / loại (đóng góp)
// [2026-11-12 Nguyễn Văn Thủy] DM11 thiết kế lại cho dễ hiểu: bên phải là thẻ của nhóm đang chọn (đường dẫn, mã, tên, ai tạo / sửa)
//   với nút ngay tại chỗ (Sửa, + Thêm nhóm con); thêm / sửa mở hộp thoại, mã điền sẵn gợi ý; lưới có lọc theo cấp; không xoá (0116) (đóng góp)
/**
 * NHÓM HÀNG (DM11) — ba cột Ngành (cấp 1) → Nhãn (cấp 2) → Nhóm (cấp 3) (cấp 4, 5 chia nhỏ, không ghép mã hàng) + bảng mặt hàng của nhánh đang chọn.
 *   Mỗi cột: mã ngắn (chưa mã / trùng mã), tên, số mặt hàng cả nhánh; bấm để đi xuống, bấm đúp để sửa. API mặt hàng: GET /api/v1/products?group=.
 *   Mã nhóm hàng ghép vào mã hàng: cấp 1 = 2 chữ số (không bắt đầu bằng 0), cấp 2 = 3 ký tự, cấp 3 = 1 ký tự.
 *   Không có xoá: bỏ tích Đang dùng để ngừng. Mã nội bộ của nhóm tự cấp, không hiện.
 */
import { useMemo, useState } from 'react';
import { luuExcel } from '@/lib/excelChuan';
import { ProductEditor } from './ProductsPage';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, FileDown, History, Pencil, Plus, Search } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { ThungRacDanhMuc } from '@/components/ThungRacDanhMuc';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, Pager } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { plain } from '@/components/pickers';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { CayNhomHang, indexNhom, MA_NGAN_DAI, useNhomHang, type NhomHang, type NhomIndex } from '@/components/CayNhomHang';
import './lich-su.css';
import './nhom-hang.css';

// [2026-11-12 Nguyễn Văn Thủy] ba ô như danh mục cũ: Mã nhóm hàng (tên ngắn trên cây), Mã ngắn (ghép mã hàng), Tên nhóm hàng (đầy đủ) (đóng góp)
const QUY_TAC: Record<number, string> = { 1: '2 chữ số, không bắt đầu bằng 0', 2: '3 ký tự (chữ hoặc số)', 3: '1 ký tự (chữ hoặc số)' };
/** Một trang bảng mặt hàng (nhánh lớn chia trang). */
const TRANG_MH = 500;
interface MatHang { sku: string; name: string; unit: string; groupCode: string | null; isActive: boolean; isDraft?: boolean }
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
  const [form, setForm] = useState<null | { mode: 'add'; parent: string | null; copy?: string } | { mode: 'edit'; code: string }>(null);
  const [lichSu, setLichSu] = useState<NhomHang | null>(null);
  const [themMH, setThemMH] = useState<{ group: string | null } | null>(null); // đang thêm mặt hàng vào nhánh này

  const thieuMa = (c: NhomHang) => Boolean(MA_NGAN_DAI[ix.level(c.code)]) && !c.skuCode;
  // Số mặt hàng cộng dồn cả nhánh con.
  const tongMH = useMemo(() => {
    const m = new Map<string, number>();
    const of = (code: string): number => { if (m.has(code)) return m.get(code)!; m.set(code, 0); const n = (ix.byCode.get(code)?.products ?? 0) + (ix.kids.get(code) ?? []).reduce((t, k) => t + of(k.code), 0); m.set(code, n); return n; };
    for (const c of q.data ?? []) of(c.code);
    return m;
  }, [q.data, ix]);

  const xuat = () => void luuExcel('nhom-hang.xlsx', [{ name: 'Nhóm hàng', plainBody: true, rows: [
    // [2026-11-18 05:10 PM kiennt] NT-DM-010 — đổi tên ô: Tên ngành (name), Mã hoá (skuCode), Mô tả (fullName, không bắt buộc, không tự ghép) (đóng góp)
    ['Nhóm cha', 'Tên ngành', 'Mã hoá', 'Mô tả', 'Cấp', 'Số mặt hàng', 'Đang dùng', 'Ghi chú', 'Người tạo', 'Lúc tạo', 'Người sửa', 'Lúc sửa'],
    ...(q.data ?? []).map((c) => [ix.path(ix.parentOf(c.code)), c.name, c.skuCode ?? '', c.fullName ?? '', ix.level(c.code), tongMH.get(c.code) ?? 0, c.isActive ? 'Có' : 'Không', c.note ?? '', c.createdBy ?? '', luc(c.createdAt), c.updatedBy ?? '', c.updatedBy ? luc(c.updatedAt) : '']),
  ] }]);

  // [2026-11-17 04:26 PM kiennt] DM11 thiết kế lại theo bản vẽ "Danh mục mặt hàng (Ngành → Nhãn → Nhóm)": ba cột chọn nối tiếp (mã ngắn, cảnh báo
  //   chưa mã / trùng mã, số mặt hàng cả nhánh), ô tìm chung, bảng mặt hàng của nhánh đang chọn lọc theo trạng thái (đóng góp)
  const chain: NhomHang[] = [];
  for (let c = sel; c; c = ix.parentOf(c)) { const n = ix.byCode.get(c); if (n) chain.unshift(n); }
  const [tim, setTim] = useState('');
  const t = plain(tim.trim());
  // Đang tìm: giữ nhóm khớp (tên / mã ngắn) và mọi nhóm cha của nó.
  const khop = useMemo(() => {
    if (!t) return null;
    const keep = new Set<string>();
    for (const c of q.data ?? []) if (plain(c.name).includes(t) || (c.skuCode && plain(c.skuCode).includes(t))) for (let x: string | null = c.code; x; x = ix.parentOf(x)) keep.add(x);
    return keep;
  }, [t, q.data, ix]);
  const trungMa = (c: NhomHang) => Boolean(c.skuCode) && ((ix.parentOf(c.code) ? ix.kids.get(ix.parentOf(c.code)!) : ix.roots) ?? []).some((x) => x.code !== c.code && x.skuCode === c.skuCode);
  const cot = [
    { lv: 1, ten: 'Ngành hàng', list: ix.roots, chon: chain[0]?.code ?? null, cha: null as string | null, them: 'Thêm ngành hàng', trong: 'Chưa có ngành hàng.' },
    { lv: 2, ten: 'Nhãn hàng', list: chain[0] ? ix.kids.get(chain[0].code) ?? [] : [], chon: chain[1]?.code ?? null, cha: chain[0]?.code ?? null, them: 'Tạo nhãn mới trong ngành này', trong: chain[0] ? 'Ngành chưa có nhãn.' : 'Chọn một ngành hàng.' },
    { lv: 3, ten: 'Nhóm hàng', list: chain[1] ? ix.kids.get(chain[1].code) ?? [] : [], chon: chain[2]?.code ?? null, cha: chain[1]?.code ?? null, them: 'Tạo nhóm mới trong nhãn này', trong: chain[1] ? 'Nhãn chưa có nhóm.' : 'Chọn một nhãn hàng.' },
  ];

  // Mặt hàng của nhánh đang chọn (API lấy cả nhóm con).
  const [trangThai, setTrangThai] = useState<'all' | 'active' | 'inactive' | 'draft'>('all');
  const [trang, setTrang] = useState(1);
  const params = { page: trang, pageSize: TRANG_MH, group: sel ?? undefined, status: trangThai };
  const mh = useQuery({ queryKey: ['products', params], queryFn: () => api.getPage<MatHang[]>('/api/v1/products', params), placeholderData: keepPreviousData });
  const tongDong = Number(mh.data?.meta?.total ?? 0);
  const [moMH, setMoMH] = useState<string | null>(null);
  const cotMH: Column<MatHang>[] = [
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 130 },
    { key: 'name', header: 'Tên hàng', width: 340 },
    { key: 'group', header: 'Nhóm', width: 240, value: (p) => (p.groupCode ? ix.byCode.get(p.groupCode)?.name ?? p.groupCode : '') },
    { key: 'unit', header: 'ĐVT', width: 80 },
    { key: 'status', header: 'Trạng thái', width: 110, value: (p) => (p.isDraft ? 'Nháp' : p.isActive ? 'Đang dùng' : 'Ngừng dùng'),
      render: (p) => (p.isDraft ? <span className="badge badge-warn">Nháp</span> : p.isActive ? <span className="badge badge-ok">Đang dùng</span> : <span className="badge badge-gray">Ngừng dùng</span>) },
  ];
  const chonNhom = (code: string | null) => { setSel(code); setTrang(1); };

  return (
    <>
      <PageHeader title="Danh mục nhóm hàng" code="DM11" helpKey="nhom-hang" subtitle="Ngành → Nhãn → Nhóm — mã hàng ghép từ mã ngắn ba cấp" />
      <div className="card nh3">
        {/* [2026-11-18 01:40 PM kiennt] NT-DM-006 — nút chức năng bên trái, tiêu đề khung sang phải; nút Nhân bản nhóm đang chọn (đóng góp) */}
        <div className="catalog-toolbar canh-phai">
          {canWrite && <button className="btn btn-sm" disabled={!chain.length} title={chain.length ? `Nhân bản nhóm "${chain[chain.length - 1]!.name}": thêm nhóm mới cùng cấp, chép tên, ghi chú (mã ngắn gợi ý mới)` : 'Chọn một nhóm để nhân bản'} onClick={() => { const c = chain[chain.length - 1]; if (c) setForm({ mode: 'add', parent: ix.parentOf(c.code), copy: c.code }); }}><Copy size={14} /> Nhân bản</button>}
          {canWrite && <NutNhapExcel loai={nhapLoai('nhom-hang')!} />}
          <button className="btn btn-sm" onClick={xuat}><FileDown size={14} /> Xuất</button>
          {/* [2026-11-17 Nguyễn Văn Thủy] Thùng rác chung cho danh mục — xoá nhóm đang chọn (đóng góp) */}
          <ThungRacDanhMuc catalog="item-classes.group" title="Nhóm hàng" sel={chain.length ? { key: chain[chain.length - 1]!.code, label: chain[chain.length - 1]!.name } : null} onDone={() => chonNhom(null)} />
          {canWrite && <button className="btn btn-sm btn-primary" onClick={() => setThemMH({ group: sel })} title={sel ? `Thêm mặt hàng vào "${ix.path(sel)}" — mã tự sinh theo nhóm` : 'Thêm mặt hàng'}><Plus size={14} /> Thêm mặt hàng</button>}
          <span className="spacer" />
          <b className="nh3-title">Duyệt theo Ngành → Nhãn → Nhóm</b>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        <div className="nh3-tim"><Search size={14} /><input className="input" value={tim} onChange={(e) => setTim(e.target.value)} placeholder="Tìm kiếm…" /></div>
        {q.isLoading ? <Loading /> : (
          <div className="nh3-cots">
            {cot.map((c) => {
              const ds = khop ? c.list.filter((x) => khop.has(x.code)) : c.list;
              return (
                <section key={c.lv} className={`nh3-cot l${c.lv}`}>
                  <header><i className={`nh3-so l${c.lv}`}>{c.lv}</i><b>{c.ten}</b><span className="muted">{ds.length}</span></header>
                  <div className="nh3-ds">
                    {ds.map((x) => {
                      const on = c.chon === x.code;
                      return (
                        <div key={x.code} className={`nh3-dong${on ? ' on' : ''}${x.isActive ? '' : ' off'}`} onClick={() => chonNhom(x.code)}
                          onDoubleClick={() => canWrite && setForm({ mode: 'edit', code: x.code })} title={`${ix.path(x.code)}${x.isActive ? '' : ' (ngừng dùng)'} — bấm đúp để sửa`}>
                          {x.skuCode ? <span className="nh3-ma mono">{x.skuCode}</span> : <span className="nh3-ma chua">chưa mã</span>}
                          <span className="nh3-ten">{x.name}</span>
                          {trungMa(x) && <span className="nh3-trung" title="Cùng mã ngắn với nhóm khác cùng cấp — mã hàng sẽ trùng đầu">trùng mã</span>}
                          <span className="nh3-sl">{(tongMH.get(x.code) ?? 0).toLocaleString('vi-VN')}</span>
                          {on && <>
                            {canWrite && <button type="button" className="nh3-nut" title="Sửa nhóm" onClick={(e) => { e.stopPropagation(); setForm({ mode: 'edit', code: x.code }); }}><Pencil size={12} /></button>}
                            <button type="button" className="nh3-nut" title="Lịch sử" onClick={(e) => { e.stopPropagation(); setLichSu(x); }}><History size={12} /></button>
                            <Check size={14} className="nh3-tich" />
                          </>}
                        </div>
                      );
                    })}
                    {!ds.length && <div className="muted nh3-trong">{khop ? 'Không có nhóm nào khớp.' : c.trong}</div>}
                  </div>
                  {canWrite && <footer><button type="button" className="nh3-them" disabled={c.lv > 1 && !c.cha} title={c.lv > 1 && !c.cha ? `Chọn một ${c.lv === 2 ? "ngành hàng" : "nhãn hàng"} ở cột bên trái trước` : undefined} onClick={() => setForm({ mode: 'add', parent: c.cha })}>+ {c.them}</button></footer>}
                </section>
              );
            })}
          </div>
        )}
        <div className="nh3-mh">
          <div className="catalog-toolbar canh-phai">
            <select className="select input" style={{ height: 28, width: 'auto' }} value={trangThai} onChange={(e) => { setTrangThai(e.target.value as typeof trangThai); setTrang(1); }}>
              <option value="all">Tất cả trạng thái</option><option value="active">Đang dùng</option><option value="inactive">Ngừng dùng</option><option value="draft">Nháp</option>
            </select>
            <span className="spacer" />
            {chain.length > 0 && <span className="muted" style={{ fontSize: 12 }}>{ix.path(sel)}</span>}
            <b>Mặt hàng <span className="muted">({tongDong.toLocaleString('vi-VN')})</span></b>
          </div>
          <ErrorBox error={mh.error ? errorText(mh.error) : null} />
          {mh.isLoading ? <Loading /> : (
            <DataGrid storageKey="dm11-mat-hang-v1" exportName="mat-hang-theo-nhom" rows={mh.data?.data ?? []} rowKey={(p) => p.sku} columns={cotMH} maxHeight="50vh"
              onRowDoubleClick={(p) => setMoMH(p.sku)} footerLabel={false} emptyText={sel ? 'Nhánh này chưa có mặt hàng.' : 'Chưa có mặt hàng.'} />
          )}
          {tongDong > TRANG_MH && <Pager page={trang} pageSize={TRANG_MH} total={tongDong} onPage={setTrang} />}
        </div>
      </div>
      {form && <NhomForm ix={ix} list={q.data ?? []} form={form} onClose={() => setForm(null)} onSaved={(code) => { setForm(null); chonNhom(code); }} />}
      {themMH && <ProductEditor sku={null} initial={{ groupCode: themMH.group }} onClose={() => setThemMH(null)} onSaved={() => { void q.refetch(); void mh.refetch(); }} />}
      {moMH && <ProductEditor sku={moMH} onClose={() => { setMoMH(null); void mh.refetch(); }} />}
      {lichSu && <Modal title={`Lịch sử nhóm "${lichSu.name}"`} onClose={() => setLichSu(null)} footer={<button className="btn" onClick={() => setLichSu(null)}>Đóng</button>}><div className="full"><LichSuNhom code={lichSu.code} /></div></Modal>}
    </>
  );
}

/** Hộp thoại thêm / sửa nhóm: thuộc nhóm, mã (điền sẵn gợi ý), tên, đang dùng. */
function NhomForm({ ix, list, form, onClose, onSaved }: { ix: NhomIndex; list: NhomHang[]; form: { mode: 'add'; parent: string | null; copy?: string } | { mode: 'edit'; code: string }; onClose: () => void; onSaved: (code: string, parent: string | null) => void }) {
  const qc = useQueryClient();
  const old = form.mode === 'edit' ? ix.byCode.get(form.code)! : null;
  const [parent, setParent] = useState<string | null>(form.mode === 'add' ? form.parent : ix.parentOf(form.code));
  // Nhóm cũ chưa có mã ngắn: điền sẵn mã gợi ý (nhập lần đầu không làm đổi mã hàng đã có).
  const [ma, setMa] = useState(form.mode === 'add' ? goiYMa(ix, form.parent) : old?.skuCode || (old ? goiYMa(ix, ix.parentOf(old.code)) : ''));
  // [2026-11-18 01:40 PM kiennt] NT-DM-006 — nhân bản: chép tên, ghi chú của nhóm gốc; mã ngắn gợi ý mới (đóng góp)
  const goc = form.mode === 'add' && form.copy ? ix.byCode.get(form.copy) ?? null : null;
  const [ghiChu, setGhiChu] = useState(old?.note ?? goc?.note ?? '');
  // [2026-11-12 Nguyễn Văn Thủy] thêm mới: điền sẵn cả 3 ô (mã nhóm, mã ngắn, tên đầy đủ) — sửa lại cho đúng rồi Ghi (đóng góp)
  // nhân bản: tên nhóm phải khác (mã nhóm hàng không trùng) — điền "… (bản sao)" để sửa lại
  const goiYTen = form.mode === 'add' ? (goc ? `${goc.name} (bản sao)` : `Nhóm mới ${1000 + Math.floor(Math.random() * 9000)}`) : '';
  const [ten, setTen] = useState(old?.name ?? goiYTen);
  // [2026-11-18 05:10 PM kiennt] NT-DM-010 — đổi tên ô: Tên ngành (name), Mã hoá (skuCode), Mô tả (fullName, không bắt buộc, không tự ghép) (đóng góp)
  const [full, setFull] = useState(old?.fullName ?? goc?.fullName ?? '');
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
    if (!ma) return `Nhập mã hoá cấp ${lv}: ${QUY_TAC[lv]}`;
    if (lv === 1 ? !/^[1-9][0-9]$/.test(ma) : !/^[A-Z0-9]+$/.test(ma) || ma.length !== len) return `Mã hoá cấp ${lv} phải là ${QUY_TAC[lv]} (đang "${ma}")`;
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
  // [2026-11-18 03:10 PM kiennt] NT-DM-009 — mã nhóm hàng không trùng nhóm cùng cha, không trùng tên nhóm cha (sửa: cả nhóm con trực tiếp);
  // khác cha thì được trùng, kể cả trong cùng ngành.
  const trungTen = (() => {
    if (!ten.trim() || (old && nn(old.name) === nn(ten))) return undefined;
    const anhEm = (parent ? ix.kids.get(parent) ?? [] : ix.roots).find((x) => x.code !== old?.code && nn(x.name) === nn(ten));
    if (anhEm) return { x: anhEm, la: 'nhóm cùng cấp' };
    const cha = parent ? ix.byCode.get(parent) : undefined;
    if (cha && nn(cha.name) === nn(ten)) return { x: cha, la: 'nhóm cha' };
    const con = old ? (ix.kids.get(old.code) ?? []).find((x) => nn(x.name) === nn(ten)) : undefined;
    return con ? { x: con, la: 'nhóm con' } : undefined;
  })();
  const loiTen = trungTen ? `Tên ngành trùng ${trungTen.la} "${ix.path(trungTen.x.code)}" — đặt tên khác` : '';
  const ghi = () => { const e = !ten.trim() ? 'Nhập tên ngành' : loiTen || loiMa; setErr(e); if (!e) save.mutate(); };

  return (
    <>
      <Modal title={old ? `Sửa nhóm "${old.name}"` : parent ? `Thêm nhóm con của "${ix.byCode.get(parent)?.name}"` : 'Thêm nhóm cấp 1'} helpKey="nhom-hang" onClose={onClose}
        footer={<>{err && <span className="neg" style={{ marginRight: 'auto', fontWeight: 600, fontSize: 13 }}>{err}</span>}<button className="btn btn-primary" disabled={save.isPending} onClick={ghi}>{save.isPending ? 'Đang ghi…' : 'Ghi'}</button><button className="btn" onClick={onClose}>Thoát</button></>}>
        <Field label="Thuộc nhóm" full>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div className="nh-chi-xem" style={{ flex: 1 }} title="Không sửa ở đây">{parent ? ix.path(parent) : 'Nhóm hàng (gốc)'}</div>
            <span className="badge">Cấp {lv}</span>
          </div>
        </Field>
        <Field label="Tên ngành (*)" tip="Tên hiện trên cây, vd Bỉm/ Tã quần trẻ em — không trùng nhóm cùng cấp, nhóm cha">
          <input className="input" value={ten} autoFocus onFocus={(e) => e.target.select()} onChange={(e) => { setTen(e.target.value); setErr(''); }} />
          {loiTen && <div className="neg" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>{loiTen}</div>}
        </Field>
        <Field label={len ? 'Mã hoá (*)' : 'Mã hoá'} tip="Đoạn mã ghép vào mã hàng">
          {(!len || khoa) ? <div className="nh-chi-xem mono">{ma || '—'}</div> : <input className="input mono" value={ma} maxLength={len || 1} placeholder={len ? QUY_TAC[lv] : ''}
            onChange={(e) => { setMa(e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase()); setErr(''); }} />}
          {khoa
            ? <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>🔒 Đã có {soMH} mặt hàng — giữ nguyên mã hoá</div>
            : loiMa
            ? <div className="neg" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>{loiMa}</div>
            : <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{len ? `Cấp ${lv}: ${QUY_TAC[lv]}` : 'Cấp 4 trở đi không ghép vào mã hàng'}</div>}
        </Field>
        <Field label="Mô tả" full tip="Không bắt buộc">
          <input className="input" value={full} onChange={(e) => { setFull(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') ghi(); }} />
        </Field>
        <Field label="Ghi chú" full><textarea className="input" rows={2} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} /></Field>
        <Field label=" "><label className="checkbox"><input type="checkbox" checked={dung} onChange={(e) => setDung(e.target.checked)} /> Đang dùng</label></Field>
      </Modal>
      {moving && old && (
        <ChuyenNhom list={list} self={old.code} current={parent} onClose={() => setMoving(false)}
          onPick={(p) => { if (ix.level(p) !== ix.level(parent)) setMa(goiYMa(ix, p)); setParent(p); setMoving(false); }} />
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
