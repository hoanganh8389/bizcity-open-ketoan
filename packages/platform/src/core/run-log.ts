// @bizcity-layer P core
// [2026-11-18 Nguyễn Văn Thủy] Nhật ký vận hành dạng JSONL — không tạo bảng cho lịch sử / lượt chạy (đóng góp)
/**
 * Nhật ký vận hành chung: TỆP JSONL, không bảng.
 *   <DATA_DIR>/nhat-ky/<luồng>/<đơn vị>/<yyyy-mm>.jsonl — mỗi dòng { id, at, tenantId, data }, chỉ ghi thêm.
 *
 * Dùng cho thứ "đã xảy ra, để xem lại": lượt tự chẩn đoán, lượt Kiểm chuẩn, số đếm lượt dùng thư viện… KHÔNG dùng cho thứ phải
 * nằm cùng giao dịch với dữ liệu (bút toán, chống gửi trùng, hàng đợi sự kiện, bằng chứng có chuỗi băm) — ghi tệp không huỷ
 * ngược được khi giao dịch lỗi. Luật: lịch sử / lượt chạy mới thì ghi ở đây, không tạo bảng (xem CHANGELOG 0161).
 *
 *   appendRunLog(luồng, đơn vị, data)          ghi một dòng, trả { id, at } — id là chuỗi số tăng dần (dùng làm khoá trên URL)
 *   readRunLog(luồng, { tenantId?, since? })   đọc cũ → mới; bỏ tenantId = mọi đơn vị (số đo); dòng hỏng bỏ qua
 *   pruneRunLog(luồng, giữ n tháng)            xoá tệp tháng cũ (hạn giữ)
 * Một tiến trình ghi lần lượt (hàng đợi) nên các dòng không chen nhau.
 */
import { appendFile, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

export interface RunLogEntry<T = Record<string, unknown>> { id: string; at: string; tenantId: string; data: T }

const STREAM_RE = /^[a-z][a-z0-9-]{0,40}$/;
const root = () => path.resolve(process.env.DATA_DIR ?? './data', 'nhat-ky');
const safe = (s: string) => String(s).replace(/[^0-9a-zA-Z_-]/g, '');
function streamDir(stream: string): string {
  if (!STREAM_RE.test(stream)) throw new Error(`run-log: tên luồng "${stream}" không hợp lệ`);
  return path.join(root(), stream);
}

let seq = 0;
let lastMs = 0;
/** id tăng dần theo thời gian: <ms><3 số thứ tự><2 số ngẫu nhiên> — so chuỗi cùng độ dài = so thứ tự. */
function nextId(ms: number): string {
  if (ms === lastMs) seq += 1; else { lastMs = ms; seq = 0; }
  return `${ms}${String(seq % 1000).padStart(3, '0')}${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`;
}

let queue: Promise<unknown> = Promise.resolve();

export function appendRunLog<T>(stream: string, tenantId: string, data: T, at?: Date): Promise<RunLogEntry<T>> {
  const dir = path.join(streamDir(stream), safe(tenantId) || '_');
  const run = queue.then(async () => {
    const now = at ?? new Date();
    const entry: RunLogEntry<T> = { id: nextId(now.getTime()), at: now.toISOString(), tenantId: String(tenantId), data };
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, `${entry.at.slice(0, 7)}.jsonl`), `${JSON.stringify(entry)}\n`, 'utf8');
    return entry;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Đọc cũ → mới. `since` (Date) bỏ tệp tháng trước tháng đó và dòng trước mốc đó. */
export async function readRunLog<T = Record<string, unknown>>(stream: string, opts: { tenantId?: string; since?: Date } = {}): Promise<RunLogEntry<T>[]> {
  await queue; // dòng vừa ghi trong tiến trình này phải đọc được ngay
  const base = streamDir(stream);
  let tenants: string[];
  if (opts.tenantId !== undefined) tenants = [safe(opts.tenantId) || '_'];
  else { try { tenants = await readdir(base); } catch { return []; } }
  const sinceMonth = opts.since?.toISOString().slice(0, 7);
  const sinceIso = opts.since?.toISOString();
  const out: RunLogEntry<T>[] = [];
  for (const t of tenants) {
    let files: string[];
    try { files = (await readdir(path.join(base, t))).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)); } catch { continue; }
    for (const f of files) {
      if (sinceMonth && f.slice(0, 7) < sinceMonth) continue;
      for (const line of (await readFile(path.join(base, t, f), 'utf8')).split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line) as RunLogEntry<T>;
          if (!sinceIso || e.at >= sinceIso) out.push(e);
        } catch { /* dòng hỏng */ }
      }
    }
  }
  return out.sort((a, b) => (a.id.length - b.id.length) || a.id.localeCompare(b.id));
}

/** Xoá tệp tháng cũ hơn `keepMonths` tháng (tính cả tháng hiện tại) ở mọi đơn vị của luồng. */
export async function pruneRunLog(stream: string, keepMonths: number): Promise<void> {
  const base = streamDir(stream);
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - (keepMonths - 1));
  const oldest = d.toISOString().slice(0, 7);
  let tenants: string[];
  try { tenants = await readdir(base); } catch { return; }
  for (const t of tenants) {
    let files: string[];
    try { files = await readdir(path.join(base, t)); } catch { continue; }
    for (const f of files) if (/^\d{4}-\d{2}\.jsonl$/.test(f) && f.slice(0, 7) < oldest) await rm(path.join(base, t, f), { force: true });
  }
}
