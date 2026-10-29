/**
 * Cấu hình mẫu in áp cho người đang dùng (API /api/v1/print-templates/effective, theo chi nhánh đang làm việc).
 * Thứ tự ưu tiên: người dùng → chi nhánh (shop) → chi nhánh cha → cả đơn vị → mẫu gốc trong code.
 *   - Bật / tắt và phần chỉnh nội dung: lấy dòng ưu tiên cao nhất có cấu hình mẫu đó; phần chỉnh gộp từ thấp lên cao
 *     (đơn vị đặt chữ ký, shop chỉ đổi số liên thì vẫn giữ chữ ký của đơn vị).
 *   - Mẫu mặc định của màn: phạm vi ưu tiên cao nhất có đặt mặc định cho màn đó.
 */
import { useQuery } from '@tanstack/react-query';
import type { PrintOverrides, PrintScope, PrintSetting } from '@ketoan/contracts';
import { api } from '@/lib/api';
import { useWorkBranch } from '@/lib/workBranch';
import { templateCode } from './catalog';
import type { PrintTemplate } from './PrintHost';

interface Effective { userId: string; branches: string[]; settings: PrintSetting[] }

export const SCOPE_LABEL: Record<PrintScope, string> = { tenant: 'cả đơn vị', branch: 'chi nhánh', user: 'người dùng' };

export function useEffectivePrintSettings() {
  const branchCode = useWorkBranch();
  return useQuery({
    queryKey: ['print-settings', 'effective', branchCode],
    queryFn: () => api.get<Effective>('/api/v1/print-templates/effective', { branchCode }),
    staleTime: 60_000,
    retry: false,
  });
}

/** Hạng ưu tiên của một dòng cấu hình (0 = cao nhất). */
function rank(s: PrintSetting, eff: Effective): number {
  if (s.scope === 'user') return 0;
  if (s.scope === 'branch') { const i = eff.branches.indexOf(s.scopeRef); return i < 0 ? 99 : 1 + i; }
  return 50;
}

export interface ResolvedTemplate<T> { template: PrintTemplate<T>; overrides: PrintOverrides }
export interface ResolvedScreen<T> {
  templates: ResolvedTemplate<T>[];
  /** Mẫu mặc định theo cấu hình và phạm vi đặt nó; không có = theo lựa chọn gần nhất trên máy / mẫu đầu. */
  defaultId?: string;
  defaultScope?: PrintScope;
  /** Số mẫu bị tắt ở màn này. */
  hidden: number;
}

/** Áp cấu hình cho danh sách mẫu của một màn. Chưa nạp được cấu hình (lỗi mạng, chưa đăng nhập) thì in như mẫu gốc. */
export function resolveScreen<T>(screen: string, templates: PrintTemplate<T>[], eff: Effective | undefined): ResolvedScreen<T> {
  if (!eff) return { templates: templates.map((t) => ({ template: t, overrides: {} })), hidden: 0 };
  const mine = eff.settings.filter((s) => s.templateCode.startsWith(`${screen}:`) && rank(s, eff) < 99).sort((a, b) => rank(a, eff) - rank(b, eff));
  const out: ResolvedTemplate<T>[] = [];
  let hidden = 0;
  for (const t of templates) {
    const rows = mine.filter((s) => s.templateCode === templateCode(screen, t.id));
    if (rows.length && !rows[0]!.isEnabled) { hidden++; continue; }
    const overrides = rows.slice().reverse().reduce<PrintOverrides>((acc, r) => ({ ...acc, ...r.overrides }), {});
    out.push({ template: t, overrides });
  }
  const def = mine.find((s) => s.isDefault && out.some((x) => templateCode(screen, x.template.id) === s.templateCode));
  return { templates: out, defaultId: def?.templateCode.split(':')[1], defaultScope: def?.scope, hidden };
}
