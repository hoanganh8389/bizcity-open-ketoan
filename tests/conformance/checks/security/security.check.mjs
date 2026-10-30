// [2026-10-29 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — luật phát hành, thay đổi Kernel, bảo mật, tự chẩn đoán.
/**
 * RULE-SECURITY (R-SEC-*) — phần đọc được từ mã nguồn và cấu hình repo.
 */

/** Mẫu bí mật thật. Giá trị giữ chỗ (.env.example, "ci-only", "doi-thanh") không tính. */
const SECRET_PATTERNS = [
  ['bizcity-1api', /\bbiz[-_][0-9a-f]{32}\b/i],
  ['mcp-key', /\bmcp_[A-Za-z0-9]{40}\b/],
  ['core-api-key', /\bkt_[A-Za-z0-9_-]{32}\b/],
  ['private-key', /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['openai-like', /\bsk-[A-Za-z0-9_-]{32,}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['aws-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['assigned-secret', /\b(password|passwd|secret|api[_-]?key|token)\b["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i],
];
const PLACEHOLDER = /(doi-thanh|change-?me|example|ci-only|placeholder|xxxx|<[^>]+>|\$\{|process\.env|env\.)/i;
const SKIP_FILES = /(^|\/)(package-lock\.json|.*\.example|.*\.md)$|^apps\/api\/test\/|^db\/seeds\//;

export const checks = [
  {
    id: 'SC-SEC-1',
    title: 'Không có bí mật thật trong mã nguồn (khoá 1API, khoá MCP, khoá riêng, token, mật khẩu gán cứng)',
    gate: 'CONF-STATIC', contract: 'kernel', rules: ['R-SEC-1'], conf: [], tier: 0, enforce: 'block', weight: 5, targets: ['repo', 'module'], scope: 'module',
    run(ctx) {
      const files = ctx.repo.files({ ext: ['.ts', '.tsx', '.js', '.mjs', '.json', '.yml', '.yaml', '.sh', '.sql', '.env', '.php', '.py'] })
        .filter((f) => !SKIP_FILES.test(f));
      const findings = [];
      for (const file of files) {
        ctx.repo.lines(file).forEach((t, i) => {
          for (const [kind, re] of SECRET_PATTERNS) {
            const m = re.exec(t);
            if (!m || PLACEHOLDER.test(m[0])) continue;
            // Không in giá trị: chỉ loại + vị trí.
            findings.push(ctx.finding(file, i + 1, `nghi bí mật loại ${kind} — chuyển vào biến môi trường, thu hồi khoá nếu đã đẩy lên git`, kind));
          }
        });
      }
      return { examined: files.length, findings };
    },
  },
  {
    id: 'SC-SEC-2',
    title: 'Không ghép chuỗi vào SQL: hạn chế sql.raw / sql.lit, mọi giá trị đi qua tham số',
    gate: 'CONF-STATIC', contract: 'kernel', rules: ['R-SEC-3'], conf: ['CONF-STATIC-3'], tier: 1, enforce: 'ratchet', weight: 3, targets: ['repo', 'module'], scope: 'module',
    run(ctx) {
      const opts = ctx.mode === 'module' ? { ext: ['.ts', '.mjs', '.js'] } : { under: ['apps/api/src'], ext: ['.ts'] };
      const hits = ctx.repo.grep(/\bsql\.(raw|lit)(<[^>]*>)?\(|\.query\(\s*`[^`]*\$\{/, { ...opts, skipComments: true });
      return { examined: ctx.repo.files(opts).length, findings: hits.map((h) => ctx.finding(h.file, h.line, `${h.text} — chỉ được ghép hằng số do code sinh, không ghép đầu vào người dùng`, /raw|lit/.exec(h.text)?.[0] ?? 'template')) };
    },
  },
  {
    id: 'SC-SEC-3',
    title: 'Vệ sinh repo: .gitignore chặn .env / dữ liệu / kết quả kiểm; có SECURITY.md; CI không in bí mật',
    gate: 'DOCS', contract: 'kernel', rules: ['R-SEC-1', 'R-SEC-9'], conf: [], tier: 1, enforce: 'block', weight: 3, targets: ['repo'],
    run(ctx) {
      const gi = ctx.repo.read('.gitignore') ?? '';
      const findings = [];
      for (const [pat, why] of [['.env', 'tệp bí mật'], ['backups/', 'bản sao lưu CSDL'], ['tests/conformance/output/', 'kết quả kiểm (có thể chứa mẫu dữ liệu)']]) {
        if (!gi.split(/\r?\n/).some((l) => l.trim() === pat || l.trim() === `/${pat}`)) findings.push(ctx.finding('.gitignore', null, `thiếu "${pat}" (${why})`, `gitignore:${pat}`));
      }
      if (!ctx.repo.exists('SECURITY.md')) findings.push(ctx.finding('SECURITY.md', null, 'thiếu chính sách báo lỗ hổng ở gốc repo (repo công khai)', 'security-md'));
      for (const wf of ctx.repo.files({ under: ['.github/workflows'], ext: ['.yml', '.yaml'] })) {
        ctx.repo.lines(wf).forEach((t, i) => {
          if (/\b(echo|cat|printenv)\b.*\$\{\{\s*secrets\./.test(t)) findings.push(ctx.finding(wf, i + 1, 'in giá trị secrets ra log CI', 'ci-echo-secret'));
        });
      }
      return { examined: 5, unitBy: 'key', findings };
    },
  },
  {
    id: 'SC-SEC-4',
    title: 'Chuỗi cung ứng: GitHub Action ghim theo mã commit (SHA), không theo nhãn có thể bị dời',
    gate: 'DOCS', contract: 'kernel', rules: ['R-SEC-8'], conf: [], tier: 2, enforce: 'info', weight: 1, targets: ['repo'],
    run(ctx) {
      const findings = []; let uses = 0;
      for (const wf of ctx.repo.files({ under: ['.github/workflows'], ext: ['.yml', '.yaml'] })) {
        ctx.repo.lines(wf).forEach((t, i) => {
          const m = /uses:\s*([\w.-]+\/[\w.-]+)@([\w.-]+)/.exec(t);
          if (!m) return;
          uses++;
          if (!/^[0-9a-f]{40}$/.test(m[2])) findings.push(ctx.finding(wf, i + 1, `${m[1]}@${m[2]} — ghim SHA (giữ nhãn ở chú thích)`, `${m[1]}@${m[2]}`));
        });
      }
      return { examined: uses, unitBy: 'key', findings };
    },
  },
];
