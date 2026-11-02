// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-13 / 14: bizcity_catalog_hint@1 — danh mục luật nhắc · hướng dẫn · cảnh báo mềm · chặn cho form danh mục (D023-6..8)
/**
 * Khung "Vì sao" của form danh mục (PHASE-023 · 20-VALIDATOR-MEM): mỗi luật có mã, mức, câu "vì sao" nói bằng hậu quả nghiệp vụ,
 * cách sửa, mã luật gốc và thẻ "học thêm". Nguồn duy nhất cho máy chủ (`/api/v1/<danh mục>/validate`, `meta.findings` khi lưu)
 * và giao diện (khung Vì sao, hộp ghi lý do).
 *
 * Mức:
 *   info  — nhắc: ô vừa chọn có hệ quả không hiển nhiên; không phải làm gì
 *   guide — hướng dẫn: giải thích bản chất, có link học thêm
 *   warn  — cảnh báo mềm: hợp lệ về kỹ thuật nhưng thường sai về kế toán; lưu được nhưng PHẢI ghi lý do (≥ 5 ký tự, D023-6);
 *           người lưu tự chịu trách nhiệm vì đã được cảnh báo (D023-7)
 *   block — chặn: chỉ toàn vẹn dữ liệu / bất biến; không lưu được
 * Cảnh báo mềm không bao giờ thành chặn bằng cấu hình; chặn không hạ thành mềm. Hạ warn → info cho một đơn vị chỉ qua duyệt
 * tại đơn vị có bằng chứng (D023-8, S023-17 — chưa có).
 *
 * Nội dung `why` của luật kế toán: trạng thái `draft` tới khi kế toán trưởng duyệt (D023-4); giao diện ghi nhãn "nháp".
 */

export type CatalogHintLevel = 'info' | 'guide' | 'warn' | 'block';
export type CatalogEntity = 'account' | 'partner';

export interface CatalogHintDef {
  id: string;
  entity: CatalogEntity;
  level: CatalogHintLevel;
  /** Câu ngắn hiện ngay (≤ 1 câu). Có thể chứa {biến}. */
  title: string;
  /** Vì sao — hậu quả nghiệp vụ trước, cách sửa sau; ≤ 3 câu. Có thể chứa {biến}. */
  why: string;
  /** Mã luật gốc (R-*, ADR-*) — SC-CON-5 kiểm mã R-* có thật. */
  rule?: string;
  /** Thẻ học thêm: số tài khoản (thẻ tài khoản, PHASE-023) hoặc mã màn. */
  learn?: string;
  status: 'draft' | 'approved';
}

/** Một phát hiện cho một bản khai báo cụ thể (đã thay biến). */
export interface CatalogFinding {
  code: string;
  level: CatalogHintLevel;
  title: string;
  why: string;
  rule?: string;
  learn?: string;
  /** Sửa một chạm: các trường và giá trị đề xuất (giao diện điền vào form). */
  fix?: { label: string; set: Record<string, unknown> };
  /** Ô liên quan — giao diện đặt khung Vì sao cạnh nhóm ô này. */
  field?: string;
  draft?: boolean;
}

/** Ghi nhận khi lưu bản khai báo còn cảnh báo mềm (D023-6): bắt buộc lý do. */
export interface CatalogWarnAck {
  reason: string;
  /** Mã các cảnh báo người dùng đã thấy khi bấm Ghi. */
  codes: string[];
}
export const WARN_ACK_MIN_REASON = 5;

export const CATALOG_HINTS: Record<string, CatalogHintDef> = {
  // ── Tài khoản (ACC1) ────────────────────────────────────────────────────────────────────────────────
  'ACC-HINT-001': {
    id: 'ACC-HINT-001', entity: 'account', level: 'info', status: 'draft', rule: 'R-MD-8', learn: '{parent}',
    title: 'Kế thừa từ {parent}: {inherited}.',
    why: 'Tài khoản con dùng cùng bản chất với tài khoản cha; khi thêm con, {parent} thành tài khoản tổng hợp và không ghi sổ trực tiếp được nữa.',
  },
  'ACC-HINT-002': {
    id: 'ACC-HINT-002', entity: 'account', level: 'guide', status: 'draft', rule: 'R-MD-8', learn: '131',
    title: 'Lưỡng tính nghĩa là gì?',
    why: 'Mỗi đối tượng có thể đang nợ mình (dư Nợ) hoặc đã trả trước (dư Có) — hai sự thật khác nhau, sổ giữ riêng từng đối tượng, không bù trừ. Báo cáo lên hai chỉ tiêu khác nhau (vd 131: dư Nợ → Phải thu khách hàng, dư Có → Người mua trả tiền trước).',
  },
  'ACC-HINT-003': {
    id: 'ACC-HINT-003', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-8', learn: '{root}',
    title: 'Tài khoản {code} sẽ không vào sổ phụ công nợ.',
    why: 'Nhóm {root} là phải thu / phải trả, nhưng tài khoản này không lưỡng tính, không theo dõi đối tượng, không "Là công nợ" — sổ phụ công nợ chỉ lấy tài khoản có một trong ba cờ đó. Không có tuổi nợ, không đối trừ hoá đơn, không đối chiếu công nợ; với nhóm này gần như luôn sai.',
  },
  'ACC-HINT-004': {
    id: 'ACC-HINT-004', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-8', learn: '{root}',
    title: 'Bên số dư "{side}" khác bản chất thường gặp của tài khoản nhóm {root} ({expected}).',
    why: 'Số dư sẽ lên sai bên trên Bảng cân đối và kiểm ACCOUNT_WRONG_SIDE báo mỗi đêm. Chỉ khác khi đây là tài khoản điều chỉnh giảm (vd hao mòn, dự phòng) — khi đó ghi rõ lý do.',
  },
  'ACC-HINT-005': {
    id: 'ACC-HINT-005', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-8', learn: '{root}',
    title: 'Tài khoản {code} chưa tích "Theo dõi đối tượng".',
    why: 'Tài khoản nhóm {root} ghi nghĩa vụ với một người cụ thể (khách, nhà cung cấp, nhân viên, đơn vị nội bộ). Không theo dõi đối tượng thì không biết ai nợ ai, sổ chi tiết công nợ và đối chiếu không làm được.',
  },
  'ACC-HINT-006': {
    id: 'ACC-HINT-006', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-4', learn: '{code}',
    title: 'Tài khoản {code} còn số dư {balance} — ngừng sử dụng sẽ để số dư treo.',
    why: 'Ngừng dùng không xoá số dư: số dư vẫn lên báo cáo nhưng không ghi tiếp để tất toán được. Thường nên chuyển số dư sang tài khoản thay thế bằng một phiếu kế toán trước, rồi mới ngừng.',
  },
  'ACC-HINT-007': {
    id: 'ACC-HINT-007', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-7',
    title: 'Tài khoản cấp 1 {code} không có trong hệ thống tài khoản chuẩn.',
    why: 'Tài khoản cấp 1 do chế độ kế toán quy định; tự thêm tài khoản cấp 1 làm báo cáo tài chính không có chỉ tiêu cho nó. Thường nên thêm làm tài khoản con của một tài khoản chuẩn.',
  },
  'ACC-BLOCK-001': {
    id: 'ACC-BLOCK-001', entity: 'account', level: 'block', status: 'approved', rule: 'R-MD-8',
    title: 'Số tài khoản con phải bắt đầu bằng số tài khoản cha ({parent}).',
    why: 'Cây hệ thống tài khoản dựa vào tiền tố số hiệu để cộng dồn lên tài khoản cha và lên báo cáo; sai tiền tố làm số liệu cộng sai chỗ.',
  },
  // ── Đối tượng (DM03) ───────────────────────────────────────────────────────────────────────────────
  'PART-HINT-001': {
    id: 'PART-HINT-001', entity: 'partner', level: 'info', status: 'draft',
    title: 'Nhà cung cấp: hoá đơn đầu vào cần mã số thuế người bán.',
    why: 'Hoá đơn đầu vào kê khai khấu trừ thuế GTGT phải có MST người bán khớp hoá đơn điện tử; thiếu MST thì hoá đơn bị kiểm cảnh báo khi nhập.',
  },
  'PART-HINT-002': {
    id: 'PART-HINT-002', entity: 'partner', level: 'warn', status: 'draft',
    title: 'Nhà cung cấp {code} chưa có mã số thuế.',
    why: 'Lưu được với nhà cung cấp cá nhân / hộ kinh doanh không có MST, nhưng mọi hoá đơn đầu vào của đối tượng này sẽ bị cảnh báo khi kê khai và không đối chiếu được với hoá đơn điện tử của cơ quan thuế.',
  },
  'PART-HINT-003': {
    id: 'PART-HINT-003', entity: 'partner', level: 'warn', status: 'draft', rule: 'R-MD-3',
    title: 'Đã có đối tượng {other} cùng tên "{name}".',
    why: 'Hai mã cho cùng một khách / nhà cung cấp làm công nợ tách đôi: hoá đơn ghi một mã, phiếu thu ghi mã kia, đối chiếu không khớp. Nếu là một, dùng mã {other}; nếu khác người, phân biệt bằng tên viết tắt hoặc địa chỉ.',
  },
  'PART-HINT-004': {
    id: 'PART-HINT-004', entity: 'partner', level: 'warn', status: 'draft',
    title: 'Mã số thuế "{taxCode}" không đúng định dạng (10 số, hoặc 10 số - 3 số chi nhánh).',
    why: 'MST sai định dạng không tra được với cơ quan thuế; hoá đơn điện tử mang MST đúng sẽ không khớp với đối tượng này.',
  },
};

/** Phát hiện từ một luật, thay biến {x} trong title / why / learn. */
export function catalogFinding(code: string, vars: Record<string, string | number> = {}, extra: Partial<CatalogFinding> = {}): CatalogFinding {
  const def = CATALOG_HINTS[code];
  if (!def) throw new Error(`Luật nhắc ${code} chưa khai trong CATALOG_HINTS`);
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
  return {
    code, level: def.level, title: fill(def.title), why: fill(def.why),
    ...(def.rule ? { rule: def.rule } : {}), ...(def.learn ? { learn: fill(def.learn) } : {}),
    ...(def.status === 'draft' ? { draft: true } : {}), ...extra,
  };
}

/** Mã các cảnh báo mềm trong danh sách phát hiện (cần ghi lý do khi lưu). */
export function warnCodes(findings: readonly CatalogFinding[]): string[] {
  return findings.filter((f) => f.level === 'warn').map((f) => f.code);
}
