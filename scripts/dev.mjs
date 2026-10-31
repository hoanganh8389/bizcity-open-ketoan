#!/usr/bin/env node
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
/**
 * Chạy dev theo PHÂN HỆ (máy Windows / Mac / Linux, không cần cài thêm gói):
 *
 *   npm run dev                         đủ mọi phân hệ: API (cổng 4100) + giao diện (http://localhost:4180)
 *   npm run dev:mua-hang                API chỉ bật Mua hàng (+ lõi) + giao diện chỉ hiện Mua hàng
 *   npm run dev -- kho,ban-hang         nhiều phân hệ
 *   npm run dev -- mua-hang --api=https://ketoan-dev.ten-mien
 *                                       CHỈ giao diện, gọi API dev dùng chung (không cần cơ sở dữ liệu trên máy)
 *
 * Tuỳ chọn: --api=<địa chỉ>   (chỉ chạy giao diện, chuyển /api sang địa chỉ này)
 *           --api-only        (chỉ chạy API)
 * API khi chạy dev tự áp migration (AUTO_MIGRATE=1) — cần PostgreSQL (docker compose up -d db).
 */
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const modules = args.find((a) => !a.startsWith('--')) ?? '*';
const remote = args.find((a) => a.startsWith('--api='))?.slice(6);
const apiOnly = args.includes('--api-only');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const run = (name, workspace, env) => {
  const p = spawn(npm, ['run', 'dev', '-w', workspace], { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
  p.on('exit', (code) => { console.log(`[${name}] dừng (mã ${code ?? 0})`); process.exit(code ?? 0); });
  return p;
};

console.log(`Phân hệ: ${modules}${remote ? ` · chỉ giao diện, API: ${remote}` : apiOnly ? ' · chỉ API' : ''}`);
const procs = [];
if (!remote) procs.push(run('api', '@ketoan/api', { ENABLED_MODULES: modules, AUTO_MIGRATE: '1' }));
if (!apiOnly) procs.push(run('web', '@ketoan/web', { VITE_MODULES: modules === '*' ? '' : modules, ...(remote ? { API_TARGET: remote } : {}) }));
const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
