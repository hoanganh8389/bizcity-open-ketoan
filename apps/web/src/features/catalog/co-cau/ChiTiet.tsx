// [2026-11-20 Nguyễn Văn Thủy] Cơ cấu tổ chức (DM16) — Chi tiết một đơn vị: thông tin, đơn vị con, phân kho, bộ phận (bảng cây / sơ đồ), lịch sử. (đóng góp)
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, FileText, History, Info, Layers, Network, Pencil, Plus, Trash2, Users, Warehouse as WarehouseIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { Hoi, Loading } from '@/components/ui';
import { Bang, cotBoPhan, cotDonVi, cotKho } from './Bang';
import { SoDoBoPhan } from './SoDo';
import { type HopThoai, type CC, type DonVi, OIc, TrangThai, iconDonVi, ngung, tenCap } from './du-lieu';

/* ------------------------------------------------------------------ chi tiết */

export type Tab = 'tt' | 'con' | 'kho' | 'bp' | 'ls';

export function ChiTiet({ cc, u, canWrite, onSel, mo }: { cc: CC; u: DonVi; canWrite: boolean; onSel: (c: string) => void; mo: (h: HopThoai) => void }) {
  const [tab, setTab] = useState<Tab>('tt');
  const [ca, setCa] = useState<{ con: boolean; kho: boolean; bp: 'rieng' | 'sodo' | 'nhanh' }>({ con: false, kho: false, bp: 'rieng' });
  const [menu, setMenu] = useState(false);
  const truc = cc.kids.get(u.code) ?? [];
  const nhanh = useMemo(() => cc.under(u.code), [cc, u.code]);
  const khoRieng = cc.khoCua.get(u.code) ?? [];
  const bpRieng = cc.bpCua.get(u.code) ?? [];
  const khoNhanh = useMemo(() => [...khoRieng, ...nhanh.flatMap((x) => cc.khoCua.get(x.code) ?? [])], [cc, nhanh, khoRieng]);
  const bpNhanh = useMemo(() => [...bpRieng, ...nhanh.flatMap((x) => cc.bpCua.get(x.code) ?? [])], [cc, nhanh, bpRieng]);
  const dem = (l: { code: string; isActive: boolean }[]) => l.filter((x) => !ngung(x)).length;
  const p = u.parentCode ? cc.byCode.get(u.parentCode) : null;
  const duong = cc.pathOf(u);
  const tenDv = (code: string | null) => { const x = code ? cc.byCode.get(code) : null; return x ? `${x.name} (${x.code})` : ''; };
  const dong = (nhan: string, gt: ReactNode, tip?: string) => <tr><th>{nhan}{tip && <Hoi text={tip} />}</th><td>{gt || <span className="muted">—</span>}</td></tr>;
  const xoa = (key: string, ten: string, ma: string) => mo({ loai: 'xoa', key, ten, ma });
  return (
    <div className="ccm-phai">
      <div className="ccm-the-trang ccm-dau">
        <OIc to>{iconDonVi(u, truc.length > 0)}</OIc>
        <div style={{ minWidth: 0 }}>
          <div className="ccm-tieude">{u.name} <span className="ccm-ma">({u.code})</span> <TrangThai x={u} /></div>
          <div className="ccm-phu">
            <span>{tenCap(u)}</span><span>Cấp {u.level}</span>
            <span>MST: <span className="mono">{u.taxUsed || '—'}</span>{u.taxFrom && <span className="muted"> (theo {u.taxFrom})</span>}</span>
          </div>
          <div className="ccm-duong-dan">{duong.map((x, i) => <span key={x.code}>{i > 0 && <span className="gach">/</span>}<button type="button" className={x.code === u.code ? 'cuoi' : ''} onClick={() => onSel(x.code)} title={x.code}>{x.name}</button></span>)}</div>
        </div>
        <span className="spacer" />
        {canWrite && (
          <span className="ccm-pop-o">
            <button className="btn btn-primary" onClick={() => setMenu((x) => !x)}><Plus size={15} /> Thêm <ChevronDown size={14} /></button>
            {menu && (
              <div className="ccm-menu">
                <button type="button" onClick={() => { setMenu(false); mo({ loai: 'donvi', code: null, cha: u.code }); }}><OIc><Network /></OIc> Đơn vị con của {u.code}</button>
                <button type="button" onClick={() => { setMenu(false); mo({ loai: 'kho', code: null, donVi: u.code }); }}><OIc><WarehouseIcon /></OIc> Phân kho của {u.code}</button>
                <button type="button" onClick={() => { setMenu(false); mo({ loai: 'bophan', code: null, donVi: u.code }); }}><OIc><Users /></OIc> Bộ phận của {u.code}</button>
              </div>
            )}
          </span>
        )}
        {canWrite && <button className="btn" onClick={() => mo({ loai: 'donvi', code: u.code, cha: null })}><Pencil size={15} /> Chỉnh sửa</button>}
        {canWrite && <button className="btn ccx-nut" onClick={() => xoa(`u:${u.code}`, u.name, u.code)} title="Xoá vĩnh viễn đơn vị và mọi thứ bên trong (xem trước ảnh hưởng)"><Trash2 size={15} /> Xoá</button>}
      </div>

      <div className="ccm-tk-hang">
        {([[<Network key="i" />, 'Đơn vị con trực tiếp', dem(truc), 'con'], [<Layers key="i" />, 'Đơn vị toàn nhánh', dem(nhanh), 'con'], [<WarehouseIcon key="i" />, 'Phân kho riêng', dem(khoRieng), 'kho'], [<Users key="i" />, 'Bộ phận riêng', dem(bpRieng), 'bp']] as const).map(([ic, ten, so, t]) => (
          <button key={ten} type="button" className="ccm-the-trang ccm-tk" onClick={() => setTab(t)}><OIc>{ic}</OIc><div><div className="ccm-tk-ten">{ten}</div><div className="ccm-tk-so">{so}</div></div></button>
        ))}
      </div>

      <div className="ccm-the-trang ccm-noi-dung">
        <div className="ccm-tabs">
          {([['tt', 'Thông tin', <Info key="i" size={16} />], ['con', 'Đơn vị con', <Network key="i" size={16} />], ['kho', 'Phân kho', <WarehouseIcon key="i" size={16} />], ['bp', 'Bộ phận', <Users key="i" size={16} />], ['ls', 'Lịch sử', <History key="i" size={16} />]] as const).map(([t, nhan, ic]) => (
            <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{ic} {nhan}</button>
          ))}
        </div>
        <div className="ccm-than">
          {tab === 'tt' && (
            <div className="ccm-tq">
              <div className="ccm-khoi">
                <div className="ccm-khoi-dau"><Info size={16} /> Thông tin đơn vị</div>
                <table className="ccm-tt-bang"><tbody>
                  {dong('Mã', <span className="mono">{u.code}</span>)}
                  {dong('Tên', u.name)}
                  {dong('Tên gọi cấp', tenCap(u), 'Chỉ là tên gọi (Công ty, Miền, Chi nhánh, Tỉnh, Cửa hàng…) — mọi cấp đều là đơn vị như nhau')}
                  {dong('Thuộc', p ? <button type="button" className="ccm-link" onClick={() => onSel(p.code)}>{p.name} ({p.code})</button> : 'Cấp cao nhất')}
                  {dong('Đường dẫn', <span className="mono">{u.path}</span>)}
                  {dong('MST tự khai', <span className="mono">{u.taxCode}</span>, 'Trống = dùng MST của cấp gần nhất có khai')}
                  {dong('MST dùng trên chứng từ', u.taxUsed ? <><span className="mono">{u.taxUsed}</span>{u.taxFrom && <span className="muted"> — kế thừa từ {tenDv(u.taxFrom)}</span>}</> : '')}
                  {dong('Tên in chứng từ', u.companyName)}
                  {dong('Địa chỉ', u.address)}
                  {dong('Điện thoại', u.phone)}
                  {dong('Bộ phận mặc định', u.departmentCode ? `${u.departmentCode} · ${cc.departments.find((d) => d.code === u.departmentCode)?.name ?? ''}` : '', 'Chứng từ của đơn vị chưa chọn bộ phận thì tính vào bộ phận này')}
                  {dong('Trạng thái', <TrangThai x={u} />)}
                </tbody></table>
              </div>
              <div className="ccm-khoi">
                <div className="ccm-khoi-dau"><Layers size={16} /> Bên trong</div>
                {([[<Network key="i" />, 'Đơn vị con trực tiếp', dem(truc)], [<Layers key="i" />, 'Đơn vị toàn nhánh', dem(nhanh)], [<WarehouseIcon key="i" />, 'Phân kho riêng / toàn nhánh', `${dem(khoRieng)} / ${dem(khoNhanh)}`], [<Users key="i" />, 'Bộ phận riêng / toàn nhánh', `${dem(bpRieng)} / ${dem(bpNhanh)}`]] as const).map(([ic, ten, so]) => (
                  <div key={ten} className="ccm-tk-dong"><OIc>{ic}</OIc> <span>{ten}</span><b>{so}</b></div>
                ))}
              </div>
              {u.note && <div className="ccm-khoi ccm-ca-dong"><div className="ccm-khoi-dau"><FileText size={16} /> Ghi chú</div><div className="ccm-ghichu">{u.note}</div></div>}
            </div>
          )}
          {tab === 'con' && (
            <>
              <div className="ccm-chip-hang">
                <button type="button" className={`ccm-chip${!ca.con ? ' on' : ''}`} onClick={() => setCa({ ...ca, con: false })}><Network size={15} /> Trực tiếp ({dem(truc)})</button>
                <button type="button" className={`ccm-chip${ca.con ? ' on' : ''}`} onClick={() => setCa({ ...ca, con: true })}><Layers size={15} /> Toàn nhánh ({dem(nhanh)})</button>
              </div>
              <Bang key={String(ca.con)} rows={ca.con ? nhanh : truc} onMo={(x) => onSel(x.code)} onSua={canWrite ? (x) => mo({ loai: 'donvi', code: x.code, cha: null }) : undefined} onXoa={canWrite ? (x) => xoa(`u:${x.code}`, x.name, x.code) : undefined}
                them={canWrite && <button type="button" className="btn btn-sm ccm-nut-them" onClick={() => mo({ loai: 'donvi', code: null, cha: u.code })}><Plus size={14} /> Thêm đơn vị con</button>}
                khoa="co-cau-con" tenXuat={`Don-vi-con-${u.code}`}
                cot={cotDonVi(cc, { duong: ca.con })}
                rong={<>Chưa có đơn vị con.</>} />
            </>
          )}
          {tab === 'kho' && (
            <>
              <div className="ccm-chip-hang">
                <button type="button" className={`ccm-chip${!ca.kho ? ' on' : ''}`} onClick={() => setCa({ ...ca, kho: false })}><WarehouseIcon size={15} /> Phân kho của {u.code} ({dem(khoRieng)})</button>
                <button type="button" className={`ccm-chip${ca.kho ? ' on' : ''}`} onClick={() => setCa({ ...ca, kho: true })}><Layers size={15} /> Toàn nhánh ({dem(khoNhanh)})</button>
              </div>
              <Bang key={String(ca.kho)} rows={ca.kho ? khoNhanh : khoRieng} onSua={canWrite ? (x) => mo({ loai: 'kho', code: x.code, donVi: null }) : undefined} onXoa={canWrite ? (x) => xoa(`w:${x.code}`, x.name, x.code) : undefined}
                them={canWrite && <button type="button" className="btn btn-sm ccm-nut-them" onClick={() => mo({ loai: 'kho', code: null, donVi: u.code })}><Plus size={14} /> Thêm phân kho</button>}
                khoa="co-cau-kho" tenXuat={`Phan-kho-${u.code}`}
                cot={cotKho(cc, ca.kho)}
                rong={<>{u.name} chưa có phân kho riêng.</>} />
            </>
          )}
          {tab === 'bp' && (
            <>
              <div className="ccm-chip-hang">
                <button type="button" className={`ccm-chip${ca.bp === 'rieng' ? ' on' : ''}`} onClick={() => setCa({ ...ca, bp: 'rieng' })}><Users size={15} /> Bộ phận của {u.code} ({dem(bpRieng)})</button>
                <button type="button" className={`ccm-chip${ca.bp === 'sodo' ? ' on' : ''}`} onClick={() => setCa({ ...ca, bp: 'sodo' })}><Network size={15} /> Sơ đồ bộ phận</button>
                <button type="button" className={`ccm-chip${ca.bp === 'nhanh' ? ' on' : ''}`} onClick={() => setCa({ ...ca, bp: 'nhanh' })}><Layers size={15} /> Toàn nhánh ({dem(bpNhanh)})</button>
              </div>
              {ca.bp === 'sodo'
                ? <SoDoBoPhan cc={cc} u={u} onMo={canWrite ? (x) => mo({ loai: 'bophan', code: x.code, donVi: null }) : undefined} onThem={canWrite ? (cha) => mo({ loai: 'bophan', code: null, donVi: u.code, cha }) : undefined} />
                : <Bang key={ca.bp} rows={cc.xepCay(ca.bp === 'nhanh' ? bpNhanh : bpRieng)} onMo={canWrite ? (x) => mo({ loai: 'bophan', code: x.code, donVi: null }) : undefined} onSua={canWrite ? (x) => mo({ loai: 'bophan', code: x.code, donVi: null }) : undefined} onXoa={canWrite ? (x) => xoa(`d:${x.code}`, x.name, x.code) : undefined}
                  them={canWrite && <button type="button" className="btn btn-sm ccm-nut-them" onClick={() => mo({ loai: 'bophan', code: null, donVi: u.code })}><Plus size={14} /> Thêm bộ phận</button>}
                  khoa="co-cau-bp" tenXuat={`Bo-phan-${u.code}`}
                  cot={cotBoPhan(cc, ca.bp === 'nhanh')}
                  rong={<>{u.name} chưa có bộ phận.</>} />}
            </>
          )}
          {tab === 'ls' && <LichSu u={u} />}
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ lịch sử */

export interface DoiCha { id: string; at: string; data: { code: string; tu: string | null; den: string | null; duongDanCu: string; apDung: string | null; nguoi: string } }
export interface SuaDong { at: string; by: string; action: string; changes: string[] }
export function LichSu({ u }: { u: DonVi }) {
  const dc = useQuery({ queryKey: ['co-cau-doi-cha', u.code], queryFn: () => api.get<DoiCha[]>('/api/v1/co-cau/doi-cha', { code: u.code }) });
  const sua = useQuery({ queryKey: ['co-cau-history', 'branch', u.code], queryFn: () => api.get<SuaDong[]>('/api/v1/co-cau/history', { type: 'branch', code: u.code }) });
  const t = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <div className="ccm-khoi-dau"><History size={16} /> Đổi cha (thuộc đơn vị nào)</div>
        {dc.isLoading ? <Loading /> : !(dc.data ?? []).length ? <div className="muted" style={{ fontSize: 13 }}>Chưa đổi cha lần nào.</div> : (
          <table className="grid cc-log"><thead><tr><th>Thời gian</th><th>Từ</th><th>Sang</th><th>Đường dẫn cũ</th><th>Áp dụng từ</th><th>Người làm</th></tr></thead>
            <tbody>{dc.data!.map((x) => <tr key={x.id}><td className="mono">{t(x.at)}</td><td>{x.data.tu ?? '(gốc)'}</td><td>{x.data.den ?? '(gốc)'}</td><td className="mono muted">{x.data.duongDanCu}</td><td>{x.data.apDung ?? 'ngay'}</td><td>{x.data.nguoi}</td></tr>)}</tbody></table>
        )}
      </div>
      <div>
        <div className="ccm-khoi-dau"><Pencil size={16} /> Sửa thông tin</div>
        {sua.isLoading ? <Loading /> : !(sua.data ?? []).length ? <div className="muted" style={{ fontSize: 13 }}>Chưa có thay đổi.</div> : (
          <table className="grid cc-log"><thead><tr><th>Thời gian</th><th>Người làm</th><th>Việc</th><th>Thay đổi</th></tr></thead>
            <tbody>{sua.data!.map((r, i) => <tr key={i}><td className="mono">{t(r.at)}</td><td>{r.by}</td><td>{r.action}</td><td>{r.changes.map((c, j) => <div key={j}>{c}</div>)}</td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}
