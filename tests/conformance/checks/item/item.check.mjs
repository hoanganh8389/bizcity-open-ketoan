// [2026-11-04 12:12 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-16: SC-ITEM-1..3 (RULE-ITEM §kiểm): sổ khoá theo item_id, không theo mã; luật định khoản không đọc danh mục mua hàng
/**
 * Bộ kiểm tĩnh của Item Master (PHASE-024 · 20 §4, RULE-ITEM). Bảo vệ bất biến "Item Identity is Immutable. Item Code is Versioned":
 *  - SC-ITEM-1  preset / module / fixture gửi hàng đúng bizcity_item_master@1 — chờ hợp đồng nhập / xuất cho plugin (BIZCITY-ITEM-MASTER-v1 §5)
 *  - SC-ITEM-2  không khoá ngoại nào theo mã hàng; sau khi sổ có item_id, migration mới không thêm cột mã vào bảng sổ / kho
 *  - SC-ITEM-3  luật định khoản của Kernel không import danh mục mua hàng (`@bizcity/mua-hang-domain`, `skuInfo`)
 */

/** Bảng kế toán / kho khoá theo item_id (20-KIEN-TRUC §1 "Khoá sổ"). */
const LEDGER_TABLES = ['ledger_lines', 'inventory_movements', 'inventory_costs', 'product_units', 'product_prices'];
const SKU_COL = /(^|_)sku$/i;
const cols = (s) => s.split(',').map((c) => c.trim().replace(/"/g, ''));
const lineAt = (text, idx) => text.slice(0, idx).split('\n').length;
/** Bỏ chú thích SQL để không bắt nhầm câu trong "--". */
const stripComments = (t) => t.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));

export const checks = [
  {
    id: 'SC-ITEM-1',
    title: 'Preset / module / fixture gửi hàng hoá đúng bizcity_item_master@1 (schema)',
    gate: 'CONF-STATIC', contract: 'bizcity_data', rules: ['R-ITEM-9'], conf: [], tier: 1, enforce: 'planned', phase: 'PHASE-024 S024-4 (hợp đồng nhập / xuất cho plugin)', weight: 2, targets: ['repo', 'module'],
    run(ctx) {
      const has = ctx.core.exists('docs/contracts/BIZCITY-ITEM-MASTER-v1.schema.json');
      return { examined: 0, findings: [], notes: [has ? 'đã có schema — chuyển check sang block và viết phần kiểm' : 'chưa có docs/contracts/BIZCITY-ITEM-MASTER-v1.schema.json (hợp đồng nhập / xuất cho plugin, BIZCITY-ITEM-MASTER-v1 §5)'] };
    },
  },
  {
    id: 'SC-ITEM-2',
    title: 'Sổ không khoá theo mã hàng: không khoá ngoại theo cột mã (sku); sau khi có item_id, migration mới không thêm cột mã vào bảng sổ / kho',
    gate: 'CONF-MIG', contract: 'bizcity_data', rules: ['R-ITEM-1', 'R-ITEM-5'], conf: [], tier: 0, enforce: 'block', weight: 4, targets: ['repo'],
    run(ctx) {
      const files = ctx.repo.list('db/migrations').filter((f) => f.endsWith('.sql')).map((f) => `db/migrations/${f}`);
      const findings = []; let fks = 0;
      // Migration đầu tiên gắn item_id vào ledger_lines: từ sau nó, bảng sổ / kho không nhận thêm cột mã.
      const ITEM_ADD = /ALTER\s+TABLE\s+(?:public\.)?ledger_lines\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?item_id\b/i;
      const itemFrom = files.find((f) => ITEM_ADD.test(stripComments(ctx.repo.read(f) ?? '')));
      for (const f of files) {
        const text = stripComments(ctx.repo.read(f) ?? '');
        // FOREIGN KEY (a, b) REFERENCES t (c, d)
        for (const m of text.matchAll(/FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+(?:public\.)?"?(\w+)"?\s*\(([^)]*)\)/gi)) {
          fks++;
          const bad = [...cols(m[1]), ...cols(m[3])].find((c) => SKU_COL.test(c));
          if (bad) findings.push(ctx.finding(f, lineAt(text, m.index), `khoá ngoại theo mã hàng (${bad} → ${m[2]}) — sổ liên kết bằng item_id, mã chỉ là ảnh chụp (R-ITEM-1)`, `fk:${m[2]}:${bad}`));
        }
        // cột khai inline: product_sku text REFERENCES products (sku)
        for (const m of text.matchAll(/\b(\w*sku)\s+[\w() ]+?\s+REFERENCES\s+(?:public\.)?"?(\w+)"?/gi)) {
          fks++;
          findings.push(ctx.finding(f, lineAt(text, m.index), `cột mã ${m[1]} khai REFERENCES ${m[2]} — liên kết bằng item_id (R-ITEM-1)`, `fk:${m[2]}:${m[1]}`));
        }
        if (itemFrom && f >= itemFrom) {
          const after = f === itemFrom ? text.search(ITEM_ADD) : -1; // cùng migration: chỉ tính câu đứng sau câu gắn item_id
          for (const m of text.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?"?(\w+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi)) {
            if (m.index > after && LEDGER_TABLES.includes(m[1]) && SKU_COL.test(m[2])) findings.push(ctx.finding(f, lineAt(text, m.index), `thêm cột mã ${m[1]}.${m[2]} sau khi sổ đã có item_id (${itemFrom.split('/').pop()}) — dùng item_id; mã đã có sẵn làm ảnh chụp`, `col:${m[1]}.${m[2]}`));
          }
        }
      }
      return { examined: fks, findings, ...(itemFrom ? {} : { notes: ['chưa có migration gắn item_id vào ledger_lines — chỉ kiểm khoá ngoại'] }) };
    },
  },
  {
    id: 'SC-ITEM-3',
    title: 'Luật định khoản của Kernel không import danh mục mua hàng (@bizcity/mua-hang-domain, skuInfo): loại dòng đi qua phân loại mặt hàng',
    gate: 'CONF-STATIC', contract: 'bizcity_data', rules: ['R-ITEM-4'], conf: [], tier: 1, enforce: 'block', weight: 3, targets: ['repo'],
    run(ctx) {
      const files = ctx.repo.files({ under: ['packages/kernel/src/modules/posting'], ext: ['.ts'], not: /\.test\.ts$/ });
      const findings = []; const seen = new Set();
      for (const h of ctx.repo.grep(/@bizcity\/mua-hang-domain|\bskuInfo\b/, { under: ['packages/kernel/src/modules/posting'], ext: ['.ts'], not: /\.test\.ts$/, skipComments: true })) {
        if (seen.has(h.file)) continue; // một phát hiện mỗi tệp, dòng đầu tiên
        seen.add(h.file);
        findings.push(ctx.finding(h.file, h.line, `${h.text} — luật định khoản đọc phân loại mặt hàng tại ngày (Item Resolver / Accounting Mapping Resolver), không đọc danh mục mua hàng (20-KIEN-TRUC §3)`, h.file));
      }
      return { examined: files.length, findings };
    },
  },
];
