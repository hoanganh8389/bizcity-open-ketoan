// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09: duyệt luật nhắc theo đơn vị (D023-4 / D023-8) — ví dụ minh hoạ từng luật, áp bản duyệt (sửa câu chữ, hạ warn → info)
// [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28: luật nhắc mặt hàng ITEM-* (thiếu ĐVT, thiếu nhóm hạch toán) — còn ✘ thì mặt hàng lưu NHÁP (ADR-0019)
// [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-27: thêm `fix` (cách sửa) cho mức warn / block — khuôn chung bizcity_findings@1
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
 * tại đơn vị có bằng chứng (D023-8): màn HT09 "Quy định dữ liệu danh mục", bảng catalog_rule_reviews, áp bằng applyRuleReview.
 *
 * Nội dung `why` của luật kế toán: trạng thái `draft` tới khi kế toán trưởng duyệt (D023-4); giao diện ghi nhãn "nháp". Kế toán
 * trưởng của từng đơn vị duyệt ở HT09: đồng ý (bỏ nhãn nháp), sửa câu chữ (chỉ dùng biến của luật gốc), hạ mức (chỉ warn → info).
 */

export type CatalogHintLevel = 'info' | 'guide' | 'warn' | 'block';
export type CatalogEntity = 'account' | 'partner' | 'item';

export interface CatalogHintDef {
  id: string;
  entity: CatalogEntity;
  level: CatalogHintLevel;
  /** Câu ngắn hiện ngay (≤ 1 câu). Có thể chứa {biến}. */
  title: string;
  /** Vì sao — hậu quả nghiệp vụ trước, cách sửa sau; ≤ 3 câu. Có thể chứa {biến}. */
  why: string;
  /** Cách sửa (≤ 2 câu). Bắt buộc với mức warn / block (SC-FIND-1, R-GATE-2). */
  fix?: string;
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
  /** Cách sửa bằng lời (bizcity_findings@1 `fix`) — có với mức warn / block. */
  howTo?: string;
  /** Sửa một chạm: các trường và giá trị đề xuất (giao diện điền vào form). */
  fix?: { label: string; set: Record<string, unknown> };
  /** Ô liên quan — giao diện đặt khung Vì sao cạnh nhóm ô này. */
  field?: string;
  draft?: boolean;
  /** Biến đã thay vào câu chữ — để áp câu chữ đơn vị sửa lại (applyRuleReview). */
  vars?: Record<string, string | number>;
  /** Cảnh báo mềm đã được kế toán trưởng của đơn vị hạ xuống nhắc (D023-8). */
  lowered?: boolean;
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
    fix: 'Tích "Theo dõi đối tượng" (hoặc đặt lưỡng tính nếu là phải thu / phải trả hai chiều); nếu cố ý, ghi lý do khi lưu.',
  },
  'ACC-HINT-004': {
    id: 'ACC-HINT-004', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-8', learn: '{root}',
    title: 'Bên số dư "{side}" khác bản chất thường gặp của tài khoản nhóm {root} ({expected}).',
    why: 'Số dư sẽ lên sai bên trên Bảng cân đối và kiểm ACCOUNT_WRONG_SIDE báo mỗi đêm. Chỉ khác khi đây là tài khoản điều chỉnh giảm (vd hao mòn, dự phòng) — khi đó ghi rõ lý do.',
    fix: 'Đặt lại bên số dư theo tài khoản cha; nếu là tài khoản điều chỉnh giảm, ghi lý do khi lưu.',
  },
  'ACC-HINT-005': {
    id: 'ACC-HINT-005', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-8', learn: '{root}',
    title: 'Tài khoản {code} chưa tích "Theo dõi đối tượng".',
    why: 'Tài khoản nhóm {root} ghi nghĩa vụ với một người cụ thể (khách, nhà cung cấp, nhân viên, đơn vị nội bộ). Không theo dõi đối tượng thì không biết ai nợ ai, sổ chi tiết công nợ và đối chiếu không làm được.',
    fix: 'Tích "Theo dõi đối tượng"; nếu cố ý, ghi lý do khi lưu.',
  },
  'ACC-HINT-006': {
    id: 'ACC-HINT-006', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-4', learn: '{code}',
    title: 'Tài khoản {code} còn số dư {balance} — ngừng sử dụng sẽ để số dư treo.',
    why: 'Ngừng dùng không xoá số dư: số dư vẫn lên báo cáo nhưng không ghi tiếp để tất toán được. Thường nên chuyển số dư sang tài khoản thay thế bằng một phiếu kế toán trước, rồi mới ngừng.',
    fix: 'Lập phiếu kế toán chuyển số dư sang tài khoản thay thế, rồi ngừng dùng; nếu cố ý giữ số dư treo, ghi lý do khi lưu.',
  },
  'ACC-HINT-007': {
    id: 'ACC-HINT-007', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-7',
    title: 'Tài khoản cấp 1 {code} không có trong hệ thống tài khoản chuẩn.',
    why: 'Tài khoản cấp 1 do chế độ kế toán quy định; tự thêm tài khoản cấp 1 làm báo cáo tài chính không có chỉ tiêu cho nó. Thường nên thêm làm tài khoản con của một tài khoản chuẩn.',
    fix: 'Thêm làm tài khoản con của một tài khoản chuẩn; nếu chế độ kế toán của đơn vị có tài khoản này, ghi lý do khi lưu.',
  },
  'ACC-BLOCK-001': {
    id: 'ACC-BLOCK-001', entity: 'account', level: 'block', status: 'approved', rule: 'R-MD-8',
    title: 'Số tài khoản con phải bắt đầu bằng số tài khoản cha ({parent}).',
    why: 'Cây hệ thống tài khoản dựa vào tiền tố số hiệu để cộng dồn lên tài khoản cha và lên báo cáo; sai tiền tố làm số liệu cộng sai chỗ.',
    fix: 'Đổi số tài khoản cho bắt đầu bằng số tài khoản cha, hoặc chọn đúng tài khoản cha.',
  },
  // ── Mặt hàng (DM, PHASE-024 S024-28): còn ✘ → lưu NHÁP, chưa dùng được trên chứng từ (Gate B giữ với IN-ITEM-009) ──
  'ITEM-BLOCK-001': {
    id: 'ITEM-BLOCK-001', entity: 'item', level: 'block', status: 'draft', rule: 'R-GATE-3',
    title: 'Mặt hàng {sku} chưa có đơn vị tính gốc.',
    why: 'Sổ kho đếm theo đơn vị tính gốc (đơn vị nhỏ nhất); không có thì không quy đổi được số lượng nhập / xuất, tồn kho và giá vốn sai.',
    fix: 'Nhập đơn vị tính gốc (vd hộp, cái, kg). Mặt hàng được lưu nháp tới khi có, rồi tự kích hoạt.',
  },
  'ITEM-BLOCK-002': {
    id: 'ITEM-BLOCK-002', entity: 'item', level: 'block', status: 'draft', rule: 'R-ITEM-4',
    title: 'Mặt hàng {sku} chưa có nhóm hạch toán và đơn vị chưa có nhóm mặc định.',
    why: 'Nhóm hạch toán quyết định tài khoản kho, giá vốn, doanh thu; không có nhóm thì không định khoản được chứng từ có mặt hàng này.',
    fix: 'Chọn nhóm hạch toán cho mặt hàng, hoặc khai một nhóm mặc định ở Cấu hình hạch toán.',
  },
  'ITEM-HINT-001': {
    id: 'ITEM-HINT-001', entity: 'item', level: 'warn', status: 'draft', rule: 'R-ITEM-8',
    title: 'Mặt hàng {sku} chưa gán nhóm hạch toán — sẽ ghi theo nhóm mặc định {group}.',
    why: 'Nhóm mặc định thường là hàng hoá (kho 156, giá vốn 632, doanh thu 511). Nếu đây là dịch vụ, nguyên vật liệu hay công cụ dụng cụ thì tồn kho, giá vốn và lãi gộp sẽ sai.',
    fix: 'Chọn nhóm hạch toán đúng loại; nếu đúng là hàng hoá theo nhóm mặc định, ghi lý do khi lưu.',
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
    fix: 'Nhập mã số thuế (nút tra MST điền sẵn tên, địa chỉ); hộ kinh doanh / cá nhân không có MST thì ghi lý do khi lưu.',
  },
  'PART-HINT-003': {
    id: 'PART-HINT-003', entity: 'partner', level: 'warn', status: 'draft', rule: 'R-MD-3',
    title: 'Đã có đối tượng {other} cùng tên "{name}".',
    why: 'Hai mã cho cùng một khách / nhà cung cấp làm công nợ tách đôi: hoá đơn ghi một mã, phiếu thu ghi mã kia, đối chiếu không khớp. Nếu là một, dùng mã {other}; nếu khác người, phân biệt bằng tên viết tắt hoặc địa chỉ.',
    fix: 'Mở đối tượng đã có và dùng mã đó; nếu là người khác, phân biệt bằng tên viết tắt hoặc địa chỉ rồi ghi lý do khi lưu.',
  },
  'PART-HINT-004': {
    id: 'PART-HINT-004', entity: 'partner', level: 'warn', status: 'draft',
    title: 'Mã số thuế "{taxCode}" không đúng định dạng (10 số, hoặc 10 số - 3 số chi nhánh).',
    why: 'MST sai định dạng không tra được với cơ quan thuế; hoá đơn điện tử mang MST đúng sẽ không khớp với đối tượng này.',
    fix: 'Sửa MST: 10 số, hoặc 10 số - 3 số cho đơn vị phụ thuộc, hoặc 12 số (cá nhân).',
  },
};

/** Phát hiện từ một luật, thay biến {x} trong title / why / learn. */
export function catalogFinding(code: string, vars: Record<string, string | number> = {}, extra: Partial<CatalogFinding> = {}): CatalogFinding {
  const def = CATALOG_HINTS[code];
  if (!def) throw new Error(`Luật nhắc ${code} chưa khai trong CATALOG_HINTS`);
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
  return {
    code, level: def.level, title: fill(def.title), why: fill(def.why),
    ...(def.fix ? { howTo: fill(def.fix) } : {}), ...(def.rule ? { rule: def.rule } : {}), ...(def.learn ? { learn: fill(def.learn) } : {}),
    ...(def.status === 'draft' ? { draft: true } : {}), ...(Object.keys(vars).length ? { vars } : {}), ...extra,
  };
}

/** Mã các cảnh báo mềm trong danh sách phát hiện (cần ghi lý do khi lưu). */
export function warnCodes(findings: readonly CatalogFinding[]): string[] {
  return findings.filter((f) => f.level === 'warn').map((f) => f.code);
}

// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09
/** Giá trị minh hoạ cho từng luật — màn duyệt hiện luật đúng như người dùng sẽ thấy trong form. */
export const CATALOG_HINT_EXAMPLES: Record<string, Record<string, string>> = {
  'ACC-HINT-001': { parent: '131', inherited: 'lưỡng tính, theo dõi đối tượng' },
  'ACC-HINT-003': { code: '13198', root: '131' },
  'ACC-HINT-004': { side: 'Có', root: '156', expected: 'Nợ' },
  'ACC-HINT-005': { code: '33110', root: '331' },
  'ACC-HINT-006': { code: '1388', balance: '12.500.000' },
  'ACC-HINT-007': { code: '990' },
  'ACC-BLOCK-001': { parent: '131' },
  'ITEM-BLOCK-001': { sku: 'SUA01' },
  'ITEM-BLOCK-002': { sku: 'SUA01' },
  'ITEM-HINT-001': { sku: 'SUA01', group: 'HH' },
  'PART-HINT-002': { code: 'NCC-AN' },
  'PART-HINT-003': { other: 'KH001', name: 'Công ty TNHH An Bình' },
  'PART-HINT-004': { taxCode: '01234' },
};

/** Biến {x} một luật dùng (title / why / fix / learn) — câu chữ đơn vị sửa lại chỉ được dùng các biến này. */
export function hintVars(code: string): string[] {
  const d = CATALOG_HINTS[code];
  if (!d) return [];
  return [...new Set([d.title, d.why, d.fix ?? '', d.learn ?? ''].flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)))];
}

/**
 * Dấu của một luật (mức + câu chữ mặc định) — bản duyệt của đơn vị gắn dấu này; luật đổi ở bản phát hành sau → dấu khác → bản duyệt
 * hết hiệu lực, luật về "chưa duyệt" (S023-17). Băm chuỗi đơn giản (chạy cả trên trình duyệt), không dùng cho bảo mật.
 */
export function hintHash(code: string): string {
  const d = CATALOG_HINTS[code];
  if (!d) return '';
  const text = JSON.stringify([d.level, d.title, d.why, d.fix ?? '']);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `h1:${(h >>> 0).toString(16)}`;
}

/** Bản duyệt của đơn vị cho một luật (catalog_rule_reviews). Có bản duyệt = đã duyệt (bỏ nhãn nháp). */
export interface CatalogRuleReview {
  code: string;
  title?: string | null;
  why?: string | null;
  fix?: string | null;
  lowered?: boolean;
}

/**
 * Áp bản duyệt của đơn vị lên một phát hiện: câu chữ sửa lại (thay lại biến), hạ warn → info (D023-8), bỏ nhãn nháp.
 * Mức chặn không bao giờ hạ; mức khác warn không đổi.
 */
export function applyRuleReview(f: CatalogFinding, r: CatalogRuleReview | undefined): CatalogFinding {
  if (!r) return f;
  const vars = f.vars ?? {};
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
  const { draft: _d, ...rest } = f;
  const lower = Boolean(r.lowered) && f.level === 'warn';
  return {
    ...rest,
    ...(r.title ? { title: fill(r.title) } : {}),
    ...(r.why ? { why: fill(r.why) } : {}),
    ...(r.fix ? { howTo: fill(r.fix) } : {}),
    ...(lower ? { level: 'info' as const, lowered: true } : {}),
  };
}
