// @bizcity-layer P bizcity.config
// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032, docs/contracts/BIZCITY-LIBRARY-v1.md): kiểu của thư viện dùng chung bizcity_library@1 — phong bì, mục, giá trị theo ngày, luật khai báo, kết quả kiểm có gợi ý
/**
 * THƯ VIỆN DÙNG CHUNG (bizcity_library@1). Dữ liệu tham chiếu chung mọi đơn vị, phát hành theo repo (`libraries/<id>/library.json`),
 * đơn vị chỉ đọc. Không sinh bút toán, không tạo danh mục, không cấp quyền (D-LIB-8).
 */

export type LibraryKind = 'param' | 'calendar' | 'code-list' | 'permission-template' | 'business-map' | 'rule-set' | 'report-list' | 'import-template' | 'master-sample';
export type ItemStatus = 'active' | 'deprecated' | 'removed';
export type FindingLevel = 'block' | 'warn' | 'info';

export interface Basis { ref: string; key?: string; article?: { dieu: string; khoan?: string; diem?: string }; verified: boolean }
export interface Hint { kind: 'how' | 'why' | 'example' | 'warning'; text: string; link?: string }
export interface Effective { from: string; to: string | null; value: unknown; basis?: Basis[]; note?: string }

export interface LibraryItem {
  code: string;
  name: string;
  aliases?: string[];
  group?: string;
  status: ItemStatus;
  since: string;
  replacedBy?: string;
  verified: boolean;
  confidence?: 'cao' | 'vua' | 'thap';
  effective?: Effective[];
  payload?: Record<string, unknown>;
  hints?: Hint[];
  basis?: Basis[];
}

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: string; op: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'missing' | 'matches'; value?: unknown };

export interface LibraryRule {
  code: string;
  level: FindingLevel;
  title: string;
  why: string;
  fix?: string;
  when: Condition;
  suggest?: { value: unknown } | { field: string } | { fromLibrary: string; filter?: Record<string, unknown> };
  basis?: Basis[];
}

export interface Selector {
  value: string;
  label: string;
  search: string[];
  group?: string;
  filters?: { field: string; label: string }[];
  sort?: string[];
  showValueAt?: boolean;
}

export interface Library {
  contract: 'bizcity_library@1';
  id: string;
  kind: LibraryKind;
  title: string;
  description: string;
  version: string;
  released: string;
  contentHash: string;
  owner: string;
  sources: { title: string; kind: 'law' | 'internal' | 'reference' | 'generated'; date?: string; license?: string; note?: string }[];
  generatedBy?: string;
  codePrefix?: string;
  itemSchema: JsonSchema;
  selector: Selector;
  rules?: LibraryRule[];
  changelog: { version: string; date: string; hash: string; notes: string }[];
  items: LibraryItem[];
}

/** Tập con JSON Schema (hợp đồng §4.2). */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
  const?: unknown;
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  description?: string;
  title?: string;
}

export interface Suggestion { value: unknown; label: string; why: string; confidence: 'cao' | 'vua' | 'thap' }

/** Một phát hiện cụ thể (khuôn của bizcity_findings@1 + gợi ý). */
export interface LibraryFinding {
  code: string;
  level: FindingLevel;
  path: string;
  message: string;
  got?: unknown;
  expected?: unknown;
  suggestions: Suggestion[];
}

/** Ô nhập: một mã, hoặc { code?, value?, fields?, … } — các trường khác đi vào `input.*` cho luật khai báo. */
export type LibraryInput = string | ({ code?: string; value?: unknown; fields?: Record<string, unknown> } & Record<string, unknown>);

export interface ValidateResult {
  ok: boolean;
  library: { id: string; version: string; hash: string };
  at: string;
  /** Mã chuẩn khi nhập bằng bí danh. */
  resolved?: string;
  /** Giá trị thư viện tại ngày (mục có effective[]). */
  value?: unknown;
  findings: LibraryFinding[];
}

/** Một dòng ô chọn (hợp đồng §9 / §10). */
export interface SelectorRow {
  value: unknown;
  label: string;
  group?: string;
  hint?: string;
  deprecated: boolean;
  verified: boolean;
  valueAt?: unknown;
  item: LibraryItem;
}
