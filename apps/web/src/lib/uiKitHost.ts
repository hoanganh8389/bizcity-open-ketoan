// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2 (PHASES 3.8): khung giao diện cung cấp bản thật cho @bizcity/ui-kit — module dùng đúng thành phần, client API của Core
/** Gọi một lần trước khi vẽ (main.tsx). Màn của module SDK lấy thành phần + client API qua @bizcity/ui-kit, không import src/*. */
import { createElement } from 'react';
import { provideUiKit } from '@bizcity/ui-kit';
import { PageHeader } from '@/components/PageHeader';
// [2026-11-12 10:00 PM Võ Hoàng] POS-UIKIT — BIZCITY-EXTENSION 1.4.0-draft §3b: bản thật của bảng lưới, thẻ chỉ số, bộ tham số, ô chọn (đóng góp)
import { DataGrid } from '@/components/DataGrid';
import { KpiCards } from '@/components/KpiCards';
import { BranchCheckList, FilterLayout, SideKy } from '@/components/ReportPanel';
import { BranchPicker } from '@/components/filters';
import { ItemPicker } from '@/components/pickers';
import { Empty, ErrorBox, Field, Loading, Modal, Money, StatusBadge } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function installUiKit(): void {
  provideUiKit({
    PageHeader, Loading, ErrorBox, Empty, Field, Money, StatusBadge,
    // Tập con props của thành phần Core (chữ ký ở packages/ui-kit/src/grid.tsx).
    DataGrid: DataGrid as never,
    KpiCards,
    FilterLayout: (p) => createElement(FilterLayout, p),
    PeriodField: (p) => createElement(SideKy, p),
    BranchCheckList: (p) => createElement(BranchCheckList, p),
    ItemPicker: (p) => createElement(ItemPicker, p),
    BranchPicker: (p) => createElement(BranchPicker, p),
    Modal: (p) => createElement(Modal, { ...p, footer: p.footer ?? null }),
    api: {
      get: (path, query) => api.get(path, query),
      post: (path, body) => api.post(path, body),
      put: (path, body) => api.put(path, body),
      // [2026-11-06 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W4: nối patch của client API cho màn module (Role Editor)
      patch: (path, body) => api.patch(path, body),
      delete: (path) => api.delete(path),
    },
    errorText,
    useCan: () => useAuth().can,
  });
}
