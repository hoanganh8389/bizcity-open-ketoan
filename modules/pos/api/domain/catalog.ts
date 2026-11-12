/**
 * Dòng khung nhìn (mặt hàng × ĐVT, giá đã áp luật DM14 ở Core) → mặt hàng của máy bán (khuôn `Product` của openapi máy bán).
 * Hàm thuần: không đọc CSDL, không tự cài lại luật giá.
 */

export type CatalogRow = {
  sku: string; name: string; base_unit: string | null; barcode: string | null; group_code: string | null;
  item_id: string | null; parent_item_id: string | null; variant_code: string | null; send_to_tax: boolean | null;
  tax_code: string | null; tax_rate: string | number | null;
  unit: string | null; ratio: string | number | null; price: string | number | null; is_default_unit: boolean | null;
};

export type SaleUnit = { unit: string; ratio: number; price: number | null; isDefault: boolean };
export type PosProduct = {
  id: string; sku: string; name: string; unitName: string; price: number; taxRate: number | null; groupCode: string; barcode: string;
  itemId: string | null; parentItemId: string | null; variant: string; sendTax: boolean; units: SaleUnit[];
};

const num = (v: string | number | null) => (v === null || v === undefined ? null : Number(v));

/** Gom dòng theo mã (giữ thứ tự vào); đơn vị nhỏ nhất (tỉ lệ 1) là `unitName`, giá của nó là `price`. */
export function toProducts(rows: readonly CatalogRow[]): PosProduct[] {
  const out = new Map<string, PosProduct>();
  for (const r of rows) {
    let p = out.get(r.sku);
    if (!p) {
      const variant = r.variant_code ?? 'normal';
      p = {
        id: r.item_id ?? r.sku, sku: r.sku, name: r.name, unitName: r.base_unit ?? '', price: 0,
        // Thuế suất chỉ khi mặt hàng có mã thuế đầu ra đang dùng; null = chưa khai (máy chặn TAX_NOT_DECLARED).
        taxRate: r.tax_code && r.tax_rate !== null ? Number(r.tax_rate) : null,
        groupCode: r.group_code ?? '', barcode: r.barcode ?? '', itemId: r.item_id, parentItemId: r.parent_item_id,
        variant, sendTax: r.send_to_tax !== false && variant !== 'internal', units: [],
      };
      out.set(r.sku, p);
    }
    if (r.unit) p.units.push({ unit: r.unit, ratio: num(r.ratio) ?? 1, price: num(r.price), isDefault: r.is_default_unit === true });
  }
  for (const p of out.values()) {
    p.units.sort((a, b) => a.ratio - b.ratio);
    const base = p.units.find((u) => u.ratio === 1) ?? p.units[0];
    if (base) {
      if (!p.unitName) p.unitName = base.unit;
      p.price = base.ratio === 1 ? base.price ?? 0 : 0;
    }
  }
  return [...out.values()];
}

/** Phiên bản danh mục: đổi khi số dòng hoặc lần sửa gần nhất (mặt hàng / ô giá) đổi. */
export function catalogVersion(count: number, lastUpdated: Date | string | null): string {
  const t = lastUpdated ? new Date(lastUpdated).getTime() : 0;
  return `${count}-${t}`;
}
