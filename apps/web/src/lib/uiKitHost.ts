// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2 (PHASES 3.8): khung giao diện cung cấp bản thật cho @bizcity/ui-kit — module dùng đúng thành phần, client API của Core
/** Gọi một lần trước khi vẽ (main.tsx). Màn của module SDK lấy thành phần + client API qua @bizcity/ui-kit, không import src/*. */
import { createElement } from 'react';
import { provideUiKit } from '@bizcity/ui-kit';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Field, Loading, Modal, Money, StatusBadge } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function installUiKit(): void {
  provideUiKit({
    PageHeader, Loading, ErrorBox, Empty, Field, Money, StatusBadge,
    Modal: (p) => createElement(Modal, { ...p, footer: p.footer ?? null }),
    api: {
      get: (path, query) => api.get(path, query),
      post: (path, body) => api.post(path, body),
      put: (path, body) => api.put(path, body),
      delete: (path) => api.delete(path),
    },
    errorText,
    useCan: () => useAuth().can,
  });
}
