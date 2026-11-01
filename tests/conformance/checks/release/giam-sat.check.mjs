// [2026-11-01 01:14 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — SC-OBS-1: số đo bizcity_* trong dashboard / luật cảnh báo phải được khai trong mã; dashboard JSON đọc được, uid không trùng.
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — số đo khai ở LAYER_ROOTS (core/metrics.ts nay ở packages/platform)
/**
 * Bộ giám sát (infrastructure/monitoring) — R-OBS-6: số đo, dashboard, cảnh báo đổi cùng nhau. Bắt lỗi "panel trống / cảnh báo
 * không bao giờ bắn" do gõ sai tên số đo, ngay ở PR, không cần chạy Prometheus. Số đo khai bằng new Counter / Gauge / Histogram
 * ('bizcity_…') trong apps/api/src; histogram được thêm hậu tố _bucket / _sum / _count. Chỉ xét tiền tố bizcity_ (số đo của
 * exporter — pg_, node_, container_ — không do repo khai). Tên theo sau bởi "@" là tên hợp đồng (bizcity_errors@1), không phải số đo.
 */
import { LAYER_ROOTS } from '../../lib/layers.mjs';
const MON = 'infrastructure/monitoring';
const DECL = /new\s+(Counter|Gauge|Histogram)\(\s*['"](bizcity_[a-z0-9_]+)['"]/g;
const USE = /\bbizcity_[a-z0-9_]+\b(?![@.])/g;

export default {
  id: 'SC-OBS-1',
  title: 'Số đo bizcity_* dùng trong dashboard và luật cảnh báo đều được khai trong mã; dashboard JSON hợp lệ, uid không trùng',
  gate: 'CONF-STATIC', contract: 'quality', rules: ['R-OBS-6'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const dashboards = ctx.repo.files({ under: [`${MON}/grafana/dashboards`], ext: ['.json'] });
    const rules = ctx.repo.files({ under: [`${MON}/prometheus`], ext: ['.yml', '.yaml'] });
    if (!dashboards.length && !rules.length) return { examined: 0, findings: [], notes: [`chưa có ${MON}`] };

    const declared = new Set();
    for (const f of ctx.repo.files({ under: LAYER_ROOTS, ext: ['.ts'] })) {
      for (const m of (ctx.repo.read(f) ?? '').matchAll(DECL)) {
        declared.add(m[2]);
        if (m[1] === 'Histogram') for (const s of ['_bucket', '_sum', '_count']) declared.add(m[2] + s);
      }
    }

    const findings = [];
    const seen = new Set();
    const uids = new Map();
    for (const f of [...dashboards, ...rules]) {
      const text = ctx.repo.read(f) ?? '';
      if (f.endsWith('.json')) {
        let d;
        try { d = JSON.parse(text); } catch (err) { findings.push(ctx.finding(f, null, `JSON không đọc được: ${err.message}`, `parse:${f}`)); continue; }
        if (d.uid) {
          if (uids.has(d.uid)) findings.push(ctx.finding(f, null, `uid "${d.uid}" trùng với ${uids.get(d.uid)} — Grafana chỉ nạp một bảng`, `uid:${d.uid}`));
          else uids.set(d.uid, f);
        }
      }
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(USE)) {
          const name = m[0];
          if (declared.has(name) || seen.has(name)) continue;
          seen.add(name);
          findings.push(ctx.finding(f, i + 1, `số đo ${name} không được khai trong apps/api/src (sai tên, hoặc chưa thêm vào core/metrics.ts)`, `metric:${name}`));
        }
      });
    }
    return { examined: dashboards.length + rules.length, findings };
  },
};
