// @bizcity-layer D modules/mua-hang
/**
 * Nhật ký mua hàng — TỆP JSONL, không dùng bảng: <DATA_DIR>/mua-hang/<tenantId>/<yyyy-mm>.jsonl, mỗi dòng một sự kiện
 * { ts, event, docNo, user, data }. Chỉ ghi thêm (append); đọc lại theo tháng. Duyệt ngoại lệ ghi thêm audit_logs.
 */
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number) as [number, number]; const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

export interface LogRow { ts: string; event: string; docNo: string; user: string; data: Record<string, unknown> }

const dirOf = (tenantId: string) => path.resolve(process.env.DATA_DIR ?? './data', 'mua-hang', String(tenantId).replace(/[^0-9a-zA-Z_-]/g, ''));

let queue: Promise<unknown> = Promise.resolve();
/** Ghi lần lượt (một tiến trình API) để các dòng không chen nhau. */
export function logEvents(tenantId: string, rows: Omit<LogRow, 'ts'>[]): Promise<void> {
  if (!rows.length) return Promise.resolve();
  const run = queue.then(async () => {
    const ts = new Date().toISOString();
    const dir = dirOf(tenantId);
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, `${ts.slice(0, 7)}.jsonl`), rows.map((r) => JSON.stringify({ ts, ...r })).join('\n') + '\n', 'utf8');
  });
  queue = run.catch(() => undefined);
  return run as Promise<void>;
}

/** Ngày (giờ Việt Nam, UTC+7) của thời điểm ghi — lọc theo ngày như người dùng thấy trên màn. */
const vnDay = (ts: string) => new Date(Date.parse(ts) + 7 * 3_600_000).toISOString().slice(0, 10);

/** Đọc nhật ký (mới nhất trước); from / to là ngày YYYY-MM-DD (hoặc cả tháng YYYY-MM), tính theo giờ Việt Nam. Dòng hỏng bỏ qua. */
export async function readLog(tenantId: string, f: { from?: string; to?: string; event?: string } = {}): Promise<LogRow[]> {
  const dir = dirOf(tenantId);
  let files: string[] = [];
  try { files = (await readdir(dir)).filter((x) => /^\d{4}-\d{2}\.jsonl$/.test(x)); } catch { return []; }
  // Tháng YYYY-MM → từ ngày đầu tháng / đến ngày cuối tháng.
  const from = f.from && /^\d{4}-\d{2}$/.test(f.from) ? `${f.from}-01` : f.from;
  const to = f.to && /^\d{4}-\d{2}$/.test(f.to) ? `${f.to}-31` : f.to;
  const rows: LogRow[] = [];
  for (const file of files.sort()) {
    const month = file.slice(0, 7);
    // Tệp theo tháng UTC: dòng đầu tháng giờ Việt Nam có thể nằm ở tệp tháng trước → đọc rộng thêm một tháng mỗi phía.
    if ((from && month < shiftMonth(from.slice(0, 7), -1)) || (to && month > to.slice(0, 7))) continue;
    for (const line of (await readFile(path.join(dir, file), 'utf8')).split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as LogRow;
        const day = vnDay(r.ts);
        if ((!f.event || r.event === f.event) && (!from || day >= from) && (!to || day <= to)) rows.push(r);
      } catch { /* dòng hỏng */ }
    }
  }
  return rows.sort((a, b) => b.ts.localeCompare(a.ts));
}
