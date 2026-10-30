// @bizcity-layer A+P adapters/cell
/**
 * Dữ liệu huấn luyện của Trợ lý — lưu bằng TỆP JSONL, không dùng bảng cơ sở dữ liệu:
 *   <DATA_DIR>/tro-ly/<tenantId>.jsonl   mỗi dòng một mục (câu hỏi / hướng dẫn) dạng JSON
 *   <DATA_DIR>/tro-ly/img/<tên ngẫu nhiên>.<đuôi>   ảnh chèn vào câu trả lời
 * DATA_DIR mặc định ./data (trong container: /app/apps/api/data, gắn ổ Docker riêng nên build lại không mất).
 * Ghi: dựng lại cả tệp vào tệp tạm rồi đổi tên (không hỏng tệp khi đang ghi dở); các lần ghi xếp hàng tuần tự.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface TrainingEntry {
  id: string;
  /** faq = câu hỏi - câu trả lời; guide = hướng dẫn thao tác. */
  kind: 'faq' | 'guide';
  question: string;
  /** Từ khoá thêm để bot nhận ra câu hỏi (cách gọi khác, viết tắt…). */
  keywords: string[];
  /** Câu trả lời dạng markdown; ảnh: ![mô tả](đường dẫn ảnh đã tải lên). */
  answer: string;
  /** Mã màn liên quan (ACC14, BH02…): bot hiện nút mở màn. */
  screens: string[];
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export const dataDir = () => path.resolve(process.env.DATA_DIR ?? './data', 'tro-ly');
export const imageDir = () => path.join(dataDir(), 'img');
const fileOf = (tenantId: string) => path.join(dataDir(), `${String(tenantId).replace(/[^0-9a-zA-Z_-]/g, '')}.jsonl`);

let queue: Promise<unknown> = Promise.resolve();
/** Các thao tác ghi chạy lần lượt (một tiến trình API). */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export async function readEntries(tenantId: string): Promise<TrainingEntry[]> {
  let text = '';
  try { text = await readFile(fileOf(tenantId), 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
  const out: TrainingEntry[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t) as TrainingEntry); } catch { /* dòng hỏng: bỏ qua, không làm hỏng cả tệp */ }
  }
  return out;
}

async function writeEntries(tenantId: string, list: TrainingEntry[]): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  const file = fileOf(tenantId);
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, list.map((x) => JSON.stringify(x)).join('\n') + (list.length ? '\n' : ''), 'utf8');
  await rename(tmp, file);
}

export type EntryInput = Pick<TrainingEntry, 'kind' | 'question' | 'keywords' | 'answer' | 'screens' | 'active'>;

export function saveEntry(tenantId: string, actor: string, input: EntryInput, id?: string): Promise<TrainingEntry> {
  return serial(async () => {
    const list = await readEntries(tenantId);
    const now = new Date().toISOString();
    const old = id ? list.find((x) => x.id === id) : undefined;
    if (id && !old) throw Object.assign(new Error('Không tìm thấy mục huấn luyện'), { notFound: true });
    const entry: TrainingEntry = old
      ? { ...old, ...input, updatedBy: actor, updatedAt: now }
      : { id: randomUUID(), ...input, createdBy: actor, createdAt: now, updatedBy: actor, updatedAt: now };
    await writeEntries(tenantId, old ? list.map((x) => (x.id === id ? entry : x)) : [...list, entry]);
    return entry;
  });
}

export function deleteEntry(tenantId: string, id: string): Promise<boolean> {
  return serial(async () => {
    const list = await readEntries(tenantId);
    const rest = list.filter((x) => x.id !== id);
    if (rest.length === list.length) return false;
    await writeEntries(tenantId, rest);
    return true;
  });
}

/** Nhập nhiều mục (từ tệp JSONL): mục trùng id thì ghi đè, còn lại thêm mới. */
export function importEntries(tenantId: string, actor: string, items: Partial<TrainingEntry>[]): Promise<{ added: number; updated: number }> {
  return serial(async () => {
    const list = await readEntries(tenantId);
    const byId = new Map(list.map((x) => [x.id, x]));
    const now = new Date().toISOString();
    let added = 0;
    let updated = 0;
    for (const it of items) {
      if (!it.question || !it.answer) continue;
      const base = {
        kind: it.kind === 'guide' ? 'guide' as const : 'faq' as const, question: String(it.question).slice(0, 500),
        keywords: Array.isArray(it.keywords) ? it.keywords.map(String).slice(0, 30) : [], answer: String(it.answer).slice(0, 20000),
        screens: Array.isArray(it.screens) ? it.screens.map(String).slice(0, 20) : [], active: it.active !== false,
      };
      const old = it.id ? byId.get(it.id) : undefined;
      if (old) { byId.set(old.id, { ...old, ...base, updatedBy: actor, updatedAt: now }); updated++; }
      else { const e = { id: it.id || randomUUID(), ...base, createdBy: actor, createdAt: now, updatedBy: actor, updatedAt: now }; byId.set(e.id, e); added++; }
    }
    await writeEntries(tenantId, [...byId.values()]);
    return { added, updated };
  });
}

const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Lưu ảnh từ data URL; trả tên tệp (ngẫu nhiên, khó đoán). */
export async function saveImage(dataUrl: string): Promise<string> {
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || !IMAGE_TYPES[m[1]!]) throw new Error('Ảnh phải là PNG, JPEG, WebP hoặc GIF');
  const buf = Buffer.from(m[2]!, 'base64');
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('Ảnh tối đa 3 MB');
  await mkdir(imageDir(), { recursive: true });
  const name = `${randomUUID().replace(/-/g, '')}.${IMAGE_TYPES[m[1]!]}`;
  await writeFile(path.join(imageDir(), name), buf);
  return name;
}

export const imageType = (name: string) => ({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as Record<string, string>)[name.split('.').pop() ?? ''] ?? 'application/octet-stream';
