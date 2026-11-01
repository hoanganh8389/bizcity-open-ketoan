// @bizcity-layer P module-sdk
// [2026-11-02 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — kiểu manifest tối thiểu cho defineModule (bizcity_module@1; schema đầy đủ ở docs/contracts/BIZCITY-MODULE-v1.schema.json)
/** Phần manifest `bizcity.module.json` mà SDK đọc. Các trường khác giữ nguyên (bộ kiểm SC-CON-2 kiểm theo schema đầy đủ). */
export interface ModuleManifestLike {
  contract: string;
  id: string;
  key: string;
  kind: string;
  version: string;
  label: string;
  requires: { capabilities: string[] };
  actions?: string[];
  waivers?: { rule: string; reason?: string; adr?: string; expires?: string }[];
  [field: string]: unknown;
}
