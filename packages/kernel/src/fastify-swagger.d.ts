// @bizcity-layer K kernel/public
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — gói Kernel typecheck riêng: nạp kiểu tags / summary của schema route (FastifySchema) do @fastify/swagger bổ sung
/** Chỉ kiểu (không chạy): route Kernel khai `schema: { tags, summary }` cho OpenAPI; ứng dụng nạp @fastify/swagger thật ở app.ts. */
import '@fastify/swagger';
