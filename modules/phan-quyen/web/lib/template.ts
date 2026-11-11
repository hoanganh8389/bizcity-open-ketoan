/**
 * "Dùng mẫu" (PHASE-028 giai đoạn 4.1): dựng vai trò của đơn vị từ một mục của thư viện vai trò mẫu (`kind: permission-template`,
 * hôm nay là `authz.tgs-nhom`). Hàm thuần — màn chỉ gọi API sẵn có (tạo vai trò, thêm luật Cho), không có API riêng cho mẫu.
 * Chạy lại sau lần dở dang được: vai trò cùng mã đã có thì dùng lại, luật Cho đã có thì bỏ qua.
 */

export interface TemplateItem { code: string; name: string; baseRole: string; derived: string[]; anomalies: string[] }

/** Một dòng `GET /api/v1/libraries/:id/items` → mục mẫu; dòng sai khuôn → null (không dựng vai trò từ dữ liệu không hiểu). */
export function templateOf(row: { item: Record<string, unknown> }): TemplateItem | null {
  const it = row.item;
  const p = it.payload as { baseRole?: unknown; derived?: unknown; anomalies?: unknown } | undefined;
  if (typeof it.code !== 'string' || typeof it.name !== 'string' || !p || typeof p.baseRole !== 'string' || !Array.isArray(p.derived)) return null;
  return {
    code: it.code,
    name: it.name,
    baseRole: p.baseRole,
    derived: p.derived.filter((x): x is string => typeof x === 'string'),
    anomalies: Array.isArray(p.anomalies) ? p.anomalies.filter((x): x is string => typeof x === 'string') : [],
  };
}

export interface TemplatePlan {
  /** Luật Cho sẽ thêm (quyền đang có trong sổ, chưa có luật Cho đích danh ở vai trò). */
  add: string[];
  /** Quyền mẫu nêu nhưng sổ quyền không có (module chưa cài / quyền đề xuất) — bỏ qua, hiện cho người duyệt thấy. */
  unknown: string[];
  /** Có quyền rủi ro cao trong `add` → máy chủ đòi nhập lại mật khẩu. */
  high: boolean;
}

/** Kế hoạch thêm luật của một mẫu so với sổ quyền (`known`: khoá → rủi ro) và luật Cho đã có của vai trò (nếu vai trò đã tồn tại). */
export function planTemplate(t: TemplateItem, known: ReadonlyMap<string, 'low' | 'high'>, existingAllow: readonly string[] = []): TemplatePlan {
  const have = new Set(existingAllow);
  const uniq = [...new Set(t.derived)];
  const add = uniq.filter((p) => known.has(p) && !have.has(p)).sort();
  return { add, unknown: uniq.filter((p) => !known.has(p)).sort(), high: add.some((p) => known.get(p) === 'high') };
}
