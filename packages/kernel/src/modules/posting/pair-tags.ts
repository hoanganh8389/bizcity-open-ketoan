// @bizcity-layer K kernel/posting
// [2026-11-15 Nguyễn Văn Thủy] Nhãn cặp Nợ / Có (thay rule-table.ts): bỏ bảng quy tắc định khoản có điều kiện, chỉ giữ nhãn để tách cặp và xem trước (đóng góp)
/**
 * NHÃN CẶP NỢ / CÓ — luật định khoản (rules/*.rule.ts) gắn vào từng cặp để:
 *   - không gộp hai cặp khác bản chất (hàng bán / hàng tặng, khác chương trình, khác chiều chuyển kho) dù cùng tài khoản;
 *   - màn Quy tắc hạch toán giải thích được cặp đó sinh từ đâu.
 * Nhãn KHÔNG ghi vào sổ, không vào dấu vân tay bút toán: `stripPairTags` bỏ trước khi ghi.
 * Tài khoản của cặp do bộ định khoản tra (AccountResolver) — không còn bảng quy tắc nào đè lên.
 */
import type { DraftLine } from '../ledger/ledger.types.js';

export type RulePart = 'goods' | 'tax' | 'cogs' | 'payment';

export interface RuleTags {
  biz: string;
  reason?: string | null;
  gift?: boolean;
  program?: string | null;
  method?: string | null;
  leg?: 'in' | 'out';
  sameUnit?: boolean;
  /** Số tiền âm nên luật đã đổi bên Nợ / Có của cặp. */
  swapped?: boolean;
  /** Phía Nợ / Có là TK kho lấy theo loại kho. */
  whDebit?: boolean;
  whCredit?: boolean;
}

/** Bỏ nhãn cặp trước khi ghi sổ. */
export function stripPairTags(lines: DraftLine[]): DraftLine[] {
  return lines.map(({ ruleTags: _drop, ...rest }) => rest);
}
