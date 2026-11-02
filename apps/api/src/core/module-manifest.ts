// @bizcity-layer P module-sdk
// [2026-11-01 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — nạp bizcity.module.json của phân hệ / add-in lúc khởi động (PHASES 3.2): khớp key, label, kind, version với khai báo trong mã
/**
 * MANIFEST MODULE (bizcity_module@1, docs/contracts/BIZCITY-MODULE-v1.md) — mỗi phân hệ / add-in có `bizcity.module.json` cạnh mã.
 *
 * Bộ kiểm (SC-CON-2, SC-MOD-3) kiểm manifest đúng schema và đúng chỗ. Ở đây kiểm lúc chạy: manifest khớp với phần đăng ký trong mã
 * (ApiModule / defineAddIn) — lệch là bản cài hỏng, dừng khởi động thay vì chạy với khai báo sai. Chưa có runtime đọc quyền,
 * bảng, sự kiện từ manifest (PHASES 3.13, ADR-0011): manifest hiện là nguồn mô tả cho GET /api/v1/system/modules?detail=true.
 *
 * Bản dựng: scripts/chep-tep-khai-bao.mjs chép `bizcity.module.json` sang dist cạnh index.js.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface ModuleManifest {
  contract: 'bizcity_module@1';
  id: string;
  key: string;
  kind: 'module' | 'addin';
  version: string;
  label: string;
  description: string;
  owners: string[];
  standard: string;
  requires: { capabilities: string[]; modules?: Record<string, string> };
  actions?: string[];
  /** Quyền mới module khai (`<key>:<việc>`); app.ts đăng ký vào registry quyền (PHASES 3.3). */
  permissions?: { key: string; label: string; roles?: string[]; risk?: 'low' | 'high' }[];
  ledger?: { submits?: { docType: string; contract: string }[] };
  ui?: { icon?: string; color?: string; order?: number };
  waivers?: { rule: string; reason: string; adr: string; expires?: string }[];
  [field: string]: unknown;
}

/** Phần trả cho giao diện / người tích hợp: không gồm waivers, owners (thông tin quản trị mã nguồn). */
export type ModuleSummary = Pick<ModuleManifest, 'id' | 'key' | 'kind' | 'version' | 'label' | 'description' | 'requires' | 'ui'> & {
  actions: string[];
  submits: string[];
};

/**
 * Đọc manifest cạnh mã và khớp với khai báo trong mã. `expect.label` / `expect.version` bỏ trống thì không so.
 * Ném lỗi (dừng khởi động) khi thiếu tệp, sai contract, hoặc lệch.
 */
export function loadModuleManifest(url: URL, expect: { key: string; kind: 'module' | 'addin'; label?: string; version?: string }): ModuleManifest {
  const file = fileURLToPath(url);
  let m: ModuleManifest;
  try {
    m = JSON.parse(readFileSync(file, 'utf8')) as ModuleManifest;
  } catch (err) {
    throw new Error(`Không đọc được manifest ${file}: ${(err as Error).message} (bản dựng: npm run build -w @ketoan/api chép bizcity.module.json)`);
  }
  const bad: string[] = [];
  if (m.contract !== 'bizcity_module@1') bad.push(`contract "${m.contract}"`);
  if (m.key !== expect.key) bad.push(`key "${m.key}" ≠ "${expect.key}"`);
  if (m.kind !== expect.kind) bad.push(`kind "${m.kind}" ≠ "${expect.kind}"`);
  if (expect.label !== undefined && m.label !== expect.label) bad.push(`label "${m.label}" ≠ "${expect.label}"`);
  if (expect.version !== undefined && m.version !== expect.version) bad.push(`version "${m.version}" ≠ "${expect.version}"`);
  if (!Array.isArray(m.requires?.capabilities)) bad.push('thiếu requires.capabilities');
  if (bad.length) throw new Error(`Manifest ${file} lệch khai báo trong mã: ${bad.join('; ')}`);
  return m;
}

export function summarize(m: ModuleManifest): ModuleSummary {
  return {
    id: m.id, key: m.key, kind: m.kind, version: m.version, label: m.label, description: m.description, requires: m.requires,
    ...(m.ui ? { ui: m.ui } : {}),
    actions: m.actions ?? [],
    submits: (m.ledger?.submits ?? []).map((s) => s.docType),
  };
}
