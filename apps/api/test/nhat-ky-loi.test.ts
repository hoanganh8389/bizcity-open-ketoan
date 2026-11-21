// [2026-11-21 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B1 (S038-2..5, S038-11): test nhật ký lỗi cố định — tệp xoay vòng, tách mức, lỗi khởi động ghi đồng bộ, version / commit
/**
 * Nhật ký lỗi cố định của bản cài (PHASE-038, 10-NGHIEN-CUU-GHI-LOG.md §7). Kiểm:
 *   - tệp xoay vòng giữ đúng số bản, không vượt trần;
 *   - chỉ dòng ≥ LOG_FILE_LEVEL vào tệp, stdout vẫn theo LOG_LEVEL;
 *   - logger Fastify thật ghi tệp có service / version / commit;
 *   - lỗi khởi động: một dòng fatal đồng bộ có evt, reason, hint, stack — đọc được ngay sau khi gọi (trước process.exit);
 *   - thư mục không ghi được không làm hỏng việc ghi log.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyStartError, LEVELS, loggerOptions, logStartFailure, RotatingFile, rotatingFile, serializeError, teeStream,
} from '@bizcity/platform/core/logger';
import { EnvError } from '@bizcity/platform/config/env';

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'nhat-ky-loi-')); });
afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

const lines = (file: string) => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);

describe('RotatingFile', () => {
  it('xoay vòng theo dung lượng, giữ đúng số bản, bản cũ nhất bị xoá', () => {
    const f = new RotatingFile(path.join(dir, 'a.log'), 100, 3);
    for (let i = 0; i < 20; i++) f.write(`${String(i).padStart(2, '0')}-${'x'.repeat(26)}\n`); // 30 byte / dòng
    expect(readdirSync(dir).sort()).toEqual(['a.log', 'a.log.1', 'a.log.2']);
    const total = readdirSync(dir).reduce((n, x) => n + statSync(path.join(dir, x)).size, 0);
    expect(total).toBeLessThanOrEqual(300);
    expect(lines(path.join(dir, 'a.log')).at(-1)).toMatch(/^19-/); // dòng mới nhất ở tệp chính
  });

  it('thư mục không ghi được: báo một lần ra stderr, không ném lỗi', () => {
    const blocker = path.join(dir, 'la-tep');
    writeFileSync(blocker, 'không phải thư mục');
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const f = new RotatingFile(path.join(blocker, 'api-loi.log'));
    expect(() => { f.write('a\n'); f.write('b\n'); }).not.toThrow();
    expect(err).toHaveBeenCalledTimes(1);
  });
});

describe('teeStream / loggerOptions', () => {
  it('chỉ dòng ≥ mức tệp vào tệp; stdout nhận cả hai', () => {
    const out: string[] = [];
    const file = new RotatingFile(path.join(dir, 'api-loi.log'));
    const s = teeStream({ file, fileLevel: LEVELS.warn, out: { write: (x: string) => out.push(x) } });
    s.write('{"level":30,"msg":"xong yêu cầu"}\n');
    s.write('{"level":50,"msg":"lỗi hệ thống"}\n');
    expect(out).toHaveLength(2);
    expect(lines(file.file)).toEqual(['{"level":50,"msg":"lỗi hệ thống"}']);
  });

  it('logger Fastify thật: warn vào tệp có service / version / commit; stdout lọc theo LOG_LEVEL', async () => {
    const prevSha = process.env.BIZCITY_GIT_SHA;
    process.env.BIZCITY_GIT_SHA = '69e0c848aabbccddeeff00112233445566778899';
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const app = Fastify({ logger: loggerOptions({ service: 'api', level: 'error', dir, fileLevel: 'warn' }) });
      app.log.info('việc bình thường');
      app.log.warn({ evt: 'bizcity.test.warn' }, 'cảnh báo');
      app.log.error({ err: new Error('hỏng') }, 'lỗi hệ thống');
      await app.close();
      const rows = lines(path.join(dir, 'api-loi.log')).map((l) => JSON.parse(l) as Record<string, unknown>);
      expect(rows.map((r) => r.msg)).toEqual(['cảnh báo', 'lỗi hệ thống']);
      expect(rows[0]).toMatchObject({ service: 'api', commit: '69e0c848aabb', evt: 'bizcity.test.warn' });
      expect(typeof rows[0]!.version).toBe('string');
      expect((rows[1]!.err as { stack: string }).stack).toContain('hỏng');
      const printed = out.mock.calls.map((c) => String(c[0])).join('');
      expect(printed).toContain('lỗi hệ thống');
      expect(printed).not.toContain('cảnh báo'); // LOG_LEVEL=error
    } finally {
      out.mockRestore();
      if (prevSha === undefined) delete process.env.BIZCITY_GIT_SHA; else process.env.BIZCITY_GIT_SHA = prevSha;
    }
  });

  it('không đặt LOG_DIR: không ghi tệp; test: im lặng', () => {
    expect(loggerOptions({ service: 'api', level: 'info', silent: true })).toEqual({ level: 'silent' });
    const o = loggerOptions({ service: 'api', level: 'info', dir: '' }) as { level: string };
    expect(o.level).toBe('info');
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('lỗi khởi động', () => {
  it.each([
    [new Error('Cơ sở dữ liệu chưa nâng cấp (2 migration chưa áp, mới nhất 0163_x.sql)'), 'MIGRATION_PENDING'],
    [new EnvError('Cấu hình môi trường không hợp lệ: JWT_SECRET'), 'ENV_INVALID'],
    [Object.assign(new Error('password authentication failed'), { code: '28P01' }), 'DB_AUTH_FAILED'],
    [Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'DB_UNREACHABLE'],
    [Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }), 'PORT_IN_USE'],
    [new TypeError('x is undefined'), 'UNKNOWN'],
  ])('%s → %s', (err, reason) => {
    expect(classifyStartError(err)).toBe(reason);
  });

  it('ghi đồng bộ một dòng fatal có evt, reason, hint, stack — đọc được ngay', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const reason = logStartFailure(new Error('Cơ sở dữ liệu chưa nâng cấp (1 migration chưa áp, mới nhất 0164_y.sql)'), { service: 'api', dir });
    expect(reason).toBe('MIGRATION_PENDING');
    const [row] = lines(path.join(dir, 'api-loi.log')).map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(row).toMatchObject({ level: 60, service: 'api', evt: 'bizcity.system.start_failed', reason: 'MIGRATION_PENDING' });
    expect(String(row!.hint)).toContain('db-migrate');
    expect(String((row!.err as { stack: string }).stack)).toContain('nhat-ky-loi.test.ts');
  });

  it('job db-migrate ghi tệp riêng; dùng chung bộ đếm dung lượng với rotatingFile()', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    logStartFailure(Object.assign(new Error('Migration 0165_z.sql lỗi: cột trùng'), { code: '42701' }), { service: 'db-migrate', file: 'db-migrate.log', dir });
    const p = path.join(dir, 'db-migrate.log');
    expect(rotatingFile(p)).toBe(rotatingFile(p));
    expect(JSON.parse(lines(p)[0]!)).toMatchObject({ service: 'db-migrate', reason: 'UNKNOWN', err: { code: '42701' } });
  });
});

describe('serializeError', () => {
  it('giữ chuỗi nguyên nhân (cause), mã lỗi, loại', () => {
    const e = new Error('Migration lỗi', { cause: Object.assign(new Error('duplicate column'), { code: '42701' }) });
    expect(serializeError(e)).toMatchObject({ type: 'Error', message: 'Migration lỗi', cause: { message: 'duplicate column', code: '42701' } });
    expect(serializeError('chuỗi')).toEqual({ type: 'string', message: 'chuỗi' });
  });
});
