/**
 * MẪU IN bảng giá bán (DM14): một bảng giá với mọi mặt hàng có giá.
 *   Báo giá dạng danh sách   rptQuotationAsList.rpt (A4): đầu trang đơn vị, BẢNG BÁO GIÁ, kính gửi, hiệu lực, bảng STT / mã / tên / ĐVT / đơn giá
 *   Báo giá dạng thẻ         rptQuotationAsCard.rpt (A4): lưới thẻ 3 cột — tên, giá, ĐVT, mã vạch (theo mã hàng)
 *   Phiếu báo giá            rptPhieuBaoGiaSO.rpt (A4): báo giá gửi khách, thông tin khách để dòng chấm ghi tay, giá trước thuế / thuế suất / giá gồm thuế
 * Giá bảng giá bán là giá ĐÃ gồm thuế GTGT (như khi lập phiếu bán). Bảng giá chi nhánh: hàng chính lấy giá công ty, hàng thường
 * thiếu giá chi nhánh cũng lấy giá công ty (đúng luật lấy giá khi bán).
 */
import type { QueryClient } from '@tanstack/react-query';
import { api, ALL_ROWS } from '@/lib/api';
import { TAX_RATES } from '@/lib/tradeDocs';
import { Barcode, Fields, Foot, OrgHead, Signs, Table, Title, dayText, mb, type PrintCtx, type PrintTemplate } from '@/components/print';
import './catalogPrint.css';

export interface QuoteRow { sku: string; name: string; unit: string; price: number; taxCode: string | null }
export interface QuoteDoc { code: string; name: string; isCompany: boolean; note: string; date: string; rows: QuoteRow[] }

interface PriceRow { sku: string; name: string; isMain: boolean; isActive: boolean; noSale: boolean; unit: string; price: number | null; companyPrice: number | null }
interface RowsResponse { code: string; isCompany: boolean; rows: PriceRow[] }

/**
 * Nạp lưới giá của bảng giá (cùng khoá cache với PriceRowsPanel) + mã VAT ra của mặt hàng → chứng từ báo giá.
 * Bỏ mặt hàng ngừng theo dõi / không bán và ô chưa có giá.
 */
export async function loadQuote(qc: QueryClient, list: { code: string; name: string; isCompany: boolean; note: string }): Promise<QuoteDoc> {
  const [data, products] = await Promise.all([
    qc.fetchQuery({ queryKey: ['price-rows', list.code], queryFn: () => api.get<RowsResponse>(`/api/v1/catalog/price-lists/${encodeURIComponent(list.code)}/rows`) }),
    api.getPage<{ sku: string; taxOutCode: string | null }[]>('/api/v1/products', { pageSize: ALL_ROWS, status: 'all' }).then((r) => r.data),
  ]);
  const tax = new Map(products.map((p) => [p.sku, p.taxOutCode]));
  const rows: QuoteRow[] = [];
  for (const r of data.rows) {
    if (!r.isActive || r.noSale) continue;
    const price = data.isCompany ? r.price : r.isMain ? r.companyPrice : r.price ?? r.companyPrice;
    if (price === null || price === undefined || price <= 0) continue;
    rows.push({ sku: r.sku, name: r.name, unit: r.unit, price, taxCode: tax.get(r.sku) ?? null });
  }
  return { ...list, date: new Date().toISOString().slice(0, 10), rows };
}

const rateOf = (code: string | null): number | null => (code ? TAX_RATES[code] ?? null : null);
const rateText = (code: string | null) => { const r = rateOf(code); return r === null ? (code ?? '') : code === 'KCT' ? 'KCT' : `${r}%`; };
const phone = (ctx: PrintCtx) => (ctx.org.phone ? <div>ĐT: {ctx.org.phone}</div> : undefined);

/** Báo giá dạng danh sách. */
function ListSheet({ d, ctx }: { d: QuoteDoc; ctx: PrintCtx }) {
  return (
    <>
      <OrgHead ctx={ctx} extra={phone(ctx)} />
      <Title title="BẢNG BÁO GIÁ" sub={d.name} date={d.date} />
      <Fields rows={[['Kính gửi', ''], ['Hiệu lực', `Từ ${dayText(d.date).toLowerCase()} đến khi có thông báo mới`]]} />
      <div style={{ margin: '4px 0' }}>{ctx.org.name} trân trọng gửi Quý khách bảng giá các mặt hàng như sau:</div>
      <Table rows={d.rows} compact cols={[
        { h: 'STT', w: 34, center: true, v: (_, i) => i + 1 },
        { h: 'Mã hàng', w: 92, v: (r) => r.sku },
        { h: 'Tên hàng hoá', v: (r) => r.name },
        { h: 'ĐVT', w: 50, center: true, v: (r) => r.unit },
        { h: 'Đơn giá (đã gồm VAT)', w: 96, num: true, v: (r) => mb(r.price) },
        { h: 'Ghi chú', w: 100, v: () => '' },
      ]} />
      <div className="pd-note">
        <div>- Đơn giá tính bằng đồng Việt Nam, đã bao gồm thuế GTGT.</div>
        <div>- Giá có thể thay đổi theo thời điểm; vui lòng liên hệ để có giá mới nhất trước khi đặt hàng.</div>
        {d.note && <div>- {d.note}</div>}
      </div>
      <Signs date={d.date} items={[{ title: 'Người lập' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }]} />
      <Foot ctx={ctx} text={`Bảng giá ${d.code} · ${d.rows.length} dòng`} />
    </>
  );
}

/** Báo giá dạng thẻ: 3 cột, mỗi thẻ tên, mã, mã vạch (theo mã hàng), giá / ĐVT. */
function CardSheet({ d, ctx }: { d: QuoteDoc; ctx: PrintCtx }) {
  return (
    <>
      <OrgHead ctx={ctx} extra={phone(ctx)} />
      <Title title="BẢNG BÁO GIÁ" sub={d.name} date={d.date} />
      <div className="pd-note pd-center">Đơn giá tính bằng đồng Việt Nam, đã bao gồm thuế GTGT.</div>
      <div className="qc-grid">
        {d.rows.map((r, i) => (
          <div key={i} className="qc-card">
            <div className="qc-name">{r.name}</div>
            <div className="qc-sku">Mã: {r.sku}</div>
            <Barcode value={r.sku} height={8} moduleWidth={0.25} />
            <div className="qc-price">{mb(r.price)}<small> đ / {r.unit}</small></div>
          </div>
        ))}
      </div>
      <Foot ctx={ctx} text={`Bảng giá ${d.code} · ${d.rows.length} dòng`} />
    </>
  );
}

/** Phiếu báo giá gửi khách: thông tin khách để trống ghi tay; giá trước thuế, thuế suất, giá gồm thuế; cột SL để ghi tay. */
function QuoteSheet({ d, ctx }: { d: QuoteDoc; ctx: PrintCtx }) {
  return (
    <>
      <OrgHead ctx={ctx} extra={phone(ctx)} />
      <Title title="PHIẾU BÁO GIÁ" date={d.date} no="" />
      <Fields rows={[['Kính gửi', ''], ['Địa chỉ', ''], ['Điện thoại', ''], ['Mã số thuế', ''], ['Người liên hệ', '']]} />
      <div style={{ margin: '4px 0' }}>{ctx.org.name} xin trân trọng gửi tới Quý khách báo giá như sau (theo {d.name}):</div>
      <Table rows={d.rows} compact cols={[
        { h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
        { h: 'Mã hàng', w: 84, v: (r) => r.sku },
        { h: 'Tên hàng hoá, dịch vụ', v: (r) => r.name },
        { h: 'ĐVT', w: 44, center: true, v: (r) => r.unit },
        { h: 'SL', w: 40, num: true, v: () => '' },
        { h: 'Đơn giá chưa thuế', w: 84, num: true, v: (r) => { const t = rateOf(r.taxCode); return t === null ? '' : mb(Math.round(r.price / (1 + t / 100))); } },
        { h: 'Thuế GTGT', w: 50, center: true, v: (r) => rateText(r.taxCode) },
        { h: 'Đơn giá gồm thuế', w: 84, num: true, v: (r) => mb(r.price) },
      ]} />
      <div className="pd-note">
        <div>- Báo giá có hiệu lực ........ ngày kể từ {dayText(d.date).toLowerCase()}.</div>
        <div>- Thời gian, địa điểm giao hàng: ....................................................................................</div>
        <div>- Phương thức thanh toán: ...........................................................................................</div>
        {d.note && <div>- {d.note}</div>}
      </div>
      <Signs date={d.date} items={[{ title: 'Khách hàng', note: '(Ký xác nhận, họ tên)' }, { title: 'Người lập' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }]} />
      <Foot ctx={ctx} />
    </>
  );
}

type T = PrintTemplate<QuoteDoc>;
/** Các mẫu in của DM14; mẫu đầu là mặc định. */
export const PRICE_LIST_TEMPLATES: T[] = [
  { id: 'list', name: 'Báo giá dạng danh sách', paper: 'A4', source: 'rptQuotationAsList.rpt', render: (d, c) => <ListSheet d={d} ctx={c} /> },
  { id: 'card', name: 'Báo giá dạng thẻ', paper: 'A4', source: 'rptQuotationAsCard.rpt', render: (d, c) => <CardSheet d={d} ctx={c} /> },
  { id: 'quote', name: 'Phiếu báo giá', paper: 'A4', source: 'rptPhieuBaoGiaSO.rpt', render: (d, c) => <QuoteSheet d={d} ctx={c} /> },
];
