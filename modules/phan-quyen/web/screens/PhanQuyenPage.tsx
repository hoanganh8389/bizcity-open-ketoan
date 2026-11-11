/** Phân quyền (Role Editor, HT12): ba thẻ — Ma trận, Vai trò, Người dùng. API Core /api/v1/roles, /api/v1/users/:id/roles (ADR-0027). */
import { useState } from 'react';
import { PageHeader } from '@bizcity/ui-kit';
import { MatrixTab } from './MatrixTab';
import { RolesTab } from './RolesTab';
import { UsersTab } from './UsersTab';

type Tab = 'ma-tran' | 'vai-tro' | 'nguoi-dung';
const TABS: { key: Tab; label: string }[] = [
  { key: 'ma-tran', label: 'Ma trận quyền' },
  { key: 'vai-tro', label: 'Vai trò' },
  { key: 'nguoi-dung', label: 'Người dùng' },
];

/** Mở thẳng một thẻ / một người từ màn khác (HT01 → `?tab=nguoi-dung&user=<id>`) — đọc địa chỉ trình duyệt, không cần thư viện định tuyến. */
const urlParam = (k: string): string | null => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(k));

export function PhanQuyenPage() {
  const [tab, setTab] = useState<Tab>(() => (TABS.some((t) => t.key === urlParam('tab')) ? (urlParam('tab') as Tab) : 'ma-tran'));
  return (
    <div>
      <PageHeader title="Phân quyền" code="HT12" subtitle="Ai được làm gì: vai trò, luật Cho / Cấm, gán cho người dùng. Cấm luôn thắng; quyền rủi ro cao đòi nhập lại mật khẩu." />
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'ma-tran' ? <MatrixTab /> : tab === 'vai-tro' ? <RolesTab /> : <UsersTab initialUserId={urlParam('user')} />}
    </div>
  );
}
