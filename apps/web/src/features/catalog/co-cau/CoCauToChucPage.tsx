// [2026-11-20 Nguyễn Văn Thủy] CƠ CẤU TỔ CHỨC (DM16) — làm lại theo mô hình một bảng: ĐƠN VỊ lồng nhau – PHÂN KHO – BỘ PHẬN (0173) (đóng góp)
/**
 * Mọi cấp (công ty, miền, chi nhánh, tỉnh, cửa hàng…) đều là một ĐƠN VỊ: chỉ khác tên gọi cấp do người dùng đặt.
 *   - Đơn vị: mã, tên, thuộc (cha), đường dẫn A/B/C, MST (trống = theo cấp gần nhất có khai), tên in chứng từ, địa chỉ, điện thoại.
 *   - Phân kho và bộ phận thuộc một đơn vị. Tạo đơn vị là tự có một bộ phận (đổi tên tuỳ ý).
 *   - Mã không trùng giữa đơn vị, phân kho, bộ phận.
 * Dữ liệu: GET /api/v1/co-cau; ghi qua /api/v1/co-cau/* và /api/v1/warehouses.
 */
import { useEffect, useRef, useState } from 'react';
import { FileDown, FileUp, List, ListTree, MoreHorizontal, Network, Plus, Printer, RefreshCw } from 'lucide-react';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { xuatCoCau } from './CoCauExcel';
import { CayDonVi } from './CayDonVi';
import { ChiTiet } from './ChiTiet';
import { DanhSachTat } from './DanhSach';
import { BoPhanModal, DonViModal, PhanKhoModal, XoaModal } from './HopThoai';
import { SoDo } from './SoDo';
import { type HopThoai, useCoCau } from './du-lieu';
import '../co-cau.css';
import './co-cau-moi.css';

/* ------------------------------------------------------------------ trang */

export type Xem = 'cay' | 'sodo' | 'ds';

export function CoCauToChucPage() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const cc = useCoCau();
  const [sel, setSel] = useState<string | null>(null);
  const [xem, setXem] = useState<Xem>('cay');
  const [hop, setHop] = useState<HopThoai | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return;
    const dong = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', dong);
    return () => document.removeEventListener('mousedown', dong);
  }, [menu]);
  useEffect(() => { if (!msg?.ok) return; const t = window.setTimeout(() => setMsg(null), 4000); return () => window.clearTimeout(t); }, [msg]);
  const chon = sel ? cc.byCode.get(sel) ?? null : null;
  const dangChon = chon ?? cc.roots[0] ?? null;
  const thongBao = (text: string) => setMsg({ ok: true, text });
  const mo = (h: HopThoai) => { setMsg(null); setHop(h); };

  return (
    <>
      <PageHeader title="Cơ cấu tổ chức" code="DM16" helpKey="so-do-to-chuc" subtitle="Đơn vị lồng nhau tuỳ ý (A/B/C…); mỗi đơn vị có phân kho, bộ phận riêng"
        actions={
          <div className="ccm-hd-nut">
            {canWrite && <button className="btn btn-primary" onClick={() => mo({ loai: 'donvi', code: null, cha: dangChon?.code ?? null })} title="Thêm đơn vị con của đơn vị đang chọn"><Plus size={16} /> Thêm đơn vị</button>}
            <span className="ccm-pop-o" ref={menuRef}>
              <button className="btn" title="Làm mới, xuất / nhập Excel, in" onClick={() => setMenu((x) => !x)}><MoreHorizontal size={16} /></button>
              {menu && (
                <div className="ccm-menu">
                  <button type="button" onClick={() => { setMenu(false); cc.refetch(); }}><RefreshCw size={15} /> Làm mới</button>
                  <button type="button" onClick={() => { setMenu(false); void xuatCoCau(cc); }}><FileDown size={15} /> Xuất Excel</button>
                  {canWrite && <div className="ccm-menu-nhom"><FileUp size={15} /> Nhập Excel, lần lượt:</div>}
                  {canWrite && ([['co-cau', '1. Đơn vị'], ['kho-co-cau', '2. Phân kho'], ['phong-ban', '3. Bộ phận']] as const).map(([id, nhan]) => <div key={id} className="ccm-menu-nhap"><NutNhapExcel loai={nhapLoai(id)!} label={nhan} /></div>)}
                  <button type="button" onClick={() => { setMenu(false); window.print(); }}><Printer size={15} /> In</button>
                </div>
              )}
            </span>
          </div>
        } />
      <div className="ccm-xem">
        {([['cay', 'Cây', <ListTree key="i" size={15} />], ['sodo', 'Sơ đồ', <Network key="i" size={15} />], ['ds', 'Danh sách', <List key="i" size={15} />]] as const).map(([v, t, ic]) => (
          <button key={v} type="button" className={xem === v ? 'on' : ''} onClick={() => setXem(v)}>{ic} {t}</button>
        ))}
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'} ccm-bao`}>{msg.text}</div>}
      <ErrorBox error={cc.error ? errorText(cc.error) : null} />
      {cc.loading ? <Loading /> : xem === 'sodo' ? <SoDo cc={cc} sel={dangChon?.code ?? null} onChon={(c) => { setSel(c); setXem('cay'); }} />
        : xem === 'ds' ? <DanhSachTat cc={cc} onChon={(c) => { setSel(c); setXem('cay'); }} />
        : (
          <div className="ccm">
            <div className="ccm-trai"><CayDonVi cc={cc} sel={dangChon?.code ?? null} onSel={setSel} /></div>
            {dangChon ? <ChiTiet key={dangChon.code} cc={cc} u={dangChon} canWrite={canWrite} onSel={setSel} mo={mo} />
              : <div className="ccm-phai"><div className="ccm-the-trang ccm-rong">Chưa có đơn vị nào. Bấm <b>Thêm đơn vị</b> để bắt đầu.</div></div>}
          </div>
        )}
      {hop?.loai === 'donvi' && <DonViModal cc={cc} code={hop.code} cha={hop.cha} onClose={() => setHop(null)} onSaved={(c, t, tiep) => { thongBao(t); setSel(c); if (!tiep) setHop(null); }} />}
      {hop?.loai === 'kho' && <PhanKhoModal cc={cc} code={hop.code} donVi={hop.donVi} onClose={() => setHop(null)} onSaved={(t) => { thongBao(t); setHop(null); }} />}
      {hop?.loai === 'bophan' && <BoPhanModal cc={cc} code={hop.code} donVi={hop.donVi} cha={hop.cha ?? null} onClose={() => setHop(null)} onSaved={(t) => { thongBao(t); setHop(null); }} />}
      {hop?.loai === 'xoa' && <XoaModal hop={hop} onClose={() => setHop(null)} onDone={(t, cha) => { thongBao(t); setHop(null); if (hop.key.startsWith('u:')) setSel(cha); }} cc={cc} />}
    </>
  );
}
