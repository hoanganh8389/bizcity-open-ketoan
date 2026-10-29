-- =============================================================================
-- 0002 — Danh mục: hệ thống tài khoản, đối tượng (khách hàng / nhà cung cấp), mặt hàng, đơn vị tính, bảng giá, phân loại hàng, chiều phân tích, ngân hàng, loại thuế, hình thức thanh toán, kế hoạch tiền, định mức.
-- Bảng / bảng ảo: accounts, bank_accounts, cash_plans, catalog_tombstones, contract_schedules, cost_norms, dimensions, item_classes, partner_groups, partners, payment_methods, price_list_branches, price_lists, product_prices, product_units, products, tax_codes.
--
-- Cấu trúc nền (23/10/2026) gộp từ 67 migration lịch sử, chia theo mảng — xem db/README.md. Cơ sở dữ liệu đang chạy
-- (đã áp đủ migration cũ tới 0067) không chạy lại các file nền này. Thay đổi mới: thêm file kế tiếp, không sửa file nền.
-- Khoá ngoại / bảng ảo / trigger tham chiếu bảng ở mảng sau nằm ở file của mảng sau.
-- =============================================================================

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    name_en text,
    parent_code text,
    level smallint DEFAULT 1 NOT NULL,
    normal_side text DEFAULT 'debit'::text NOT NULL,
    is_posting boolean DEFAULT true NOT NULL,
    track_partner boolean DEFAULT false NOT NULL,
    track_cost_item boolean DEFAULT false NOT NULL,
    track_department boolean DEFAULT false NOT NULL,
    track_contract boolean DEFAULT false NOT NULL,
    track_employee boolean DEFAULT false NOT NULL,
    track_cashflow boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    track_case boolean DEFAULT false NOT NULL,
    track_project boolean DEFAULT false NOT NULL,
    track_capital_source boolean DEFAULT false NOT NULL,
    is_foreign_currency boolean DEFAULT false NOT NULL,
    track_product boolean DEFAULT false NOT NULL,
    track_internal_debt boolean DEFAULT false NOT NULL,
    is_vat boolean DEFAULT false NOT NULL,
    is_debt boolean DEFAULT false NOT NULL,
    is_loan boolean DEFAULT false NOT NULL,
    always_increase boolean DEFAULT false NOT NULL,
    is_ledger boolean DEFAULT false NOT NULL,
    is_cost boolean DEFAULT false NOT NULL,
    CONSTRAINT accounts_normal_side_check CHECK ((normal_side = ANY (ARRAY['debit'::text, 'credit'::text, 'both'::text])))
);

--
-- Name: TABLE accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.accounts IS 'Hệ thống tài khoản. Chỉ tài khoản is_posting = true được ghi sổ.';

--
-- Name: COLUMN accounts.normal_side; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.normal_side IS 'Bên số dư thông thường; both = lưỡng tính (131, 331): dư Nợ, dư Có tách theo đối tượng.';

--
-- Name: COLUMN accounts.track_partner; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.track_partner IS 'Bắt buộc và theo dõi số dư theo đối tượng.';

--
-- Name: COLUMN accounts.track_case; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.track_case IS 'Theo dõi theo vụ việc: dòng phiếu dùng tài khoản này phải chọn vụ việc.';

--
-- Name: COLUMN accounts.track_project; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.track_project IS 'Theo dõi theo dự án.';

--
-- Name: COLUMN accounts.track_capital_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.track_capital_source IS 'Theo dõi theo nguồn vốn.';

--
-- Name: COLUMN accounts.is_foreign_currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.is_foreign_currency IS 'Có hạch toán ngoại tệ';

--
-- Name: COLUMN accounts.track_product; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.track_product IS 'Theo dõi chi tiết theo sản phẩm';

--
-- Name: COLUMN accounts.track_internal_debt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.track_internal_debt IS 'Tài khoản công nợ nội bộ (giữa các đơn vị)';

--
-- Name: COLUMN accounts.is_vat; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.is_vat IS 'Là tài khoản thuế GTGT';

--
-- Name: COLUMN accounts.is_debt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.is_debt IS 'Có ghi nhận công nợ';

--
-- Name: COLUMN accounts.is_loan; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.is_loan IS 'Tài khoản vay';

--
-- Name: COLUMN accounts.always_increase; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.always_increase IS 'Tài sản (luôn tăng): số dư chỉ hiện một bên';

--
-- Name: COLUMN accounts.is_ledger; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.is_ledger IS 'In sổ cái';

--
-- Name: COLUMN accounts.is_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.is_cost IS 'Tài khoản giá thành';

--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.accounts ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code text NOT NULL,
    bank_name text NOT NULL,
    bank_branch text DEFAULT ''::text NOT NULL,
    account_no text NOT NULL,
    holder text DEFAULT ''::text NOT NULL,
    account_code text NOT NULL,
    branch_code text,
    currency text DEFAULT 'VND'::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    bank_address text DEFAULT ''::text NOT NULL,
    bank_phone text DEFAULT ''::text NOT NULL,
    contact text DEFAULT ''::text NOT NULL
);

--
-- Name: TABLE bank_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bank_accounts IS 'Tài khoản ngân hàng của đơn vị: ngân hàng, chi nhánh, số tài khoản, chủ tài khoản, tài khoản kế toán 112 chi tiết gắn kèm.';

--
-- Name: COLUMN bank_accounts.account_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bank_accounts.account_code IS 'Tài khoản kế toán (112 chi tiết). Mỗi tài khoản kế toán chỉ gắn một tài khoản ngân hàng đang dùng.';

--
-- Name: COLUMN bank_accounts.branch_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bank_accounts.branch_code IS 'Chi nhánh thường dùng tài khoản này (để gợi ý); trống = dùng chung.';

--
-- Name: COLUMN bank_accounts.contact; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bank_accounts.contact IS 'Người liên hệ ở ngân hàng (giao dịch viên, chuyên viên quan hệ khách hàng).';

--
-- Name: bank_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.bank_accounts ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.bank_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: cash_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_plans (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    period text NOT NULL,
    branch_id bigint,
    direction text NOT NULL,
    cost_item_code text,
    partner_id bigint,
    due_date date,
    description text DEFAULT ''::text NOT NULL,
    amount numeric(18,2) NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    source_ref text,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_plans_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT cash_plans_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT cash_plans_period_check CHECK ((period ~ '^\d{4}-\d{2}$'::text)),
    CONSTRAINT cash_plans_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'debt'::text, 'contract'::text])))
);

--
-- Name: TABLE cash_plans; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cash_plans IS 'Kế hoạch thu / chi theo tháng, chi nhánh: nhập tay hoặc điền từ khoản công nợ đến hạn, lịch thanh toán hợp đồng.';

--
-- Name: COLUMN cash_plans.source_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cash_plans.source_ref IS 'debt:<debt_items.id> hoặc contract:<contract_schedules.id>; điền lại thì cập nhật dòng cũ.';

--
-- Name: cash_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cash_plans ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.cash_plans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: catalog_tombstones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_tombstones (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    entity text NOT NULL,
    key text NOT NULL,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT catalog_tombstones_entity_check CHECK ((entity = ANY (ARRAY['product'::text, 'unit'::text, 'price'::text, 'price_list'::text, 'group'::text])))
);

--
-- Name: TABLE catalog_tombstones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.catalog_tombstones IS 'Mục danh mục hàng đã xoá — luồng thay đổi (catalog/feed) báo cho hệ thống bán hàng xoá theo. key: sku | sku|unit | list|sku|unit | list | groupCode.';

--
-- Name: catalog_tombstones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.catalog_tombstones ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.catalog_tombstones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: contract_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_schedules (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    contract_code text NOT NULL,
    seq integer NOT NULL,
    due_date date NOT NULL,
    amount numeric(18,2) NOT NULL,
    tax_amount numeric(18,2) DEFAULT 0 NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_date date,
    paid_ref text DEFAULT ''::text NOT NULL,
    updated_by text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contract_schedules_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT contract_schedules_seq_check CHECK ((seq > 0)),
    CONSTRAINT contract_schedules_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text]))),
    CONSTRAINT contract_schedules_tax_amount_check CHECK ((tax_amount >= (0)::numeric))
);

--
-- Name: TABLE contract_schedules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contract_schedules IS 'Lịch thanh toán theo hợp đồng: kỳ, ngày đến hạn, số tiền, thuế nộp thay (thuê nhà), trạng thái đã trả / chưa trả.';

--
-- Name: COLUMN contract_schedules.tax_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contract_schedules.tax_amount IS 'Thuế đơn vị nộp thay bên cho thuê (thuế GTGT, TNCN của chủ nhà) hoặc khoản thuế khác đi kèm kỳ thanh toán.';

--
-- Name: COLUMN contract_schedules.paid_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contract_schedules.paid_ref IS 'Số phiếu chi / uỷ nhiệm chi đã trả kỳ này.';

--
-- Name: contract_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.contract_schedules ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.contract_schedules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: cost_norms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cost_norms (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    period text NOT NULL,
    branch_id bigint,
    cost_item_code text NOT NULL,
    amount numeric(18,2) NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    department_code text,
    CONSTRAINT cost_norms_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT cost_norms_period_check CHECK ((period ~ '^\d{4}-\d{2}$'::text))
);

--
-- Name: TABLE cost_norms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cost_norms IS 'Định mức chi phí theo tháng × chi nhánh (trống = cả công ty) × bộ phận (trống = mọi bộ phận) × khoản mục.';

--
-- Name: COLUMN cost_norms.department_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_norms.department_code IS 'Mã bộ phận (danh mục Bộ phận); trống = mọi bộ phận.';

--
-- Name: cost_norms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cost_norms ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.cost_norms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: dimensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dimensions (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    kind text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    parent_code text,
    note text DEFAULT ''::text NOT NULL,
    extra jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT dimensions_kind_check CHECK ((kind = ANY (ARRAY['cost_item'::text, 'department'::text, 'contract'::text, 'employee'::text, 'case'::text, 'project'::text, 'capital_source'::text, 'tool_group'::text, 'usage_purpose'::text])))
);

--
-- Name: TABLE dimensions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dimensions IS 'Danh mục chiều phân tích: khoản mục, bộ phận, hợp đồng, nhân viên, vụ việc, dự án, nguồn vốn (phân biệt bằng kind).';

--
-- Name: dimensions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.dimensions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.dimensions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: item_classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_classes (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    kind text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    parent_code text,
    is_active boolean DEFAULT true NOT NULL,
    sku_code text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_classes_kind_check CHECK ((kind = ANY (ARRAY['brand'::text, 'industry'::text, 'group'::text, 'type'::text])))
);

--
-- Name: TABLE item_classes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.item_classes IS 'Phân loại hàng hoá: nhãn hàng (brand), ngành hàng (industry), nhóm hàng (group), loại hàng (type).';

--
-- Name: COLUMN item_classes.sku_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.item_classes.sku_code IS 'Mã ghép dùng sinh mã hàng: mã hàng = sku_code nhóm cấp 1 + cấp 2 + cấp 3 + số thứ tự.';

--
-- Name: item_classes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.item_classes ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.item_classes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: partner_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_groups (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    parent_code text,
    kind text DEFAULT 'any'::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT partner_groups_kind_check CHECK ((kind = ANY (ARRAY['customer'::text, 'supplier'::text, 'employee'::text, 'internal'::text, 'other'::text, 'any'::text])))
);

--
-- Name: TABLE partner_groups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.partner_groups IS 'Nhóm đối tượng (khách lẻ, khách buôn, NCC hàng hoá, NCC tài sản / dịch vụ, chủ nhà…) để lọc, gom báo cáo theo nhóm.';

--
-- Name: COLUMN partner_groups.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partner_groups.kind IS 'Nhóm dành cho loại đối tượng nào (any = mọi loại); chỉ để gợi ý khi chọn.';

--
-- Name: partner_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.partner_groups ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.partner_groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partners (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    kind text DEFAULT 'customer'::text NOT NULL,
    tax_code text,
    address text,
    email text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    group_code text,
    is_active boolean DEFAULT true NOT NULL,
    payment_term_days integer,
    credit_limit numeric(18,2),
    note text DEFAULT ''::text NOT NULL,
    contact_name text DEFAULT ''::text NOT NULL,
    bank_account_no text DEFAULT ''::text NOT NULL,
    bank_account_holder text DEFAULT ''::text NOT NULL,
    bank_name text DEFAULT ''::text NOT NULL,
    max_open_docs integer,
    mobile text DEFAULT ''::text NOT NULL,
    fax text DEFAULT ''::text NOT NULL,
    website text DEFAULT ''::text NOT NULL,
    "position" text DEFAULT ''::text NOT NULL,
    company_name text DEFAULT ''::text NOT NULL,
    company_address text DEFAULT ''::text NOT NULL,
    short_name text DEFAULT ''::text NOT NULL,
    manager_code text,
    branch_code text,
    created_by text DEFAULT ''::text NOT NULL,
    birth_date date,
    gender text DEFAULT ''::text NOT NULL,
    alias text DEFAULT ''::text NOT NULL,
    is_prospect boolean DEFAULT false NOT NULL,
    customer_type text DEFAULT ''::text NOT NULL,
    CONSTRAINT partners_credit_limit_check CHECK ((credit_limit >= (0)::numeric)),
    CONSTRAINT partners_customer_type_check CHECK ((customer_type = ANY (ARRAY[''::text, 'personal'::text, 'business'::text]))),
    CONSTRAINT partners_gender_check CHECK ((gender = ANY (ARRAY[''::text, 'male'::text, 'female'::text]))),
    CONSTRAINT partners_kind_check CHECK ((kind = ANY (ARRAY['customer'::text, 'supplier'::text, 'employee'::text, 'internal'::text, 'other'::text]))),
    CONSTRAINT partners_max_open_docs_check CHECK ((max_open_docs >= 0)),
    CONSTRAINT partners_payment_term_days_check CHECK ((payment_term_days >= 0))
);

--
-- Name: TABLE partners; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.partners IS 'Đối tượng công nợ. Tự tạo/cập nhật khi chứng từ gửi kèm thông tin đối tượng.';

--
-- Name: COLUMN partners.phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.phone IS 'Điện thoại cố định (Telephone).';

--
-- Name: COLUMN partners.group_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.group_code IS 'Mã nhóm đối tượng (partner_groups.code).';

--
-- Name: COLUMN partners.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.is_active IS 'false = đã khoá: không chọn được trên phiếu mới; chứng từ gửi qua API vẫn nhận.';

--
-- Name: COLUMN partners.payment_term_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.payment_term_days IS 'Hạn thanh toán (số ngày được nợ) riêng của đối tượng; trống = dùng hạn chung trên báo cáo.';

--
-- Name: COLUMN partners.credit_limit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.credit_limit IS 'Hạn mức nợ; trống = không giới hạn.';

--
-- Name: COLUMN partners.contact_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.contact_name IS 'Người đại diện.';

--
-- Name: COLUMN partners.bank_account_no; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.bank_account_no IS 'Số tài khoản ngân hàng của đối tượng (in uỷ nhiệm chi, đối chiếu chuyển khoản).';

--
-- Name: COLUMN partners.bank_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.bank_name IS 'Ngân hàng, chi nhánh nơi đối tượng mở tài khoản.';

--
-- Name: COLUMN partners.max_open_docs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.max_open_docs IS 'Giới hạn số phiếu còn nợ; trống = không giới hạn.';

--
-- Name: COLUMN partners.mobile; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.mobile IS 'Di động.';

--
-- Name: COLUMN partners."position"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners."position" IS 'Chức vụ của người đại diện.';

--
-- Name: COLUMN partners.company_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.company_name IS 'Tên công ty (in hoá đơn).';

--
-- Name: COLUMN partners.company_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.company_address IS 'Địa chỉ công ty; address là địa chỉ nơi ở / giao dịch.';

--
-- Name: COLUMN partners.short_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.short_name IS 'Tên viết tắt.';

--
-- Name: COLUMN partners.manager_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.manager_code IS 'Mã nhân viên quản lý (danh mục Nhân viên).';

--
-- Name: COLUMN partners.branch_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.branch_code IS 'Mã chi nhánh quản lý.';

--
-- Name: COLUMN partners.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.created_by IS 'Người tạo.';

--
-- Name: partners_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.partners ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.partners_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_methods (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    account_code text NOT NULL,
    is_receivable boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    bank_account_code text,
    note text DEFAULT ''::text NOT NULL,
    sort_order integer,
    discount_rate numeric(6,2),
    partner_code text
);

--
-- Name: TABLE payment_methods; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment_methods IS 'Hình thức thanh toán (tiền mặt, chuyển khoản, QR, thẻ...). is_receivable = ghi nợ, không thu tiền.';

--
-- Name: COLUMN payment_methods.bank_account_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_methods.bank_account_code IS 'Tài khoản ngân hàng nhận / chi tiền của hình thức này (chuyển khoản, QR, quẹt thẻ); tài khoản kế toán lấy theo tài khoản ngân hàng.';

--
-- Name: COLUMN payment_methods.discount_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_methods.discount_rate IS 'Tỉ lệ chiết khấu của hình thức (%).';

--
-- Name: COLUMN payment_methods.partner_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_methods.partner_code IS 'Đối tượng nhận tiền hộ (mã đối tượng). Có thì dòng thu/trả tiền gắn đối tượng này ở phía tài khoản của hình thức, thay cho khách.';

--
-- Name: payment_methods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payment_methods ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.payment_methods_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: price_list_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_list_branches (
    tenant_id bigint NOT NULL,
    branch_code text NOT NULL,
    price_list_code text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE price_list_branches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.price_list_branches IS 'Chi nhánh áp bảng giá nào (mỗi chi nhánh một bảng giá). Chưa gán = theo bảng giá công ty.';

--
-- Name: price_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_lists (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    is_company boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE price_lists; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.price_lists IS 'Bảng giá bán. Đúng một bảng giá công ty (is_company); còn lại là bảng giá chi nhánh / kênh.';

--
-- Name: price_lists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.price_lists ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.price_lists_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: product_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_prices (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    price_list_code text NOT NULL,
    sku text NOT NULL,
    unit text NOT NULL,
    price numeric(18,2),
    is_default_unit boolean DEFAULT false NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE product_prices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_prices IS 'Giá bán (đã gồm thuế) theo bảng giá × mặt hàng × đơn vị tính. Trống = chưa khai giá.';

--
-- Name: COLUMN product_prices.is_default_unit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_prices.is_default_unit IS 'Đơn vị bán chính riêng của bảng giá này (khác đơn vị bán chính của mặt hàng).';

--
-- Name: product_prices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.product_prices ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.product_prices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: product_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_units (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    sku text NOT NULL,
    unit text NOT NULL,
    ratio numeric(18,6) DEFAULT 1 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    weight_kg numeric(15,3),
    note text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_units_ratio_check CHECK ((ratio > (0)::numeric))
);

--
-- Name: TABLE product_units; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_units IS 'Đơn vị tính của mặt hàng: 1 đơn vị này = ratio đơn vị nhỏ nhất (đơn vị nhỏ nhất có ratio = 1).';

--
-- Name: COLUMN product_units.is_default; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_units.is_default IS 'Đơn vị bán chính (mặc định chọn khi bán).';

--
-- Name: product_units_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.product_units ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.product_units_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    sku text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    unit text DEFAULT ''::text NOT NULL,
    posting_group_code text,
    tax_out_code text,
    tax_in_code text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    brand_code text,
    industry_code text,
    group_code text,
    type_code text,
    is_active boolean DEFAULT true NOT NULL,
    source_system text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    excise_rate numeric(6,2),
    barcode text DEFAULT ''::text NOT NULL,
    image_url text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    weight_kg numeric(15,3),
    origin text DEFAULT ''::text NOT NULL,
    is_main boolean DEFAULT false NOT NULL,
    is_under_24m boolean DEFAULT false NOT NULL,
    no_sale boolean DEFAULT false NOT NULL,
    export_adjust boolean DEFAULT false NOT NULL,
    is_kct boolean DEFAULT false NOT NULL,
    track_identifier boolean DEFAULT false NOT NULL
);

--
-- Name: TABLE products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.products IS 'Mặt hàng. Không có nhóm hạch toán thì dùng nhóm mặc định.';

--
-- Name: COLUMN products.brand_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.brand_code IS 'Nhãn hàng (item_classes kind = brand).';

--
-- Name: COLUMN products.industry_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.industry_code IS 'Ngành hàng (item_classes kind = industry).';

--
-- Name: COLUMN products.group_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.group_code IS 'Nhóm hàng (item_classes kind = group).';

--
-- Name: COLUMN products.type_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.type_code IS 'Loại hàng (item_classes kind = type).';

--
-- Name: COLUMN products.source_system; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.source_system IS 'Nơi tạo mặt hàng: tên hệ thống đồng bộ, "document" (tự thêm từ chứng từ) hoặc "manual".';

--
-- Name: COLUMN products.note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.note IS 'Ghi chú của mặt hàng (ví dụ mã cũ).';

--
-- Name: COLUMN products.excise_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.excise_rate IS 'Thuế suất tiêu thụ đặc biệt (%); trống = không chịu.';

--
-- Name: COLUMN products.barcode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.barcode IS 'Barcode nhà sản xuất; nhiều mã cách nhau dấu /.';

--
-- Name: COLUMN products.is_main; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.is_main IS 'Hàng chính: bán theo giá bảng giá công ty, không lấy giá chi nhánh.';

--
-- Name: COLUMN products.is_under_24m; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.is_under_24m IS 'Sữa cho trẻ dưới 24 tháng (Luật thuế): cấm mọi chương trình khuyến mại.';

--
-- Name: COLUMN products.no_sale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.no_sale IS 'Không được bán (vật tư chỉ nhập).';

--
-- Name: COLUMN products.export_adjust; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.export_adjust IS 'Được xuất điều chỉnh dù vẫn bán (BIT1).';

--
-- Name: COLUMN products.is_kct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.is_kct IS 'Không chịu thuế GTGT (KCT) — khác thuế suất 0%.';

--
-- Name: COLUMN products.track_identifier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.track_identifier IS 'Theo dõi mã định danh (lô / từng sản phẩm) khi nhập xuất.';

--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.products ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: tax_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_codes (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    rate numeric(6,3) DEFAULT 0 NOT NULL,
    direction text NOT NULL,
    account_code text,
    report_group text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT tax_codes_direction_check CHECK ((direction = ANY (ARRAY['output'::text, 'input'::text])))
);

--
-- Name: TABLE tax_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tax_codes IS 'Loại thuế: thuế suất, tài khoản thuế, nhóm trên bảng kê (KCT, 0, 5, 8, 10...).';

--
-- Name: COLUMN tax_codes.report_group; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_codes.report_group IS 'Nhóm hiển thị trên bảng kê: KCT | 0 | 5 | 8 | 10 | KKK (không kê khai).';

--
-- Name: tax_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tax_codes ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.tax_codes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);

--
-- Name: accounts accounts_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_tenant_id_code_key UNIQUE (tenant_id, code);

--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);

--
-- Name: bank_accounts bank_accounts_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_tenant_id_code_key UNIQUE (tenant_id, code);

--
-- Name: cash_plans cash_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_plans
    ADD CONSTRAINT cash_plans_pkey PRIMARY KEY (id);

--
-- Name: catalog_tombstones catalog_tombstones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_tombstones
    ADD CONSTRAINT catalog_tombstones_pkey PRIMARY KEY (id);

--
-- Name: contract_schedules contract_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_schedules
    ADD CONSTRAINT contract_schedules_pkey PRIMARY KEY (id);

--
-- Name: contract_schedules contract_schedules_tenant_id_contract_code_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_schedules
    ADD CONSTRAINT contract_schedules_tenant_id_contract_code_seq_key UNIQUE (tenant_id, contract_code, seq);

--
-- Name: cost_norms cost_norms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_norms
    ADD CONSTRAINT cost_norms_pkey PRIMARY KEY (id);

--
-- Name: dimensions dimensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimensions
    ADD CONSTRAINT dimensions_pkey PRIMARY KEY (id);

--
-- Name: dimensions dimensions_tenant_id_kind_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimensions
    ADD CONSTRAINT dimensions_tenant_id_kind_code_key UNIQUE (tenant_id, kind, code);

--
-- Name: item_classes item_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_classes
    ADD CONSTRAINT item_classes_pkey PRIMARY KEY (id);

--
-- Name: item_classes item_classes_tenant_id_kind_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_classes
    ADD CONSTRAINT item_classes_tenant_id_kind_code_key UNIQUE (tenant_id, kind, code);

--
-- Name: partner_groups partner_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_groups
    ADD CONSTRAINT partner_groups_pkey PRIMARY KEY (id);

--
-- Name: partner_groups partner_groups_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_groups
    ADD CONSTRAINT partner_groups_tenant_id_code_key UNIQUE (tenant_id, code);

--
-- Name: partners partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);

--
-- Name: partners partners_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_tenant_id_code_key UNIQUE (tenant_id, code);

--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);

--
-- Name: payment_methods payment_methods_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_tenant_id_code_key UNIQUE (tenant_id, code);

--
-- Name: price_list_branches price_list_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list_branches
    ADD CONSTRAINT price_list_branches_pkey PRIMARY KEY (tenant_id, branch_code);

--
-- Name: price_lists price_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_pkey PRIMARY KEY (id);

--
-- Name: price_lists price_lists_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_tenant_id_code_key UNIQUE (tenant_id, code);

--
-- Name: product_prices product_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_pkey PRIMARY KEY (id);

--
-- Name: product_prices product_prices_tenant_id_price_list_code_sku_unit_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_tenant_id_price_list_code_sku_unit_key UNIQUE (tenant_id, price_list_code, sku, unit);

--
-- Name: product_units product_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_pkey PRIMARY KEY (id);

--
-- Name: product_units product_units_tenant_id_sku_unit_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_tenant_id_sku_unit_key UNIQUE (tenant_id, sku, unit);

--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);

--
-- Name: products products_tenant_id_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_sku_key UNIQUE (tenant_id, sku);

--
-- Name: tax_codes tax_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_codes
    ADD CONSTRAINT tax_codes_pkey PRIMARY KEY (id);

--
-- Name: tax_codes tax_codes_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_codes
    ADD CONSTRAINT tax_codes_tenant_id_code_key UNIQUE (tenant_id, code);

--
-- Name: accounts_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_parent ON public.accounts USING btree (tenant_id, parent_code);

--
-- Name: bank_accounts_gl_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bank_accounts_gl_active ON public.bank_accounts USING btree (tenant_id, account_code) WHERE is_active;

--
-- Name: cash_plans_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_plans_period ON public.cash_plans USING btree (tenant_id, period);

--
-- Name: cash_plans_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_plans_source ON public.cash_plans USING btree (tenant_id, source_ref) WHERE (source_ref IS NOT NULL);

--
-- Name: catalog_tombstones_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_tombstones_idx ON public.catalog_tombstones USING btree (tenant_id, deleted_at);

--
-- Name: contract_schedules_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contract_schedules_due ON public.contract_schedules USING btree (tenant_id, status, due_date);

--
-- Name: cost_norms_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cost_norms_key ON public.cost_norms USING btree (tenant_id, period, COALESCE(branch_id, (0)::bigint), COALESCE(department_code, ''::text), cost_item_code);

--
-- Name: partners_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partners_group ON public.partners USING btree (tenant_id, group_code) WHERE (group_code IS NOT NULL);

--
-- Name: partners_mobile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partners_mobile ON public.partners USING btree (tenant_id, mobile) WHERE (mobile <> ''::text);

--
-- Name: partners_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partners_name ON public.partners USING btree (tenant_id, lower(name));

--
-- Name: partners_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partners_phone ON public.partners USING btree (tenant_id, phone) WHERE (phone IS NOT NULL);

--
-- Name: partners_tax_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partners_tax_code ON public.partners USING btree (tenant_id, tax_code) WHERE (tax_code IS NOT NULL);

--
-- Name: price_lists_one_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX price_lists_one_company ON public.price_lists USING btree (tenant_id) WHERE is_company;

--
-- Name: product_prices_sku_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_prices_sku_idx ON public.product_prices USING btree (tenant_id, sku);

--
-- Name: product_prices_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_prices_updated_idx ON public.product_prices USING btree (tenant_id, updated_at);

--
-- Name: product_units_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_units_updated_idx ON public.product_units USING btree (tenant_id, updated_at);

--
-- Name: products_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_updated_idx ON public.products USING btree (tenant_id, updated_at);

--
-- Name: accounts accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: bank_accounts bank_accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: cash_plans cash_plans_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_plans
    ADD CONSTRAINT cash_plans_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

--
-- Name: cash_plans cash_plans_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_plans
    ADD CONSTRAINT cash_plans_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);

--
-- Name: cash_plans cash_plans_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_plans
    ADD CONSTRAINT cash_plans_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: catalog_tombstones catalog_tombstones_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_tombstones
    ADD CONSTRAINT catalog_tombstones_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: contract_schedules contract_schedules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_schedules
    ADD CONSTRAINT contract_schedules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: cost_norms cost_norms_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_norms
    ADD CONSTRAINT cost_norms_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

--
-- Name: cost_norms cost_norms_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_norms
    ADD CONSTRAINT cost_norms_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: dimensions dimensions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimensions
    ADD CONSTRAINT dimensions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: item_classes item_classes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_classes
    ADD CONSTRAINT item_classes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: partner_groups partner_groups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_groups
    ADD CONSTRAINT partner_groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: partners partners_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: payment_methods payment_methods_tenant_id_account_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_tenant_id_account_code_fkey FOREIGN KEY (tenant_id, account_code) REFERENCES public.accounts(tenant_id, code);

--
-- Name: payment_methods payment_methods_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: price_list_branches price_list_branches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list_branches
    ADD CONSTRAINT price_list_branches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: price_lists price_lists_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: product_prices product_prices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: product_units product_units_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: products products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

--
-- Name: tax_codes tax_codes_tenant_id_account_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_codes
    ADD CONSTRAINT tax_codes_tenant_id_account_code_fkey FOREIGN KEY (tenant_id, account_code) REFERENCES public.accounts(tenant_id, code);

--
-- Name: tax_codes tax_codes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_codes
    ADD CONSTRAINT tax_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
