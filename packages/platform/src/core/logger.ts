// @bizcity-layer P observability
// [2026-11-21 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B1 (S038-3, S038-4, S038-11): nhật ký lỗi cố định logs/ — tách dòng ≥ LOG_FILE_LEVEL ra tệp xoay vòng, lỗi khởi động / tiến trình ghi đồng bộ, version + commit trong mọi dòng
/**
 * Nhật ký lỗi cố định của bản cài (PHASE-038, docs/phases/PHASE-038-NHAT-KY-LOI-CO-DINH/10-NGHIEN-CUU-GHI-LOG.md §7).
 *
 *   - stdout giữ nguyên là đường chính (Docker → Loki khi bật bộ giám sát), mức LOG_LEVEL.
 *   - LOG_DIR đặt (Docker: /app/logs, gắn ra <thư mục cài>/logs) → dòng mức ≥ LOG_FILE_LEVEL (mặc định warn) chép thêm vào
 *     <LOG_DIR>/api-loi.log, xoay vòng theo dung lượng (20 MB × 5 bản = 100 MB, phần của API trong trần 200 MB — D038-2).
 *   - Lỗi khởi động và lỗi tiến trình (uncaughtException / unhandledRejection) ghi ĐỒNG BỘ trước khi thoát (R-LOG-3): luồng
 *     bất đồng bộ có thể chưa kịp ghi khi process.exit chạy.
 *
 * Tệp này KHÔNG đọc config/env.ts: lỗi cấu hình môi trường (ENV_INVALID) cũng phải ghi được, mà env.ts dừng tiến trình ngay khi nạp.
 * Ghi tệp hỏng (thư mục không ghi được, đĩa đầy) không bao giờ làm hỏng yêu cầu: báo một lần ra stderr rồi bỏ qua tệp.
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { BUILD_VERSION } from './version.js';

/** Số mức của pino (OBSERVABILITY §2; OpenTelemetry SeverityNumber ở 10 §5.1). */
export const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } as const;
export type LevelName = keyof typeof LEVELS;

const MB = 1024 * 1024;

/** Lý do khởi động thất bại (`reason` của evt bizcity.system.start_failed, 10 §7.2). */
export type StartFailReason = 'MIGRATION_PENDING' | 'DB_UNREACHABLE' | 'DB_AUTH_FAILED' | 'ENV_INVALID' | 'PORT_IN_USE' | 'UNKNOWN';

const START_HINTS: Record<StartFailReason, string> = {
  MIGRATION_PENDING: 'Chạy job db-migrate (docker compose up db-migrate) rồi xem logs/db-migrate.log',
  DB_UNREACHABLE: 'Kiểm container db đang chạy và DATABASE_URL (docker compose ps db)',
  DB_AUTH_FAILED: 'Kiểm DB_APP_PASSWORD trong .env khớp mật khẩu job db-migrate đã đặt cho ketoan_app; chạy lại db-migrate',
  ENV_INVALID: 'Sửa biến trong .env theo dòng báo lỗi phía trên rồi dựng lại (docker compose up -d)',
  PORT_IN_USE: 'Cổng API đang bị tiến trình khác dùng: đổi PORT hoặc dừng tiến trình đó',
  UNKNOWN: 'Gửi tệp logs/api-loi.log cho người hỗ trợ',
};

/** Trường chung của mọi dòng (R-LOG-5): biết lỗi thuộc dịch vụ nào, bản nào. */
export function baseFields(service: string): { service: string; version: string; commit: string | null } {
  const sha = (process.env.BIZCITY_GIT_SHA ?? '').trim();
  return { service, version: BUILD_VERSION.version, commit: /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 12).toLowerCase() : null };
}

/** Tệp ghi thêm, xoay vòng theo dung lượng: tên.log → tên.log.1 → … → tên.log.<keep-1>, bản cũ nhất bị xoá. */
export class RotatingFile {
  private size = -1;
  private broken = false;

  constructor(readonly file: string, readonly maxBytes = 20 * MB, readonly keep = 5) {}

  write(line: string): void {
    if (this.broken) return;
    try {
      if (this.size < 0) {
        mkdirSync(path.dirname(this.file), { recursive: true });
        this.size = existsSync(this.file) ? statSync(this.file).size : 0;
      }
      const bytes = Buffer.byteLength(line);
      if (this.size > 0 && this.size + bytes > this.maxBytes) this.rotate();
      appendFileSync(this.file, line);
      this.size += bytes;
    } catch (err) {
      // nuot-loi: hỏng ghi tệp không được làm hỏng yêu cầu / khởi động; stdout vẫn đủ. Báo một lần.
      this.broken = true;
      process.stderr.write(`[nhat-ky] không ghi được ${this.file}: ${(err as Error).message} — chỉ còn log stdout\n`);
    }
  }

  private rotate(): void {
    const oldest = `${this.file}.${this.keep - 1}`;
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let i = this.keep - 2; i >= 1; i--) {
      const from = `${this.file}.${i}`;
      if (existsSync(from)) renameSync(from, `${this.file}.${i + 1}`);
    }
    if (this.keep > 1) renameSync(this.file, `${this.file}.1`);
    else unlinkSync(this.file);
    this.size = 0;
  }
}

const levelOf = (name: string | undefined, fallback: LevelName): number => LEVELS[(name ?? '') as LevelName] ?? LEVELS[fallback];

/** Đường dẫn tệp trong LOG_DIR; LOG_DIR trống (dev, test) = không ghi tệp. */
export function logFilePath(name: string, dir = process.env.LOG_DIR): string | null {
  const d = (dir ?? '').trim();
  return d ? path.join(d, name) : null;
}

const files = new Map<string, RotatingFile>();
/** Một RotatingFile cho mỗi đường dẫn trong tiến trình (logger Fastify và ghi đồng bộ dùng chung bộ đếm dung lượng). */
export function rotatingFile(file: string, maxBytes?: number, keep?: number): RotatingFile {
  let f = files.get(file);
  if (!f) { f = new RotatingFile(file, maxBytes, keep); files.set(file, f); }
  return f;
}

const LEVEL_RE = /^\{"level":(\d+)/;

/**
 * Luồng ghi cho pino / Fastify: mọi dòng ra stdout (lọc theo mức của logger), dòng có mức ≥ fileLevel chép thêm vào tệp.
 * pino luôn đặt "level" đầu dòng JSON nên đọc mức bằng một biểu thức, không phải parse cả dòng.
 */
export function teeStream(opts: { file: RotatingFile | null; fileLevel: number; out?: { write(s: string): unknown } }) {
  const out = opts.out ?? process.stdout;
  return {
    write(line: string): void {
      out.write(line);
      if (!opts.file) return;
      const m = LEVEL_RE.exec(line);
      if (m && Number(m[1]) >= opts.fileLevel) opts.file.write(line);
    },
  };
}

/**
 * Cấu hình logger cho Fastify (apps/api/src/app.ts). Mức của logger = mức thấp hơn giữa stdout và tệp, để dòng warn vẫn tới tệp
 * khi LOG_LEVEL=error; stdout lọc lại theo LOG_LEVEL trong teeStream.
 */
export function loggerOptions(opts: { service: string; level: string; silent?: boolean; dir?: string; fileLevel?: string }) {
  if (opts.silent) return { level: 'silent' as const };
  const stdoutLevel = levelOf(opts.level, 'info');
  const fileLevel = levelOf(opts.fileLevel ?? process.env.LOG_FILE_LEVEL, 'warn');
  const p = logFilePath('api-loi.log', opts.dir);
  const file = p ? rotatingFile(p) : null;
  const min = file ? Math.min(stdoutLevel, fileLevel) : stdoutLevel;
  const name = (Object.keys(LEVELS) as LevelName[]).find((k) => LEVELS[k] === min) ?? 'info';
  const stdout = { write: (s: string) => { const m = LEVEL_RE.exec(s); if (!m || Number(m[1]) >= stdoutLevel) process.stdout.write(s); } };
  return {
    level: name,
    base: { pid: process.pid, ...baseFields(opts.service) },
    stream: teeStream({ file, fileLevel, out: stdout }),
  };
}

/** Lỗi thành trường `err` (R-LOG-1 bản tối thiểu cho B1; B1b thêm errFp). Giữ chuỗi cause tối đa 5 lớp. */
export function serializeError(err: unknown, depth = 0): Record<string, unknown> {
  if (!(err instanceof Error)) return { type: typeof err, message: String(err) };
  const e = err as Error & { code?: unknown; cause?: unknown };
  return {
    type: e.name || e.constructor?.name || 'Error',
    message: e.message,
    ...(typeof e.code === 'string' ? { code: e.code } : {}),
    stack: e.stack,
    ...(e.cause !== undefined && depth < 5 ? { cause: serializeError(e.cause, depth + 1) } : {}),
  };
}

/** Đoán lý do khởi động thất bại từ lỗi (mã PG / mã hệ thống / câu báo của main.ts). */
export function classifyStartError(err: unknown): StartFailReason {
  const e = err as { code?: unknown; message?: unknown; name?: unknown } | null;
  const code = typeof e?.code === 'string' ? e.code : '';
  const msg = typeof e?.message === 'string' ? e.message : String(err);
  if (/migration chưa áp/i.test(msg)) return 'MIGRATION_PENDING';
  if (code === '28P01' || code === '28000') return 'DB_AUTH_FAILED';
  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', '57P03', '3D000'].includes(code)) return 'DB_UNREACHABLE';
  if (code === 'EADDRINUSE') return 'PORT_IN_USE';
  if (e?.name === 'EnvError' || e?.name === 'ZodError' || /Cấu hình môi trường không hợp lệ/.test(msg)) return 'ENV_INVALID';
  return 'UNKNOWN';
}

/**
 * Ghi một dòng JSON khuôn pino ĐỒNG BỘ ra stderr và tệp (R-LOG-3) — dùng khi tiến trình sắp thoát, logger có thể chưa có.
 * `file` = tên tệp trong LOG_DIR (api-loi.log, db-migrate.log).
 */
export function writeSync(level: LevelName, fields: Record<string, unknown>, opts: { service: string; file?: string; dir?: string }): string {
  const line = `${JSON.stringify({ level: LEVELS[level], time: Date.now(), pid: process.pid, ...baseFields(opts.service), ...fields })}\n`;
  process.stderr.write(line);
  const p = logFilePath(opts.file ?? 'api-loi.log', opts.dir);
  if (p) rotatingFile(p).write(line);
  return line;
}

/** Dòng fatal "khởi động thất bại" (evt bizcity.system.start_failed, 10 §7.2). */
export function logStartFailure(err: unknown, opts: { service: string; file?: string; dir?: string }): StartFailReason {
  const reason = classifyStartError(err);
  writeSync('fatal', {
    evt: 'bizcity.system.start_failed',
    reason,
    msg: `Khởi động thất bại: ${err instanceof Error ? err.message : String(err)}`,
    hint: START_HINTS[reason],
    err: serializeError(err),
  }, opts);
  return reason;
}

let installed = false;
/**
 * Bắt lỗi ở mức tiến trình (R-LOG-3): ghi fatal đồng bộ rồi thoát mã 1 để Docker khởi động lại — không "nuốt rồi chạy tiếp"
 * (trạng thái sau lỗi không bắt là không biết được). Gọi một lần, sớm nhất có thể (main.ts, setup.ts).
 */
export function installProcessHandlers(opts: { service: string; file?: string; dir?: string; exit?: (code: number) => void }): void {
  if (installed) return;
  installed = true;
  const exit = opts.exit ?? ((c: number) => process.exit(c));
  const die = (kind: 'uncaughtException' | 'unhandledRejection') => (err: unknown) => {
    writeSync('fatal', { evt: `bizcity.system.${kind === 'uncaughtException' ? 'uncaught_exception' : 'unhandled_rejection'}`, msg: `Lỗi không bắt (${kind}) — tiến trình dừng`, err: serializeError(err) }, opts);
    exit(1);
  };
  process.on('uncaughtException', die('uncaughtException'));
  process.on('unhandledRejection', die('unhandledRejection'));
}
