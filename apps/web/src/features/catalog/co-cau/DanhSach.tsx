// [2026-11-20 Nguyễn Văn Thủy] Cơ cấu tổ chức (DM16) — Danh sách phẳng: đơn vị / phân kho / bộ phận. (đóng góp)
import { useState } from 'react';
import { Network, Users, Warehouse as WarehouseIcon } from 'lucide-react';
import { Bang, cotBoPhan, cotDonVi, cotKho } from './Bang';
import { type CC } from './du-lieu';

/* ------------------------------------------------------------------ danh sách phẳng */

export function DanhSachTat({ cc, onChon }: { cc: CC; onChon: (c: string) => void }) {
  const [loai, setLoai] = useState<'dv' | 'kho' | 'bp'>('dv');
  return (
    <div className="ccm-the-trang ccm-ds-khung">
      <div className="ccm-chip-hang">
        <button type="button" className={`ccm-chip${loai === 'dv' ? ' on' : ''}`} onClick={() => setLoai('dv')}><Network size={15} /> Đơn vị ({cc.units.length})</button>
        <button type="button" className={`ccm-chip${loai === 'kho' ? ' on' : ''}`} onClick={() => setLoai('kho')}><WarehouseIcon size={15} /> Phân kho ({cc.warehouses.length})</button>
        <button type="button" className={`ccm-chip${loai === 'bp' ? ' on' : ''}`} onClick={() => setLoai('bp')}><Users size={15} /> Bộ phận ({cc.departments.length})</button>
      </div>
      {loai === 'dv' && <Bang key="dv" rows={[...cc.units].sort((a, b) => a.path.localeCompare(b.path))} onMo={(x) => onChon(x.code)} rong="Chưa có đơn vị." khoa="co-cau-ds-dv" tenXuat="Don-vi" cot={cotDonVi(cc, { duong: true, cap: true })} />}
      {loai === 'kho' && <Bang key="kho" rows={cc.warehouses} onMo={(x) => onChon(x.branchCode)} rong="Chưa có phân kho." khoa="co-cau-ds-kho" tenXuat="Phan-kho" cot={cotKho(cc, true)} />}
      {loai === 'bp' && <Bang key="bp" rows={cc.departments} onMo={(x) => x.branchCode && onChon(x.branchCode)} rong="Chưa có bộ phận." khoa="co-cau-ds-bp" tenXuat="Bo-phan" cot={cotBoPhan(cc, true)} />}
    </div>
  );
}
