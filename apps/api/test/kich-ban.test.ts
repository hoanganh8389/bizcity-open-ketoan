// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: ca T019-5 — mỗi kịch bản TH-01…TH-14 mở đúng màn, bộ lọc điền sẵn được màn đích đọc lại đúng.
/**
 * Kịch bản của Bàn điều tra (PHASE-019 W4, ca T019-5). Web không có bộ chạy test riêng nên phần thuần nằm ở @ketoan/contracts
 * (ban-dieu-tra.ts) — màn Kịch bản dùng đúng các hàm ở đây. Kiểm:
 *   - Sổ tay (docs/ops/SO-TAY-DIEU-TRA-LOI.md) tách đủ TH-01…TH-14, mỗi TH có tên + triệu chứng hoặc thân;
 *   - mọi TH của Sổ tay có kịch bản và ngược lại (thêm TH mới mà quên kịch bản → đỏ);
 *   - mọi link trỏ tới màn có route thật (apps/web/src/phan-he/dev/routes.tsx) và mục menu;
 *   - bộ lọc điền sẵn: đọc lại bằng devParams của màn đích ra đúng từng giá trị (không tham số nào bị bỏ lặng lẽ);
 *   - devParams bỏ giá trị sai khuôn / chèn (về mặc định), devLink từ chối tham số lạ.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEV_PATHS, KICH_BAN, devLink, devParams, nhatKyFilter, tachSoTay } from '@ketoan/contracts';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const soTay = tachSoTay(readFileSync(root('docs/ops/SO-TAY-DIEU-TRA-LOI.md'), 'utf8'));
const routes = readFileSync(root('apps/web/src/phan-he/dev/routes.tsx'), 'utf8');
const menu = readFileSync(root('apps/web/src/phan-he/dev/menu.ts'), 'utf8');

describe('Kịch bản — PHASE-019 W4 (T019-5)', () => {
  it('Sổ tay tách đủ TH-01…TH-14; tình huống nào cũng có kịch bản và ngược lại', () => {
    expect(soTay.map((x) => x.id)).toEqual(Array.from({ length: 14 }, (_, i) => `TH-${String(i + 1).padStart(2, '0')}`));
    for (const x of soTay) {
      expect(x.title, x.id).not.toBe('');
      expect(x.body.length, x.id).toBeGreaterThan(40);
      // Thân dừng trước mục cấp 2 kế tiếp.
      expect(x.body, x.id).not.toContain('## 3. Luật an toàn');
    }
    expect(soTay.find((x) => x.id === 'TH-04')!.symptom).toContain('kỳ đã khoá');
    expect(Object.keys(KICH_BAN).sort()).toEqual(soTay.map((x) => x.id));
  });

  it('mọi màn /dev/… có route và mục menu', () => {
    for (const p of DEV_PATHS) {
      expect(routes, p).toContain(`path="${p.slice(1)}"`);
      expect(menu, p).toContain(`path: '${p}'`);
    }
  });

  it('mỗi kịch bản mở đúng màn, bộ lọc điền sẵn được màn đích đọc lại đúng từng giá trị', () => {
    let links = 0;
    for (const [id, kb] of Object.entries(KICH_BAN)) {
      expect(kb.links.length, id).toBeGreaterThan(0);
      for (const l of kb.links) {
        links++;
        const href = devLink(l.path, l.filter);
        const [path, query = ''] = href.split('?');
        expect(path, `${id} ${l.label}`).toBe(l.path);
        const read = devParams(l.path, new URLSearchParams(query));
        for (const [k, v] of Object.entries(l.filter ?? {})) expect(read[k], `${id} ${l.label}: ${k}`).toBe(v);
        // Ô lọc Nhật ký điền sẵn phải thành đúng một bộ lọc của API.
        if (l.path === '/dev/nhat-ky' && read.q) expect(nhatKyFilter(read.q), id).not.toBeNull();
      }
    }
    expect(links).toBeGreaterThanOrEqual(14);
    // Vài kịch bản tiêu biểu: link đúng như Sổ tay nói.
    expect(devLink(KICH_BAN['TH-06']!.links[0]!.path, KICH_BAN['TH-06']!.links[0]!.filter)).toBe('/dev/su-kien?xem=chet');
    expect(devLink(KICH_BAN['TH-05']!.links[1]!.path, KICH_BAN['TH-05']!.links[1]!.filter)).toBe('/dev/toan-ven?kiem=EVENT_PENDING_AGE');
    expect(devLink(KICH_BAN['TH-07']!.links[0]!.path, KICH_BAN['TH-07']!.links[0]!.filter)).toBe('/dev/nhat-ky?window=24h&q=IDEMPOTENCY_CONFLICT');
    // Giá trị bằng mặc định không lên địa chỉ.
    expect(devLink('/dev/loi-theo-module', { window: '24h', outcome: 'error' })).toBe('/dev/loi-theo-module');
  });

  it('devParams bỏ giá trị sai khuôn / chèn về mặc định; devLink từ chối tham số lạ', () => {
    const p = devParams('/dev/loi-theo-module', new URLSearchParams('window=30d&outcome=ok" || true&khac=1'));
    expect(p).toEqual({ window: '24h', outcome: 'error' });
    expect(devParams('/dev/nhat-ky', new URLSearchParams('q=") | json&traceId=xyz&level=debug'))).toEqual({ window: '1h' });
    expect(devParams('/dev/toan-ven', new URLSearchParams('kiem=event_dead'))).toEqual({});
    expect(() => devLink('/dev/ghi-so', { xem: 'xoa' })).toThrow();
    expect(() => devLink('/dev/su-kien', { consumer: 'x' })).toThrow();
  });
});
