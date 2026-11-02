// @bizcity-layer P observability
// SC-DEV-1: ba vi phạm mẫu — mẫu LogQL không gắn đơn vị, giá trị chèn không qua quote(), PromQL có tham số.
const quote = (s: string) => JSON.stringify(s);

export const LOGQL = {
  noTenant: (q: string) => `{service="api"} | reqId=${quote(q)}`,
  raw: (q: string, tenant: string) => `{service="api"} | evt="${q}" | json | tenant=${quote(tenant)}`,
};

export const PROMQL = [
  { key: 'x', expr: `up{job="${process.env.JOB}"}`, unit: 'bool' },
];
