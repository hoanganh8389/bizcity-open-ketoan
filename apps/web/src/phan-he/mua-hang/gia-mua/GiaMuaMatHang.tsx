/**
 * Thẻ "Mua hàng" trong form Mặt hàng — 4 khối:
 *   ① Giá mua riêng của sản phẩm (tím, tham khảo): giá cố định riêng cho mã (supplier_products, NCC trống), đặt cạnh giá vốn bình quân
 *      và giá nhập gần nhất để so. NCC nào chưa khai giá riêng thì phiếu nhập so với giá này. Đổi giá = thêm hiệu lực mới
 *      (giữ lịch sử).
 *   ② Giá mua theo từng nhà cung cấp (xanh lá): cùng bảng "Mặt hàng & giá mua" ở hồ sơ NCC (BangGiaMua).
 *   ④ Các lần nhập gần nhất.
 * ĐVT và tỉ lệ khai ở thẻ "Đơn vị tính"; giá bán ở thẻ "Giá bán".
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { TAX_RATE, ratioOf, type ProductUnit, type SupplierProduct } from '@bizcity/mua-hang-domain';
import { api, errorText } from '@/lib/api';
import { price as donGia, roundPrice } from '@/lib/format';
import { NumInput } from '@/components/ui';
import { P, purchaseApi, today, useMuaHang, useNames } from '../du-lieu';
import { dmy } from '../chung';
import { GiaNccTheoMa } from './GiaNccTheoMa';
import '../mua-hang.css';

type Hist = { date: string; partnerCode: string; docNo: string; unitPrice: number; includesVat: boolean; unit?: string; qty?: number };
const pct = (a: number, b: number) => Math.round(((a - b) / b) * 1000) / 10;

export function GiaMuaMatHang({ sku, name }: { sku: string; name: string; units: string[] }) {
  const { data, refresh } = useMuaHang();
  const names = useNames();
  const hist = useQuery({ queryKey: ['mua-hang', 'price-history', sku], enabled: Boolean(sku), queryFn: () => api.get<Hist[]>(`${P}/price-history/${encodeURIComponent(sku)}`, { limit: 10 }) });
  if (!sku) return <div className="muted">Ghi mặt hàng trước rồi mới khai mua hàng.</div>;
  if (!data) return <div className="muted">Đang tải…</div>;

  // data-view-ok: mỗi khối có nút sửa riêng (Sửa giá mua riêng, Sửa bảng…) nên không phải bấm "Sửa" cả hộp thoại trước.
  return (
    <div className="full blk-stack" data-view-ok>
      {/* [2026-11-12 Nguyễn Văn Thủy] bỏ khối Giá mua riêng của sản phẩm (đơn giản hoá) (đóng góp) */}
      <section className="blk blk-green">
        <header><div><b>Giá mua theo từng nhà cung cấp</b><span>Mỗi nhà cung cấp hiện 3 đợt giá gần nhất. Bấm một dòng để sửa.</span></div></header>
        <div className="blk-body"><GiaNccTheoMa sku={sku} name={name} onChanged={() => void refresh()} /></div>
      </section>
      {/* [2026-11-12 Nguyễn Văn Thủy] bỏ khối Tồn max ở form mặt hàng: cấu hình ở màn Tồn max (đóng góp) */}
      <section className="blk blk-blue">
        <header><div><b>Các lần nhập gần nhất</b><span>Đơn giá thực tế sau chiết khấu.</span></div></header>
        <div className="blk-body">
          <table className="mh-mini">
            <thead><tr><th>Ngày</th><th>Phiếu</th><th>Nhà cung cấp</th><th>ĐVT</th><th className="num">SL</th><th className="num">Đơn giá thực tế</th></tr></thead>
            <tbody>
              {(hist.data ?? []).map((h, i) => <tr key={i}><td>{dmy(h.date)}</td><td className="mono">{h.docNo}</td><td>{names.partnerName(h.partnerCode)}</td><td>{h.unit ?? ''}</td><td className="num">{h.qty?.toLocaleString('vi-VN') ?? ''}</td><td className="num">{donGia(h.unitPrice)} <span className="muted" style={{ fontSize: 11 }}>{h.includesVat ? 'gồm thuế' : 'chưa thuế'}</span></td></tr>)}
              {!hist.isLoading && !(hist.data ?? []).length && <tr><td colSpan={6} className="muted">Chưa nhập mã này lần nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
