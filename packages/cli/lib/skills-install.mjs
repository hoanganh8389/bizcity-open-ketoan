// [2026-11-03 02:25 PM Johnny Chu - Chu Hoàng Anh] G3-01 — `bizcity skills install`: chép skill kế toán vào dự án của dev (POS, bán hàng, ERP, CRM)
/**
 * Skill gốc nằm ở skills/<tên>/SKILL.md của repo này (một nguồn). Lệnh chép sang dự án đích:
 *   <đích>/.claude/skills/<tên>/   — Claude Code tự nhận
 *   <đích>/.agents/skills/<tên>/   — agent khác đọc chuẩn Agent Skills
 *   <đích>/.bizcity/ketoan.json    — { repo, cli } để skill ở dự án khác gọi đúng lệnh `bizcity` của bản repo này
 * Chép đè bản cũ cùng tên (skill là tệp sinh từ nguồn, không sửa tay ở đích). Không đụng tệp khác của dự án đích.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './sources.mjs';

export const SKILLS_DIR = path.join(ROOT, 'skills');

export function listSkills() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR).filter((d) => existsSync(path.join(SKILLS_DIR, d, 'SKILL.md'))).sort();
}

export function installSkills(to = ROOT) {
  const dest = path.resolve(to);
  if (!existsSync(dest)) throw new Error(`không có thư mục ${dest}`);
  const names = listSkills();
  if (!names.length) throw new Error(`không có skill nào trong ${SKILLS_DIR}`);
  const written = [];
  for (const base of ['.claude/skills', '.agents/skills']) {
    for (const name of names) {
      const target = path.join(dest, base, name);
      if (path.resolve(target) === path.resolve(SKILLS_DIR, name)) continue;
      rmSync(target, { recursive: true, force: true });
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(path.join(SKILLS_DIR, name), target, { recursive: true });
      written.push(path.relative(dest, target).split(path.sep).join('/'));
    }
  }
  mkdirSync(path.join(dest, '.bizcity'), { recursive: true });
  const cfg = { contract: 'bizcity_skills_link@1', repo: ROOT.split(path.sep).join('/'), cli: path.join(ROOT, 'packages', 'cli', 'bin', 'bizcity.mjs').split(path.sep).join('/'), skills: names };
  writeFileSync(path.join(dest, '.bizcity', 'ketoan.json'), `${JSON.stringify(cfg, null, 2)}\n`);
  written.push('.bizcity/ketoan.json');
  return { names, written };
}
