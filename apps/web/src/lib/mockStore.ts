/**
 * Kho DỮ LIỆU GIẢ ở trình duyệt (localStorage) cho màn hình làm trước khi có API thật.
 *
 *   const store = createMockStore<Phieu>('phieu-ban', seed);
 *   await store.list({ page: 1, pageSize: 50 }, (r) => r.docDate >= from);
 *   await store.create({...}); await store.update(id, {...}); await store.remove(id);
 *
 * - Lần đầu nạp từ seed (tệp JSON mẫu của màn); sau đó thêm / sửa / xoá lưu lại theo máy (mỗi người một bản).
 * - Có độ trễ giả (150–350 ms) để màn hình chạy giống gọi mạng thật (hiện "Đang tải", nút chờ…).
 * - reset() trả về dữ liệu mẫu ban đầu (màn API → Nguồn dữ liệu màn hình).
 * Khi có API thật: màn hình đổi sang gọi API (xem lib/tradeDocs.ts), không phải sửa màn.
 */

export interface MockRow { id: string }
export interface MockPage<T> { data: T[]; meta: { total: number; page: number; pageSize: number } }

const PREFIX = 'ketoan.mock.';
const delay = () => new Promise((r) => setTimeout(r, 150 + Math.random() * 200));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function createMockStore<T extends MockRow>(name: string, seed: T[]) {
  const key = PREFIX + name;
  const read = (): T[] => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T[];
    } catch { /* bỏ qua: chế độ riêng tư / dữ liệu hỏng → dùng mẫu */ }
    return clone(seed);
  };
  const write = (rows: T[]) => { try { localStorage.setItem(key, JSON.stringify(rows)); } catch { /* bỏ qua */ } };
  const newId = () => `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    name,
    async list(q: { page?: number; pageSize?: number } = {}, filter?: (r: T) => boolean, sort?: (a: T, b: T) => number): Promise<MockPage<T>> {
      await delay();
      let rows = read();
      if (filter) rows = rows.filter(filter);
      if (sort) rows = rows.slice().sort(sort);
      const page = q.page ?? 1;
      const pageSize = q.pageSize ?? 1_000_000;
      return { data: clone(rows.slice((page - 1) * pageSize, page * pageSize)), meta: { total: rows.length, page, pageSize } };
    },
    async get(id: string): Promise<T> {
      await delay();
      const r = read().find((x) => x.id === id);
      if (!r) throw new Error(`Không tìm thấy bản ghi ${id} (dữ liệu giả)`);
      return clone(r);
    },
    async create(row: Omit<T, 'id'>): Promise<T> {
      await delay();
      const rows = read();
      const saved = { ...clone(row), id: newId() } as T;
      write([saved, ...rows]);
      return clone(saved);
    },
    async update(id: string, patch: Partial<T>): Promise<T> {
      await delay();
      const rows = read();
      const i = rows.findIndex((x) => x.id === id);
      if (i < 0) throw new Error(`Không tìm thấy bản ghi ${id} (dữ liệu giả)`);
      rows[i] = { ...rows[i]!, ...clone(patch), id };
      write(rows);
      return clone(rows[i]!);
    },
    async remove(id: string): Promise<void> {
      await delay();
      write(read().filter((x) => x.id !== id));
    },
    /** Trả về dữ liệu mẫu ban đầu. */
    reset() { try { localStorage.removeItem(key); } catch { /* bỏ qua */ } },
    /** Số bản ghi hiện có (không trễ) — màn Nguồn dữ liệu hiện. */
    count() { return read().length; },
  };
}

export type MockStore<T extends MockRow> = ReturnType<typeof createMockStore<T>>;
