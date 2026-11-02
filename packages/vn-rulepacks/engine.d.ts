// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — khai kiểu TypeScript cho bộ đánh giá thuần engine.mjs (Kernel import qua @bizcity/vn-rulepacks/engine).
export type CaseStatus = 'PASS' | 'FAIL' | 'ERROR' | 'NOT_APPLICABLE' | 'NOT_TESTED' | 'REVIEW_REQUIRED';
export type Layer = 'module' | 'configuration' | 'enterprise';

export interface Profile {
  accounting_regime: string;
  fiscal_year_start: string;
  entity_type: string;
  as_of: string;
  simulated?: boolean;
  scope?: string[];
}

export interface Rulepack {
  id: string;
  version: string;
  catalog_id: string;
  status: string;
  layer?: Layer;
  domain: string;
  regime: string;
  priority: 'P0' | 'P1';
  release?: { rules_hash: string | null };
  _cases: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export interface Kit {
  version: string | null;
  registry: { sources?: Array<Record<string, unknown>>; [k: string]: unknown };
  catalog: { items?: Array<Record<string, unknown>>; [k: string]: unknown };
  rulepacks: Rulepack[];
  diagCodes: Record<string, string>;
  sources: Map<string, Record<string, unknown>>;
}

export interface EvaluatedCase {
  id: string;
  version: string;
  priority: 'P0' | 'P1';
  rulepack: string;
  layer: Layer | null;
  status: CaseStatus;
  reason: string;
  technical: 'PASS' | 'FAIL' | 'ERROR' | 'NOT_TESTED';
  evidence: string[];
  legal_basis_ids: string[];
  // [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-20
  title: string | null;
  legal_basis: Array<{ source_id: string; label: string; provision_ref: string | null; review_status: string }>;
  approval: 'upstream' | 'local' | null;
  evaluated_at?: string;
}

// [2026-11-02 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0014
export interface LocalApproval { version: string; hash: string; accounting_reviewer: string; tax_reviewer: string | null; approved_at: string; approved_by?: string }
export type Approvals = Map<string, LocalApproval>;
export const TAX_DOMAINS: Set<string>;
export function packHash(pack: Rulepack): string;
export function localApproval(approvals: Approvals | null, pack: Rulepack): LocalApproval | null;
export interface ResolutionRow { pack: Rulepack; applies: boolean | null; reason: string | null; selected: boolean; blocked: string | null; local: LocalApproval | null }
// [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-19: Evaluation.layers, báo cáo có layer_results.
export interface Evaluation { fyStart: string; resolution: { fyStart: string; rows: ResolutionRow[] }; cases: EvaluatedCase[]; layers: Layer[] }

export interface Evidence { checks: Map<string, string>; tests?: Map<string, string>; runtime?: boolean }

export const PACKAGE_DIR: string;
export const REVIEW_VALID_DAYS: number;
export const DISCLAIMER: string;
export function loadKitFromDir(dir?: string): Kit;
export function makeKit(a: { version?: string | null; registry: Kit['registry']; catalog: Kit['catalog']; rulepacks: Rulepack[]; diagCodes?: Record<string, string> }): Kit;
export function today(): string;
export function addDays(d: string, n: number): string;
export function fiscalYearStart(mmdd: string, asOf: string): string;
export function applies(app: unknown, ctx: { profile: Profile; fyStart: string; domain: string; regime: string }): { applies: boolean | null; reason: string | null };
export function resolve(kit: Kit, profile: Profile, approvals?: Approvals | null): { fyStart: string; rows: ResolutionRow[] };
export function evidenceFromDiagnostics(results: Array<{ code: string; level: string }>, diagCodes: Record<string, string>): Map<string, string>;
export function evaluate(a: { kit: Kit; profile: Profile; evidence: Evidence; layers?: Layer[]; runtimeOnly?: boolean; buildOnlyLayers?: Layer[]; approvals?: Approvals | null }): Evaluation;
export function overall(cases: Array<{ priority: string; status: CaseStatus }>): 'PASS' | 'FAIL' | 'REVIEW_REQUIRED';
export function buildReport(a: {
  kit: Kit; profile: Profile; evaluation: Evaluation;
  run: { runId: string; at: string; gitSha: string; db?: string | null; runtime?: { os: string; node: string; postgres: string | null } };
  target: { kind: 'kernel' | 'plugin'; package: string; version: string };
  exclusions?: Array<{ scope: string; reason: string }>;
}): Record<string, unknown> & { result: 'PASS' | 'FAIL' | 'REVIEW_REQUIRED'; layer_results: Partial<Record<Layer, 'PASS' | 'FAIL' | 'REVIEW_REQUIRED'>>; label: string; cases: unknown[] };
