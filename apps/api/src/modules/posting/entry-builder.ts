/**
 * Công cụ dựng bút toán: thêm từng cặp Nợ/Có. Mỗi cặp ghi theo TỪNG MẶT HÀNG (mang mã hàng),
 * nên hoá đơn 5 dòng hàng ra 5 cặp tiền hàng + 5 cặp thuế + 5 cặp giá vốn, đúng thói quen
 * đọc sổ của kế toán. Chỉ gộp các cặp trùng hoàn toàn (cùng phần, tài khoản, đối tượng,
 * loại thuế VÀ mặt hàng — ví dụ hai dòng cùng một mã hàng). Cặp gắn mặt hàng ghi cả khi bằng 0.
 */
import { fromCents, toCents, type LinePart } from '@ketoan/contracts';
import type { DraftLine } from '../ledger/ledger.types.js';

interface PairInput {
  part: LinePart;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  /** Đối tượng gắn vào phía Nợ / phía Có (chỉ gắn phía tài khoản công nợ). */
  debitPartnerId?: string | null;
  creditPartnerId?: string | null;
  taxCode?: string | null;
  /** Mã hàng của cặp (dòng hàng); để trống với cặp thu/chi tiền. */
  productSku?: string | null;
  description?: string;
  /**
   * Cặp giá vốn CHỜ TÍNH GIÁ: giữ cả khi số tiền 0 (dòng mang costFill + sourceLineKey = costKey) để tính giá vốn
   * cuối tháng ghi đè số tiền. costKey: 'cost:out' | 'cost:in' (chiều hàng), thêm ':gift' với hàng khuyến mãi.
   */
  costKey?: string;
}

interface PairAcc extends PairInput {
  cents: number;
}

export class EntryBuilder {
  private readonly pairs = new Map<string, PairAcc>();

  /**
   * Thêm một cặp. Số âm thì tự đổi bên.
   * Số 0: cặp GẮN MẶT HÀNG vẫn ghi (hàng khuyến mãi tiền hàng 0, thuế 0% / không chịu thuế, giá vốn chờ tính) để sổ
   * nhật ký có đủ dấu vết từng dòng hàng (người dùng chốt 20/10/2026, migration 0060); cặp không mặt hàng (thu chi tiền) bỏ qua.
   */
  add(p: PairInput): this {
    let cents = toCents(p.amount);
    if (cents === 0 && !p.costKey && !p.productSku) return this;
    let pair = p;
    if (cents < 0) {
      cents = -cents;
      pair = {
        ...p,
        debitAccount: p.creditAccount,
        creditAccount: p.debitAccount,
        debitPartnerId: p.creditPartnerId,
        creditPartnerId: p.debitPartnerId,
      };
    }
    const key = [pair.part, pair.debitAccount, pair.creditAccount, pair.debitPartnerId ?? '', pair.creditPartnerId ?? '', pair.taxCode ?? '', pair.productSku ?? '', pair.costKey ?? ''].join('|');
    const cur = this.pairs.get(key);
    if (cur) cur.cents += cents;
    else this.pairs.set(key, { ...pair, cents });
    return this;
  }

  /** Xuất danh sách dòng: mỗi cặp thành 1 dòng Nợ + 1 dòng Có cùng pairNo. */
  toLines(): DraftLine[] {
    const lines: DraftLine[] = [];
    let pairNo = 0;
    for (const p of this.pairs.values()) {
      pairNo += 1;
      const amount = fromCents(p.cents);
      lines.push({
        accountCode: p.debitAccount,
        debit: amount,
        credit: 0,
        pairNo,
        part: p.part,
        partnerId: p.debitPartnerId ?? null,
        taxCode: p.taxCode ?? null,
        productSku: p.productSku ?? null,
        description: p.description ?? '',
        ...(p.costKey ? { costFill: 'debit' as const, sourceLineKey: p.costKey } : {}),
      });
      lines.push({
        accountCode: p.creditAccount,
        debit: 0,
        credit: amount,
        pairNo,
        part: p.part,
        partnerId: p.creditPartnerId ?? null,
        taxCode: p.taxCode ?? null,
        productSku: p.productSku ?? null,
        description: p.description ?? '',
        ...(p.costKey ? { costFill: 'credit' as const, sourceLineKey: p.costKey } : {}),
      });
    }
    return lines;
  }
}
