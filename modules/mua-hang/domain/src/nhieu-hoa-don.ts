// [2026-11-21 Nguyễn Văn Thủy] PHIẾU NHẬP NHIỀU HOÁ ĐƠN: SL theo hoá đơn (cộng dồn) để đối soát 3 bên, chia dòng theo từng hoá đơn khi ghi sổ (đóng góp)
/**
 * Một phiếu nhập có thể có nhiều hoá đơn NCC (NCC tách hoá đơn, hoá đơn điều chỉnh). Hai việc:
 *   1. `invoiceQtyBySku`: SL từng mã trên các hoá đơn của phiếu, cộng dồn, quy về ĐVT nhỏ nhất — để so với SL thực nhận.
 *   2. `splitLinesByInvoice`: lúc ghi sổ, lõi chỉ nhận một hoá đơn cho một chứng từ kế toán → chia các dòng phiếu theo SL từng mã
 *      trên từng hoá đơn (theo thứ tự hoá đơn); phần không nằm trên hoá đơn nào → phần "không hoá đơn".
 * Dòng hoá đơn lấy từ MH22 (đã nhận diện mã). Không đoán khi hoá đơn chưa nhận diện mã — bên gọi phải chặn.
 */
import type { PLine } from './engine.js';
import { ratioIn, type UnitMap } from './dat-hang.js';
import { skuInfo } from './ma-hang.js';

/** Dòng hoá đơn đã nhận diện mã (MH22). */
export interface InvoiceLineQty { sku: string; unit: string; qty: number }
export interface InvoiceQty { key: string; lines: InvoiceLineQty[] }

const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** Mã hoá đơn khớp mã dòng phiếu: đúng mã, hoặc cùng mã hàng thường (đuôi biến thể). */
const sameSku = (a: string, b: string) => a === b || skuInfo(a).base === skuInfo(b).base;

/** SL theo hoá đơn của từng mã (ĐVT nhỏ nhất), cộng dồn mọi hoá đơn. */
export function invoiceQtyBySku(invoices: InvoiceQty[], units?: UnitMap): Map<string, number> {
  const m = new Map<string, number>();
  for (const inv of invoices) for (const l of inv.lines) if (l.sku) m.set(l.sku, r4((m.get(l.sku) ?? 0) + l.qty * (ratioIn(units, l.sku, l.unit) || 1)));
  return m;
}

/** SL theo hoá đơn cho một dòng phiếu (quy về ĐVT của dòng); undefined = chưa có hoá đơn nào nhận diện mã. */
export function invoiceQtyOfLine(line: Pick<PLine, 'sku' | 'unit'>, bySku: Map<string, number>, units?: UnitMap): number | undefined {
  if (!bySku.size) return undefined;
  let base = 0;
  for (const [sku, q] of bySku) if (sameSku(sku, line.sku)) base += q;
  return r4(base / (ratioIn(units, line.sku, line.unit) || 1));
}

export interface SplitPart { key: string | null; lines: { lineKey: string; qty: number; frac: number }[] }

/**
 * Chia các dòng phiếu theo từng hoá đơn. Mỗi hoá đơn "tiêu" SL từng mã của nó, dòng hàng mua trước rồi tới dòng tặng.
 * frac = phần SL của dòng thuộc phần đó (0..1) — bên ghi sổ chia tiền / thuế / chiết khấu theo frac, phần cuối nhận phần làm tròn.
 * key null = phần không hoá đơn.
 */
export function splitLinesByInvoice(lines: Pick<PLine, 'lineKey' | 'sku' | 'unit' | 'qty' | 'lineType'>[], invoices: InvoiceQty[], units?: UnitMap): SplitPart[] {
  const left = invoices.map((inv) => {
    const m = new Map<string, number>();
    for (const l of inv.lines) if (l.sku) m.set(l.sku, (m.get(l.sku) ?? 0) + l.qty * (ratioIn(units, l.sku, l.unit) || 1));
    return { key: inv.key, m };
  });
  const parts: SplitPart[] = left.map((x) => ({ key: x.key, lines: [] }));
  const rest: SplitPart = { key: null, lines: [] };
  const order = [...lines.filter((l) => l.lineType === 'buy'), ...lines.filter((l) => l.lineType !== 'buy')];
  for (const l of order) {
    if (!l.sku || !(l.qty > 0)) { rest.lines.push({ lineKey: l.lineKey, qty: l.qty, frac: 1 }); continue; }
    const ratio = ratioIn(units, l.sku, l.unit) || 1;
    let need = l.qty * ratio;
    left.forEach((inv, i) => {
      if (need <= 1e-9) return;
      for (const [sku, avail] of inv.m) {
        if (need <= 1e-9 || avail <= 1e-9 || !sameSku(sku, l.sku)) continue;
        const take = Math.min(need, avail);
        inv.m.set(sku, avail - take); need -= take;
        parts[i]!.lines.push({ lineKey: l.lineKey, qty: r4(take / ratio), frac: take / (l.qty * ratio) });
      }
    });
    if (need > 1e-9) rest.lines.push({ lineKey: l.lineKey, qty: r4(need / ratio), frac: need / (l.qty * ratio) });
  }
  return [...parts, rest].filter((p) => p.lines.length);
}
