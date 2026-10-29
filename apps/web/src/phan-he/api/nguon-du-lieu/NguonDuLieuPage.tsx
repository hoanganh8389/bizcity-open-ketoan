/**
 * NGUỒN DỮ LIỆU MÀN HÌNH (API03): mỗi màn nhập phiếu chạy DỮ LIỆU GIẢ (JSON mẫu, lưu ở trình duyệt) hay API THẬT.
 * Dành cho bạn phụ trách API: viết xong endpoint → bật "API thật" cho loại phiếu đó, mở màn nhập phiếu thử ngay. Lựa chọn
 * nhớ theo máy (localStorage), không ảnh hưởng người khác. Hợp đồng endpoint: docs/api/13-phieu-nhap-tay.md (API02).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { KIND_INFO, TRADE_ENDPOINT, TRADE_KINDS, getSource, hasMockChanges, setSource, tradeApi, type DataSource, type TradeKind } from '@/lib/tradeDocs';
import { PageHeader } from '@/components/PageHeader';

/** Mua hàng, trả NCC làm ở phân hệ Mua hàng (API thật /api/v1/purchase) — không còn màn dữ liệu giả. */
const SCREEN: Partial<Record<TradeKind, { path: string; code: string }>> = {
  sale: { path: '/ban-hang/phieu-ban', code: 'BH10' },
  sale_return: { path: '/ban-hang/tra-lai', code: 'BH11' },
  transfer: { path: '/kho/chuyen-kho', code: 'KHO01' },
};

export function NguonDuLieuPage() {
  const qc = useQueryClient();
  const [, force] = useState(0);
  const change = (k: TradeKind, s: DataSource) => { setSource(k, s); void qc.invalidateQueries({ queryKey: ['trade', k] }); force((x) => x + 1); };
  const reset = (k: TradeKind) => {
    if (!window.confirm(`Xoá dữ liệu giả đã nhập của "${KIND_INFO[k].label}" trên máy này, trả về dữ liệu mẫu ban đầu?`)) return;
    tradeApi(k).resetMock();
    void qc.invalidateQueries({ queryKey: ['trade', k] });
    force((x) => x + 1);
  };
  return (
    <>
      <PageHeader title="Nguồn dữ liệu màn hình" code="API03" helpKey="nguon-du-lieu" subtitle="Màn nhập phiếu chạy dữ liệu giả (JSON mẫu) hay API thật — chọn theo từng loại phiếu, nhớ theo máy này" />
      <div className="card">
        <table className="grid-table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Màn hình</th><th style={{ width: 230 }}>Nguồn dữ liệu</th><th style={{ width: 200 }}>Dữ liệu giả trên máy này</th><th>Endpoint cần có (API thật)</th></tr>
          </thead>
          <tbody>
            {TRADE_KINDS.filter((k) => SCREEN[k]).map((k) => {
              const src = getSource(k);
              return (
                <tr key={k}>
                  <td><Link to={SCREEN[k]!.path}>{KIND_INFO[k].label}</Link> <small className="muted mono">{SCREEN[k]!.code}</small></td>
                  <td>
                    <label className="checkbox" style={{ marginRight: 10 }}><input type="radio" checked={src === 'mock'} onChange={() => change(k, 'mock')} /> Dữ liệu giả</label>
                    <label className="checkbox"><input type="radio" checked={src === 'api'} onChange={() => change(k, 'api')} /> API thật</label>
                  </td>
                  <td>
                    {hasMockChanges(k) ? <>{tradeApi(k).mockCount()} phiếu (đã sửa) <button type="button" className="btn btn-xs" onClick={() => reset(k)}>Trả mẫu ban đầu</button></> : <span className="muted">mẫu ban đầu</span>}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    GET/POST {TRADE_ENDPOINT}?docType={k} · GET/PUT/DELETE …/:id · POST …/:id/approve | unapprove
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card card-body" style={{ marginTop: 10, fontSize: 13 }}>
        <b>Cách lồng API thật:</b> viết endpoint theo <Link to="/tich-hop/huong-dan">Hướng dẫn API → 13. Phiếu nhập tay</Link> (khuôn JSON giống hệt dữ liệu mẫu,
        tệp <code>mau-*.json</code> trong thư mục phân hệ), thử ở <Link to="/tich-hop/thu-api">Thử API</Link>, rồi bật "API thật" ở đây và mở màn phiếu để chạy cùng giao diện.
        Mã gọi API đã viết sẵn ở <code>apps/web/src/lib/tradeDocs.ts</code> — không phải sửa màn hình.
      </div>
    </>
  );
}
