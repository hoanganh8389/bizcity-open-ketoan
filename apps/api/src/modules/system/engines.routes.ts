// @bizcity-layer P module-sdk
// [2026-11-10 11:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B4 (S034-7): thẻ Bộ máy ở HT10 — sổ bộ máy bo-may.json + trạng thái mốc đọc từ bảng việc, không có mức gõ tay (D034-5)
/**
 * GET /api/v1/system/engines — 13 bộ máy (engine) của Core (bizcity_engines@1, docs/standard/bo-may.json).
 * Mỗi mốc là một mã việc S0xx-*; trạng thái của mốc đọc từ docs/phases/bang-viec.json (bizcity_task_board@1, sinh từ checklist trên main
 * bằng scripts/bang-viec.mjs). Mức của bộ máy = (xong 1 · chờ đủ tín hiệu ½ · còn lại 0) / số mốc; bộ máy không có mốc thì `pct = null`.
 * Hai tệp thuộc bản dựng, không theo đơn vị; ảnh api chép kèm (R-REL-11, SC-REL-3). SC-ENG-1 giữ bo-may.json khớp repo.
 * Không có đường ghi (R-CONT-7).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuthenticated } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';

// Chạy từ src (tsx) hay dist (node): apps/api/{src,dist}/modules/system → gốc repo cách 5 cấp.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const ENGINES_FILE = 'docs/standard/bo-may.json';
const BOARD_FILE = 'docs/phases/bang-viec.json';

function readJson<T>(file: string): T | null {
  try { return JSON.parse(readFileSync(path.join(root, file), 'utf8')) as T; } catch { return null; }
}

interface EngineDef {
  id: string; key: string; title: string; layer: string; duty: string; code: string[]; contracts: string[]; adr: string[];
  core: string; pillars: string[]; emits: string[]; plannedEmits?: string[]; tests: string[]; sdk: string; milestones: string[];
}
interface EnginesFile { contract: string; version: string; updated: string; doc: string; layers: Record<string, string>; engines: EngineDef[] }
interface BoardItem { id: string; phase: string; title: string; status: string; column: string; file: string; line: number }

/** Trọng số cột của bảng việc: xong 1 · chờ đủ tín hiệu ½ · còn lại 0. */
export const MILESTONE_WEIGHT: Record<string, number> = { done: 1, partial: 0.5 };

let cache: { engines: EnginesFile; board: Map<string, BoardItem> } | null | undefined;
function load() {
  if (cache !== undefined) return cache;
  const engines = readJson<EnginesFile>(ENGINES_FILE);
  const board = readJson<{ items: BoardItem[] }>(BOARD_FILE);
  cache = engines ? { engines, board: new Map((board?.items ?? []).map((x) => [x.id, x])) } : null;
  return cache;
}

export function engineBoard() {
  const c = load();
  if (!c) return null;
  const engines = c.engines.engines.map((e) => {
    const milestones = e.milestones.map((task) => {
      const x = c.board.get(task);
      return x ? { task, title: x.title, phase: x.phase, column: x.column, file: x.file, line: x.line } : { task, title: null, phase: null, column: 'unknown', file: null, line: null };
    });
    const sum = milestones.reduce((s, m) => s + (MILESTONE_WEIGHT[m.column] ?? 0), 0);
    return {
      ...e,
      milestones,
      pct: milestones.length ? Math.round((sum / milestones.length) * 100) : null,
      done: milestones.filter((m) => m.column === 'done').length,
    };
  });
  return { contract: c.engines.contract, version: c.engines.version, updated: c.engines.updated, doc: c.engines.doc, layers: c.engines.layers, boardLoaded: c.board.size > 0, engines };
}

export async function enginesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/system/engines', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Các bộ máy (engine) của Core × hợp đồng × mốc việc (docs/standard/bo-may.json + docs/phases/bang-viec.json) — cho thẻ Bộ máy ở HT10; chỉ đọc' },
    handler: async () => {
      const b = engineBoard();
      if (!b) throw Errors.notFound(`sổ bộ máy (${ENGINES_FILE} không có trong bản cài)`);
      return ok(b);
    },
  });
}
