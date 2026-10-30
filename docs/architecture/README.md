# Kiến trúc Bizcity Core (open-ketoan): sổ cái là lõi

> **Đọc cùng:** [TARGET-LAYOUT](../standard/TARGET-LAYOUT.md) (cây thư mục, luật phụ thuộc) · [REUSE-MAP](../standard/REUSE-MAP.md) (code hiện tại về đâu) · [ADR](../adr/README.md) (vì sao) · [PHASES](../standard/PHASES.md) (lộ trình)
> Sơ đồ viết bằng Mermaid: GitHub hiển thị trực tiếp. Đổi kiến trúc thì sửa sơ đồ trong cùng PR (CANON §5).

## 1. Bối cảnh hệ thống

```mermaid
flowchart LR
  subgraph Ngoai["Bên ngoài"]
    U["Người dùng<br/>(kế toán, chủ, nhân viên)"]
    POS["Hệ thống bán hàng / POS<br/>WooCommerce, trạm ACC14"]
    AI["Trợ lý AI<br/>Claude, ChatGPT, agent"]
    CELL["Bizcity Cell<br/>(Zalo, web chat) qua Hub"]
    WP["Plugin WordPress<br/>(Zalo Brain)"]
  end
  subgraph Core["Bizcity Core (một tiến trình Node)"]
    WEB["Giao diện React"]
    API["HTTP API /api/v1<br/>(bizcity_api@1)"]
    MCP["POST /mcp<br/>(bizcity_mcp@1)"]
    MOD["Module nghiệp vụ<br/>ke-toan · ban-hang · mua-hang · kho · …"]
    PLAT["Platform<br/>actions · audit · data · documents · events · permissions · observability"]
    KER["Kernel kế toán<br/>một cửa sự việc → định khoản → sổ cái"]
  end
  DB[("PostgreSQL 16<br/>sổ chỉ thêm, trigger bảo vệ")]
  MON["infrastructure/monitoring<br/>Prometheus · Grafana · Loki<br/>(tuỳ chọn)"]

  U --> WEB --> API
  POS -->|POST /documents| API
  AI --> MCP
  CELL -->|"Cell bridge (Phase 5)"| MCP
  WP --> CELL
  API --> MOD
  MCP --> MOD
  MOD --> PLAT
  MOD -->|"ctx.ledger.submit"| KER
  KER --> PLAT
  PLAT --> DB
  KER --> DB
  MON -.->|"/metrics, log"| Core
```

## 2. Các lớp và chiều phụ thuộc

```mermaid
flowchart TB
  ASM["Lắp ráp — apps/server (apps/api hôm nay)"]
  D["D · Module nghiệp vụ — modules/&lt;key&gt;"]
  A["A · Adapter tuỳ chọn — adapters/* (cell, wordpress, oidc, nats, redis, einvoice…)"]
  K["K · Kernel kế toán — packages/kernel"]
  M["M · Danh mục chuẩn — packages/data/masterdata"]
  P["P · Platform — packages/{data, permissions, audit, events, actions, documents, observability, module-sdk}"]
  U2["U · UI kit — packages/ui-kit"]
  INF["infrastructure/ — cấu hình vận hành, không phải code Core (LAYOUT-7)"]
  ASM --> D & A & K & P
  D -->|"chỉ qua @bizcity/module-sdk"| K & M & P & U2
  A --> K & M & P
  K --> M & P
  M --> P
  U2 --> P
  INF -.->|"đọc /metrics, log"| ASM
```

Luật đo bằng check **SC-LAYER-2** (mốc [docs/audits/deps-2026-10-30.md](../audits/deps-2026-10-30.md)). Mỗi tệp `apps/api/src` có nhãn `@bizcity-layer` (R-BOUND-10).

## 3. Một chứng từ đi vào sổ (Kernel)

```mermaid
sequenceDiagram
  autonumber
  participant S as Nguồn (POS, module, preset, AI đã xác nhận)
  participant R as Runtime action / POST /documents
  participant E as accounting_events (sự việc, phiên bản)
  participant P as Luật định khoản + AccountResolver
  participant L as ledgerService → ledger_entries / ledger_lines
  participant X as Sổ phụ (công nợ, kho, hoá đơn, sales_lines)
  participant V as Bằng chứng + sự kiện (outbox)
  S->>R: chứng từ bizcity_ledger_intake@1 (docKey, version, docType, reasonCode, mã danh mục — KHÔNG tài khoản)
  R->>E: lưu / so phiên bản (trùng → unchanged)
  E->>P: docType + reasonCode → lý do → nhóm hạch toán → thuế → hình thức thanh toán → ngầm định
  P->>L: bút toán (Nợ = Có, kỳ còn mở)
  Note over L: trigger CSDL: chỉ thêm, cân Nợ = Có, chặn TRUNCATE
  L->>X: cập nhật sổ phụ trong CÙNG giao dịch
  L->>V: audit_logs (chuỗi băm) · sự kiện bizcity.ledger.entry.posted
  Note over E,L: sửa chứng từ = phiên bản mới → đảo bút toán cũ + ghi bút toán mới (không UPDATE sổ)
```

Bốn câu không thương lượng ([AGENTS.md](../../AGENTS.md)):
1. Không sự việc thì không bút toán.
2. Sổ chỉ thêm.
3. Một cửa vào sổ.
4. Không viết số tài khoản trong code định khoản.

## 4. Module tương lai phát triển trên Kernel thế nào

Mọi module nghiệp vụ, từ bán hàng tới sản xuất, đi **một khuôn**:

1. Dữ liệu riêng ở bảng `mod_<key>.*`.
2. Danh mục dùng chung (khách, mặt hàng, chi nhánh, nhân viên) ở `packages/data`.
3. Khi có **tiền** thì nộp sự việc `docType` + `reasonCode` vào Kernel. Kernel định khoản theo gói định khoản của ngành.
4. Đọc số liệu kế toán qua `ctx.ledger.query`, không JOIN bảng sổ.

```mermaid
flowchart LR
  subgraph Modules["Module (cài / gỡ được)"]
    BH["ban-hang<br/>đơn, giá, khuyến mãi"]
    MH["mua-hang<br/>đề nghị, đơn mua, NCC"]
    KHO["kho<br/>nhập xuất, kiểm kê"]
    NS["nhan-su<br/>chấm công, lương, BHXH, TNCN"]
    SX["san-xuat (MRP)<br/>định mức, lệnh SX, giá thành"]
    DA["du-an / hop-dong<br/>hợp đồng, tiến độ, thu theo kỳ"]
    TS["tai-san<br/>tăng, khấu hao"]
    CRM["crm<br/>khách tiềm năng — không chạm sổ"]
  end
  subgraph Kernel["Kernel: một cửa sổ cái"]
    IN["ctx.ledger.submit<br/>docType + reasonCode"]
    PACK["Gói định khoản theo ngành<br/>(bizcity_posting_template@1)"]
    LED["Sổ cái + sổ phụ"]
    Q["ctx.ledger.query"]
  end
  BH -->|"sale, sale_return, customer_payment"| IN
  MH -->|"purchase, purchase_return, supplier_payment"| IN
  KHO -->|"transfer, stock_adjustment"| IN
  NS -->|"payroll (planned)"| IN
  SX -->|"production (planned)"| IN
  DA -->|"customer_payment + chiều dự án / hợp đồng"| IN
  TS -->|"depreciation (sau 2.1)"| IN
  PACK --> IN --> LED --> Q
  Q --> BH & MH & NS & SX & DA
  CRM -.->|"chỉ danh mục chuẩn (packages/data)"| BH
```

| Module | Nộp vào sổ (`docType`) | Kernel cần có | Gói định khoản | Trạng thái |
|---|---|---|---|---|
| `ban-hang` | `sale`, `sale_return`, `customer_payment` | có sẵn; `sales_lines` là projection của Kernel (ADR-0004) | thương mại, dịch vụ | đang chạy (phân hệ) |
| `mua-hang` | `purchase`, `purchase_return`, `supplier_payment` | có sẵn | thương mại | đang chạy; gỡ nợ A-17 |
| `kho` | `transfer`, `stock_adjustment` | giá vốn ở Kernel (sổ phụ kho) | mọi ngành có hàng | đang chạy |
| `hop-dong` / `du-an` | `customer_payment`, `supplier_payment` + chiều `contract` / `project` | `ledger.query` theo chiều phân tích | dịch vụ, xây dựng | ca chuẩn ([GOLDEN-CASE](../standard/GOLDEN-CASE-HOP-DONG.md)) |
| `tai-san` | khấu hao | `eventStore.commit()` (PHASES 2.1) để khấu hao đi một cửa | mọi ngành | đang chạy, nợ A-01 |
| `nhan-su` (lương) | `payroll` | năng lực `ledger.doctype.payroll` (planned): lương, BHXH, TNCN theo lý do | HRM | đề xuất |
| `san-xuat` | `production` (xuất NVL 621, nhân công 622, SXC 627, nhập thành phẩm) | `ledger.doctype.production` + giá thành dở dang ở sổ phụ kho | sản xuất | đề xuất |
| `xuat-nhap-khau` | như mua / bán, có ngoại tệ | `ledger.fx` (planned): tỉ giá, chênh lệch | XNK | đề xuất |
| `crm` | — (không chạm sổ) | chỉ `packages/data` (ADR-0005) | — | đề xuất |

**Thêm một loại nghiệp vụ có tiền mới** (ví dụ lương):
1. Đề xuất năng lực `ledger.doctype.<x>` theo [VERSIONING §5](../standard/VERSIONING.md).
2. Kernel thêm khuôn sự việc + luật định khoản (mức K1, RULE-KERNEL).
3. Gói định khoản của ngành thêm lý do.
4. Module nộp `docType` mới.

Module **không bao giờ** tự ghi bút toán hay viết số tài khoản.

## 5. AI ghi sổ an toàn (MCP, xác nhận trước khi ghi)

```mermaid
sequenceDiagram
  participant N as Người dùng
  participant C as Cell / AI client
  participant M as POST /mcp (Core)
  participant A as Runtime action
  N->>C: "Lập phiếu chi tiền điện 3,2 triệu"
  C->>M: tools/call quy.payment_request.create (không confirm_token)
  M->>A: chạy thử (dry-run) trong giao dịch rồi huỷ
  M-->>C: needs_confirmation + preview + confirm_token (900 s, một lần)
  C->>N: đọc bản xem trước
  N->>C: "Đồng ý"
  C->>M: cùng tham số + confirm_token + idempotency_key
  M->>A: ghi thật (Idempotency-Key = mcp:<token>)
  A-->>M: kết quả + biên nhận (actor_kind = ai, via = mcp:<client>)
  M-->>C: done + meta.receipt
```

## 6. Triển khai và quan sát

```mermaid
flowchart LR
  subgraph Compose["docker compose (bản cài)"]
    NG["web: nginx<br/>/ → SPA · /api/ · /mcp → api"]
    APIc["api: Node<br/>/metrics (nội bộ)"]
    MIG["db-migrate (job)"]
    PG[("db: PostgreSQL 16")]
  end
  subgraph Mon["infrastructure/monitoring (tuỳ chọn)"]
    PR["Prometheus + 8 cảnh báo"]
    AM["Alertmanager"]
    GR["Grafana: 6 dashboard"]
    LO["Loki + Promtail"]
    EX["postgres-exporter · node-exporter · cAdvisor"]
  end
  NG --> APIc --> PG
  MIG --> PG
  PR -->|scrape| APIc & EX
  EX --> PG
  LO -->|"log container"| APIc
  PR --> AM
  GR --> PR & LO
```

Chi tiết: [OBSERVABILITY.md](../ops/OBSERVABILITY.md), [DEPLOY.md](../ops/DEPLOY.md), [infrastructure/monitoring/README.md](../../infrastructure/monitoring/README.md).
