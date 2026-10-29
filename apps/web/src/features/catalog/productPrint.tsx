/**
 * MẪU IN danh mục mặt hàng (DM10): tem mã vạch 3–8 cột trên tờ A4 và tem kệ hàng.
 *   Tem mã vạch N cột   rptBarcode{N}ColsWithHeaderWithFooter.rpt — bố cục theo rptInBarcode_3t.repx: đầu tem tên đơn vị,
 *                       tên hàng, mã vạch Code 128 (có mã EAN-13 hợp lệ thì in EAN-13), chân tem giá bán + ĐVT
 *   Tem kệ hàng         rptItemShelfCard.rpt — thẻ to 2 cột × 4 hàng: tên hàng, giá bán lớn, ĐVT, mã vạch, ngày in
 * Mỗi mặt hàng in `copies` tem. Dữ liệu nạp trọn từ /api/v1/catalog/products/:sku (giá bảng giá công ty, ĐVT bán chính, barcode).
 */
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Barcode, type PrintTemplate } from '@/components/print';
import './catalogPrint.css';

/** Một mặt hàng cần in tem. */
export interface LabelItem { sku: string; name: string; unit: string; price: number | null; barcode: string; copies: number }

interface FullProduct { sku: string; name: string; unit: string; barcode: string; units: { unit: string; isDefault: boolean }[]; prices: { priceListCode: string; unit: string; price: number | null }[] }
interface PriceListLite { code: string; isCompany: boolean }

/** Nạp chi tiết các mặt hàng (6 yêu cầu song song) → tem: giá bảng giá công ty của ĐVT bán chính, barcode đầu tiên (nhiều mã cách "/"). */
export async function loadLabelItems(skus: string[], copies: number): Promise<LabelItem[]> {
  const lists = await api.get<PriceListLite[]>('/api/v1/catalog/price-lists');
  const company = lists.find((l) => l.isCompany)?.code;
  const out: LabelItem[] = new Array(skus.length);
  let next = 0;
  const worker = async () => {
    while (next < skus.length) {
      const i = next++;
      const p = await api.get<FullProduct>(`/api/v1/catalog/products/${encodeURIComponent(skus[i]!)}`);
      const unit = p.units.find((u) => u.isDefault)?.unit ?? p.unit;
      const ofUnit = p.prices.filter((x) => x.unit === unit && x.price !== null);
      const price = (ofUnit.find((x) => x.priceListCode === company) ?? ofUnit[0])?.price ?? null;
      out[i] = { sku: p.sku, name: p.name, unit, price, barcode: ((p.barcode ?? '').split('/')[0] ?? '').trim(), copies };
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, skus.length) }, worker));
  return out;
}

/** Trải theo số tem của từng mặt hàng. */
const expand = (items: LabelItem[]) => items.flatMap((x) => Array.from({ length: Math.max(1, x.copies) }, () => x));
const chunk = <T,>(list: T[], n: number) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
const priceText = (v: number | null) => (v === null ? '' : `${money(v, { blankZero: false })} đ`);

/** Vùng in của tờ tem A4 (trừ lề @page pLabel 6mm / 5mm): 200 × 285mm. Số hàng mỗi tờ, cỡ chữ (px) theo số cột. */
const SHEET_W = 200, SHEET_H = 284;
const GRID: Record<number, { rows: number; font: number; bar: number }> = {
  3: { rows: 8, font: 10, bar: 11 }, 4: { rows: 10, font: 9, bar: 9 }, 5: { rows: 11, font: 8, bar: 8 },
  6: { rows: 12, font: 7.5, bar: 7.5 }, 7: { rows: 13, font: 7, bar: 7 }, 8: { rows: 14, font: 6.5, bar: 6.5 },
};

function LabelSheet({ items, cols, org }: { items: LabelItem[]; cols: number; org: string }) {
  const g = GRID[cols] ?? GRID[3]!;
  const w = SHEET_W / cols, h = Math.floor((SHEET_H / g.rows) * 10) / 10;
  return (
    <>
      {chunk(expand(items), cols * g.rows).map((page, pi) => (
        <div key={pi} className="lb-page" style={{ gridTemplateColumns: `repeat(${cols}, ${w}mm)`, gridAutoRows: `${h}mm`, fontSize: g.font }}>
          {page.map((x, i) => (
            <div key={i} className="lb-cell">
              <div className="lb-org">{org}</div>
              <div className="lb-name">{x.name}</div>
              <div className="lb-code"><Barcode value={x.barcode || x.sku} height={g.bar} width="100%" /></div>
              <div className="lb-price">{priceText(x.price)}{x.unit && <small> / {x.unit}</small>}</div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/** Tem kệ hàng: 2 cột × 4 hàng mỗi tờ (thẻ ≈ 98 × 69mm). */
function ShelfSheet({ items, org }: { items: LabelItem[]; org: string }) {
  const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <>
      {chunk(expand(items), 8).map((page, pi) => (
        <div key={pi} className="lb-page" style={{ gridTemplateColumns: 'repeat(2, 98mm)', gridAutoRows: '69mm', gap: '2mm 4mm' }}>
          {page.map((x, i) => (
            <div key={i} className="sc-cell">
              <div className="sc-org">{org}</div>
              <div className="sc-name">{x.name}</div>
              <div className="sc-price">{x.price === null ? '…………' : money(x.price, { blankZero: false })}<small> đ{x.unit ? ` / ${x.unit}` : ''}</small></div>
              <div className="sc-bottom">
                <Barcode value={x.barcode || x.sku} height={9} moduleWidth={0.3} />
                <div style={{ textAlign: 'right' }}>Mã: {x.sku}<br />Ngày in: {today}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

type T = PrintTemplate<LabelItem>;
const one = () => null;
/** Các mẫu in tem của DM10; mẫu đầu là mặc định. */
export const PRODUCT_LABEL_TEMPLATES: T[] = [
  ...[3, 4, 5, 6, 7, 8].map((n): T => ({
    id: `tem${n}`, name: `Tem mã vạch ${n} cột`, paper: 'label', many: true, source: `rptBarcode${n}ColsWithHeaderWithFooter.rpt`,
    render: one, renderAll: (docs, ctx) => <LabelSheet items={docs} cols={n} org={ctx.org.name} />,
  })),
  { id: 'ke', name: 'Tem kệ hàng', paper: 'label', many: true, source: 'rptItemShelfCard.rpt', render: one, renderAll: (docs, ctx) => <ShelfSheet items={docs} org={ctx.org.name} /> },
];
