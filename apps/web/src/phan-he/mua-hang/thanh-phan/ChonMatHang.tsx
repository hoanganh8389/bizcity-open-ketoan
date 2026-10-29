/**
 * CHỌN MẶT HÀNG TỪ DANH MỤC — một bộ chọn dùng chung cho mọi bảng có mã hàng (phiếu mua, chiết khấu theo mã, giá mua…):
 *   - tìm không dấu theo tên / mã (nhiều từ), lọc theo nhãn; gõ đúng mã (hoặc quét mã vạch) rồi Enter là thêm ngay — ô tìm
 *     trống lại sau mỗi lần thêm bằng Enter để quét tiếp;
 *   - BẤM VÀO DÒNG LÀ THÊM (không tích chọn rồi bấm nút); ↑ ↓ di chuyển, Enter thêm dòng đang sáng;
 *   - mã đã có trong bảng hiện nhãn (vd "✓ đã có", "đang 12 Hộp"); repeat = bấm lại vẫn được (phiếu: cộng thêm số lượng);
 *   - "Thêm tất cả" cho cả danh sách đang hiện (bảng chiết khấu nghìn mã); tải thêm 200 mã mỗi lần.
 * Tên, ĐVT, thuế suất, nhãn luôn lấy theo danh mục mặt hàng — bảng gọi bộ chọn này không cho gõ tay tên hàng.
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui';
import { api } from '@/lib/api';
import { useBrands } from '../du-lieu';
import { BrandInput } from '../chung';

export type CatalogItem = { sku: string; name: string; unit: string; brandCode: string | null; taxInCode?: string | null };

export function ChonMatHang({ title = 'Thêm mặt hàng — bấm vào dòng để thêm', initial = '', existing, repeat, onPick, onPickAll, footer, prefer, onClose }: {
  title?: string;
  initial?: string;
  /** Mã đã có trong bảng → chữ hiện ở cột cuối. */
  existing: Map<string, string>;
  /** Mã đã có vẫn bấm được (phiếu: cộng số lượng). Không đặt = không thêm trùng. */
  repeat?: boolean;
  onPick: (p: CatalogItem) => void;
  onPickAll?: (ps: CatalogItem[]) => void;
  footer?: ReactNode;
  /** Nhãn NCC đang bán — xếp lên đầu ô lọc nhãn. */
  prefer?: { brandCode: string; skus: number }[];
  onClose: () => void;
}) {
  const brands = useBrands();
  const [text, setText] = useState(initial);
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState(100);
  const [hi, setHi] = useState(0);
  const [added, setAdded] = useState(0);
  const enabled = text.trim().length >= 2 || Boolean(brand);
  const q = useQuery({ queryKey: ['catalog', 'pick-products', text.trim(), brand, size], enabled, staleTime: 30_000,
    queryFn: async () => (await api.getPage<CatalogItem[]>('/api/v1/products', { search: text.trim() || undefined, brand: brand || undefined, status: 'active', pageSize: size })).data });
  // Mã đúng tuyệt đối (gõ / quét) lên đầu để Enter là thêm đúng mã đó.
  const list = [...(q.data ?? [])].sort((a, b) => Number(b.sku.toLowerCase() === text.trim().toLowerCase()) - Number(a.sku.toLowerCase() === text.trim().toLowerCase()));
  const can = (p: CatalogItem) => repeat || !existing.has(p.sku);
  const pick = (p?: CatalogItem) => { if (!p || !can(p)) return; onPick(p); setAdded((x) => x + 1); };
  const fresh = list.filter((p) => !existing.has(p.sku));
  /** Enter: đúng mã (quét / gõ) thì thêm mã đó kể cả khi danh sách chưa tải xong; không thì thêm dòng đang sáng.
   *  Thêm bằng Enter xong ô tìm trống lại để quét mã tiếp. */
  const enter = async () => {
    const t = text.trim();
    if (!t) return;
    let p = list.find((x) => x.sku.toLowerCase() === t.toLowerCase());
    if (!p && (q.isFetching || !q.data)) p = (await api.getPage<CatalogItem[]>('/api/v1/products', { search: t, status: 'active', pageSize: 5 }).catch(() => ({ data: [] as CatalogItem[] }))).data.find((x) => x.sku.toLowerCase() === t.toLowerCase());
    const target = p ?? list[hi];
    if (!target || !can(target)) return;
    pick(target);
    if (p) { setText(''); setHi(0); }
  };
  return (
    <Modal wide title={title} onClose={onClose}
      footer={<>
        {footer ?? <span style={{ marginRight: 'auto' }} />}
        {added > 0 && <span className="mh-ok">Đã thêm {added} lần</span>}
        {onPickAll && <button className="btn" disabled={!fresh.length} onClick={() => { onPickAll(fresh); setAdded((x) => x + fresh.length); }}>Thêm tất cả {fresh.length} mã đang hiện</button>}
        <button className="btn btn-primary" onClick={onClose}>Xong</button></>}>
      <div className="full row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input" type="search" autoComplete="off" data-lpignore="true" style={{ width: 340 }} autoFocus placeholder="Gõ / quét mã, hoặc tên không dấu (vd: sua tuoi 110)" value={text}
          onChange={(e) => { setText(e.target.value); setSize(100); setHi(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); void enter(); }
          }} />
        <span style={{ width: 260 }}><BrandInput value={brand} brands={brands} prefer={prefer} onChange={(b) => { setBrand(b); setSize(100); setHi(0); }} /></span>
        <span className="muted" style={{ fontSize: 12 }}>{!enabled ? 'Gõ ít nhất 2 ký tự hoặc chọn nhãn hàng' : q.isFetching ? 'Đang tìm…' : `${list.length} mã${list.length >= size ? '+' : ''} · ↑ ↓ chọn, Enter thêm`}</span>
      </div>
      <div className="full ckma-scroll" style={{ maxHeight: 420, marginTop: 8 }}>
        <table className="mh-mini ckma-pick" data-no-nav>
          <thead><tr><th style={{ width: 130 }}>Mã hàng</th><th>Tên hàng</th><th style={{ width: 80 }}>ĐVT</th><th style={{ width: 150 }}>Nhãn</th><th style={{ width: 120 }} /></tr></thead>
          <tbody>
            {list.map((p, k) => { const has = existing.get(p.sku); return (
              <tr key={p.sku} className={`${has && !repeat ? 'is-added' : ''} ${k === hi ? 'is-hi' : ''}`} onClick={() => { setHi(k); pick(p); }} onMouseEnter={() => setHi(k)} title={has && !repeat ? 'Đã có trong bảng' : 'Bấm để thêm'}>
                <td className="mono">{p.sku}</td><td>{p.name}</td><td>{p.unit}</td><td>{brands.find((b) => b.code === p.brandCode)?.name ?? p.brandCode ?? ''}</td>
                <td>{has ? <span className="mh-ok">✓ {has}</span> : null}{(!has || repeat) && <span className="ckma-add">{has ? ' + thêm' : '+ Thêm'}</span>}</td>
              </tr>); })}
            {enabled && !q.isFetching && !list.length && <tr><td colSpan={5} className="muted">Không thấy mặt hàng nào khớp "{text}"{brand ? ` thuộc nhãn ${brand}` : ''}. Thử gõ một phần tên khác (không cần dấu) hoặc một phần mã hàng. Mặt hàng mới thì khai ở Danh mục mặt hàng trước.</td></tr>}
            {!enabled && <tr><td colSpan={5} className="muted">Gõ tên / mã (ít nhất 2 ký tự) hoặc chọn nhãn hàng để liệt kê mặt hàng.</td></tr>}
          </tbody>
        </table>
        {list.length >= size && <button type="button" className="btn btn-sm ckma-more" onClick={() => setSize((x) => x + 200)}>Tải thêm 200 mã</button>}
      </div>
    </Modal>
  );
}
