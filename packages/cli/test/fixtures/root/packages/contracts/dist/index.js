// Bản dựng GIẢ của @ketoan/contracts cho test CLI: chỉ đủ hình dạng các export mà packages/cli/lib dùng. Không phải luật thật.
export const ingestDocumentSchema = {
  safeParse(x) {
    const issues = [];
    if (!x || typeof x !== 'object') issues.push({ code: 'invalid_type', path: [], message: 'Expected object' });
    else {
      if (!x.docType) issues.push({ code: 'invalid_type', path: ['docType'], message: 'Required' });
      if (!x.docKey) issues.push({ code: 'invalid_type', path: ['docKey'], message: 'Required' });
      if (!Array.isArray(x.lines)) issues.push({ code: 'invalid_type', path: ['lines'], message: 'Required' });
    }
    return issues.length ? { success: false, error: { issues } } : { success: true, data: x };
  },
};

const CAT = {
  'IN-SUM-001': { severity: 'block', layer: 'L2', title: 'Tổng các dòng khác tổng chứng từ', why: 'Sổ ghi theo dòng, hoá đơn in theo tổng', fix: 'Tính lại tổng bằng cộng các dòng', ref: 'R-EVENT-5' },
};

export function intakeFinding(code, path, extra = {}) {
  const s = CAT[code];
  return { code, severity: s.severity, stage: 'door', layer: s.layer, title: s.title, path, ...extra, why: s.why, fix: s.fix, ref: s.ref };
}

export function explainFinding(code) {
  const s = CAT[code];
  return s ? { code, gate: 'B', level: s.severity, step: s.layer, title: s.title, why: s.why, fix: s.fix, rule: s.ref, learn: `docs/huong-dan/loi-dau-vao/${code}.md`, status: 'approved', source: 'bizcity_intake_findings' } : undefined;
}

export const INTAKE_REMEDIES = {
  'IN-SUM-001': {
    steps: [{ text: 'Tính lại tổng ở hệ thống nguồn' }, { text: 'Gửi lại chứng từ', role: 'creator' }],
    owner: 'creator', verify: { code: 'IN-SUM-001' },
    forbid: ['Không sửa riêng tổng cho khớp'],
  },
};

export const ERROR_CATALOG = {
  PERIOD_LOCKED: { http: 409, category: 'ledger', retryable: false, owner: 'kernel', message: 'Kỳ kế toán đã khoá', hint: 'Nhờ kế toán trưởng mở kỳ' },
  RATE_LIMITED: { http: 429, category: 'platform', retryable: true, owner: 'platform', message: 'Gọi quá nhiều lần', hint: 'Chờ Retry-After' },
};
export const ERROR_REASONS = { LEDGER_APPEND_ONLY: 'Trigger chặn sửa / xoá sổ cái' };
export const MCP_ERROR_CATALOG = {};

// Mười loại chứng từ của bizcity_ledger_intake@1 (chép từ packages/contracts APPROVABLE_DOC_TYPES, chỉ để test CLI).
export const APPROVABLE_DOC_TYPES = ["sale", "sale_return", "purchase", "purchase_return", "transfer", "stock_adjustment", "cash_transfer", "customer_payment", "supplier_payment", "manual_journal"];
