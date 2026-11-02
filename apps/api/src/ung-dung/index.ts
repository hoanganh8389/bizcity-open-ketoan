// @bizcity-layer P apps/api
// [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14 (ADR-0011 mức 2): danh sách app ngoài tiến trình cài vào bản này (manifest kind "app", không có mã chạy)
/**
 * APP NGOÀI TIẾN TRÌNH cài vào bản này (ADR-0011 mức 2). App là dịch vụ riêng; ở đây chỉ có manifest của nó.
 *
 * Cài app: tạo `apps/api/src/ung-dung/<key>/bizcity.module.json` (kind "app", BIZCITY-MODULE §3a) rồi thêm `<key>` vào APP_KEYS,
 * dựng lại. Không quét thư mục, không nạp manifest từ ngoài mã nguồn (ADR-0011 D3: không drop-in). Sau khi dựng, chủ từng đơn
 * vị tự KẾT NỐI app ở Tiện ích → Ứng dụng (đồng ý phạm vi quyền + sự kiện), nhận khoá API và bí mật webhook.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AppManifest } from '@bizcity/platform/core/apps';

/** Khoá app đã cài (thứ tự = thứ tự hiện ở trang Ứng dụng). App mẫu tối thiểu: PR-5 (ADR-0011). */
export const APP_KEYS: readonly string[] = [];

function loadAppManifest(key: string): AppManifest {
  const file = fileURLToPath(new URL(`./${key}/bizcity.module.json`, import.meta.url));
  let m: AppManifest;
  try {
    m = JSON.parse(readFileSync(file, 'utf8')) as AppManifest;
  } catch (err) {
    throw new Error(`Không đọc được manifest app ${file}: ${(err as Error).message}`);
  }
  if (m.key !== key) throw new Error(`Manifest app ${file}: key "${m.key}" ≠ thư mục "${key}"`);
  return m;
}

export const APP_MANIFESTS: readonly AppManifest[] = APP_KEYS.map(loadAppManifest);
