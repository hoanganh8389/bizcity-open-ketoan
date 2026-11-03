// [2026-11-03 05:40 PM Johnny Chu - Chu Hoàng Anh] G3-01 — cổng chờ: nghiệp vụ đã giữ chỗ nhưng Kernel chưa mở (sản xuất / MRP)
/**
 * CỔNG CHỜ (quyết định chủ dự án 2026-11-03: "chứng từ sản xuất cho MRP để sẵn cổng, nhưng không dev").
 * Tên docType dưới đây là ĐỀ XUẤT của cổng, CHƯA thuộc hợp đồng bizcity_ledger_intake@1: Kernel chưa có gói định khoản,
 * chưa có luật giá thành. CLI nhận ra chúng để trả lời rõ "cổng chưa mở, làm thế này" thay vì một lỗi khuôn khó hiểu,
 * và để không ai lách bằng loại chứng từ khác. Người mở cổng: đọc skills/contribute-production-module/SKILL.md.
 */
export const RESERVED_GATES = {
  production: {
    title: 'Sản xuất / MRP',
    docTypes: ['production_issue', 'production_receipt', 'production_cost_close'],
    status: 'reserved',
    skill: 'skills/contribute-production-module/SKILL.md',
    today: 'Mua nguyên vật liệu gửi purchase, bán thành phẩm gửi sale. Xuất NVL cho sản xuất, nhập kho thành phẩm, tính giá thành: chưa có — kế toán ghi tay trên màn, app giữ lệnh sản xuất ở phía mình.',
    forbid: 'Không lách bằng stock_adjustment hay manual_journal do app sinh: Kernel ghi vào tài khoản thừa / thiếu chờ xử lý và giá vốn thành phẩm thành 0.',
  },
};

/** docType thuộc một cổng chờ → cổng đó, ngược lại null. */
export function gateOf(docType) {
  for (const [id, g] of Object.entries(RESERVED_GATES)) if (g.docTypes.includes(docType)) return { id, ...g };
  return null;
}
