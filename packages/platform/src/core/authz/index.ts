// @bizcity-layer P permissions
// [2026-11-06 00:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W3 đợt 1: cửa vào của bộ tính quyền thuần (không CSDL); phần đọc CSDL thêm sau khi W1 (user_role_assignments) merge
export { authorize, batchAuthorize, checkConditions, explain, matchPattern, ORG_PATH_SEP, scopeContains, scopeOf, widen } from './engine.js';
export type { AuthorizeInput, AuthzExplained, AuthzPrincipal, AuthzTraceStep } from './engine.js';
export { buildCatalog, codePermissions, CORE_PERMISSION_META, diffCatalog, meaningHash } from './catalog.js';
export type { CatalogDiff, CatalogEntry, SeenRow } from './catalog.js';
export { legacyAssignment, systemRole, systemRoles, SYSTEM_ROLE_PREFIX, SYSTEM_ROLES } from './legacy.js';
