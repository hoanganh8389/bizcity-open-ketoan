// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2: route của module SDK (/app/<key>/…), chặn theo quyền khai ở defineWebModule
import { Route } from 'react-router-dom';
import type { ComponentType } from 'react';
import { useAuth } from '@/lib/auth';
import { SDK_WEB } from './sdk-modules';

function Guard({ C, permission }: { C: ComponentType; permission?: string }) {
  const { can } = useAuth();
  if (permission && !can(permission)) return <div className="card card-body muted">Bạn chưa có quyền <code>{permission}</code> để mở màn này.</div>;
  return <C />;
}

export const sdkRoutes = SDK_WEB.flatMap((p) => p.routes).map((r) => <Route key={r.path} path={r.path} element={<Guard C={r.component} permission={r.permission} />} />);
