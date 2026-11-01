// @bizcity-layer P observability
// Danh sách thuộc tính mẫu cho SC-OBS-2 (xem ../../../../../expect.json). Tệp này được import @opentelemetry/* — KHÔNG tính.
import { trace } from '@opentelemetry/api';

export const TRACE_ATTRIBUTES: ReadonlySet<string> = new Set([
  'bizcity.module', 'bizcity.step',
]);

export const withSpan = (_name: string, _opts: unknown, fn: () => unknown) => (trace ? fn() : undefined);
