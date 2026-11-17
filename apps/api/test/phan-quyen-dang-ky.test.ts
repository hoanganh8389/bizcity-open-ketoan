// [2026-11-17 02:25 PM khanhtd] NT-HT-003 — bộ kiểm đăng ký quyền (docs/standard/DANG-KY-QUYEN.md §6): màn / thao tác / lệnh gác khai đúng, quyền có trong manifest
/**
 * Mỗi màn phân hệ đăng ký bằng `dangKyManHinh` phải:
 *   - có thao tác `xem` (menu ẩn / hiện theo quyền này);
 *   - mỗi thao tác gác bằng quyền `<module>:<chức-năng>-<việc>` đã khai ở permissions[] của manifest phân hệ (không khai → quyền rơi về quyền
 *     Core của loại thao tác, lưới HT12 không hiện, phân quyền "chỉ màn này" không làm được);
 *   - mỗi lệnh gác (`lenh`) là route có thật (method + đường dẫn mẫu của Fastify).
 * Thêm màn / thêm nghiệp vụ Thêm – Sửa – Xoá mà quên khai → test này đỏ.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isKnownPermission, listModulePermissions } from '@bizcity/platform/core/auth';
import { buildApp } from '../src/app.js';
import { danhSachManHinh } from '../src/modules/access/man-hinh.js';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app?.close(); });

const TEN_QUYEN = /^([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/;

describe('Đăng ký quyền theo màn × thao tác', () => {
  it('có màn đã đăng ký', () => { expect(danhSachManHinh().length).toBeGreaterThan(10); });

  // Màn danh mục / hệ thống xem bằng catalog:read (không kéo theo từ documents:read) nên không đăng ký "xem" — xem man-hinh-he-thong.ts.
  const MIEN_XEM = new Set(['Danh mục', 'Hệ thống']);
  it('mỗi màn nghiệp vụ có thao tác "xem"; khoá màn dạng <module>.<màn>', () => {
    const loi = danhSachManHinh()
      .filter((m) => (!m.thaoTac.xem && !MIEN_XEM.has(m.nhom)) || !/^[a-z][a-z0-9-]*\.[a-z0-9.-]+$/.test(m.key))
      .map((m) => `${m.key} (${m.nhom})`);
    expect(loi, 'màn thiếu thao tác xem hoặc khoá sai dạng').toEqual([]);
  });

  it('mỗi quyền gác thao tác đã khai ở permissions[] của manifest, tiền tố = module của màn', () => {
    const daKhai = new Set(listModulePermissions().map((p) => p.key));
    const loi: string[] = [];
    for (const m of danhSachManHinh()) {
      const mod = m.key.split('.')[0]!;
      for (const [tt, t] of Object.entries(m.thaoTac)) {
        const x = TEN_QUYEN.exec(t.quyen);
        if (!x) loi.push(`${m.key}.${tt}: "${t.quyen}" sai dạng <module>:<việc>`);
        else if (x[1] !== mod) loi.push(`${m.key}.${tt}: "${t.quyen}" không cùng module ${mod}`);
        else if (!daKhai.has(t.quyen) || !isKnownPermission(t.quyen)) loi.push(`${m.key}.${tt}: "${t.quyen}" chưa khai ở manifest ${mod}`);
      }
    }
    expect(loi).toEqual([]);
  });

  it('mỗi lệnh gác là route có thật', () => {
    const loi: string[] = [];
    for (const m of danhSachManHinh()) {
      for (const [tt, t] of Object.entries(m.thaoTac)) {
        for (const l of t.lenh ?? []) if (!app.hasRoute({ method: l.method, url: l.url })) loi.push(`${m.key}.${tt}: ${l.method} ${l.url}`);
      }
    }
    expect(loi).toEqual([]);
  });
});
