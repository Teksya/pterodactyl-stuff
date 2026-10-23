export type Scope = 'admin' | 'server' | 'account';
export type Severity = 'info' | 'success' | 'warning' | 'danger';
export type DeliveryStatus = 'pending' | 'success' | 'failed' | 'skipped';

/** What the server sends back in place of a stored secret; sending it back keeps the secret. */
export const MASK = '********';

export interface FieldSpec {
    key: string;
    label: string;
    type: 'url' | 'text' | 'textarea' | 'select' | 'toggle' | 'headers';
    required: boolean;
    secret: boolean;
    help: string;
    placeholder: string;
    options: { value: string; label: string }[];
    default: unknown;
}

export interface ProviderSpec {
    id: string;
    label: string;
    description: string;
    fields: FieldSpec[];
}

export interface EventSpec {
    key: string;
    label: string;
    severity: Severity;
}

export interface EventGroup {
    id: string;
    label: string;
    events: EventSpec[];
}

export interface Meta {
    scope: Scope;
    providers: ProviderSpec[];
    groups: EventGroup[];
    limit: number | null;
    count: number;
    private_targets: boolean;
    monitor: boolean;
    monitor_interval: number;
    enabled: boolean;
    can_manage: boolean;
    /** Server subusers without the panel's activity permission see the log, not what deliveries carried. */
    can_read_payloads: boolean;
}

export interface Filters {
    servers: number[];
    nodes: number[];
}

export interface Endpoint {
    id: number;
    uuid: string;
    scope: Scope;
    server_id: number | null;
    user_id: number | null;
    name: string;
    provider: string;
    config: Record<string, unknown>;
    target: string;
    events: string[];
    filters: Filters;
    enabled: boolean;
    failure_count: number;
    disabled_reason: string | null;
    last_delivery_at: string | null;
    last_status: DeliveryStatus | null;
    created_at: string;
    updated_at: string;
    server: { id: number; name: string; identifier: string } | null;
    user: { id: number; username: string } | null;
}

export interface EndpointInput {
    name: string;
    provider: string;
    config: Record<string, unknown>;
    events: string[];
    filters?: Filters;
    enabled: boolean;
}

export interface Delivery {
    id: number;
    uuid: string;
    endpoint_id: number;
    event: string;
    status: DeliveryStatus;
    attempts: number;
    response_status: number | null;
    error: string | null;
    duration_ms: number | null;
    is_test: boolean;
    created_at: string;
    delivered_at: string | null;
    endpoint?: { id: number; name: string; scope: Scope; provider: string };
}

export interface DeliveryDetail extends Delivery {
    payload: Record<string, unknown>;
    response_body: string | null;
}

export interface Page<T> {
    data: T[];
    meta: { page: number; per_page: number; total: number };
}

export interface Targets {
    nodes: { id: number; name: string }[];
    servers: { id: number; name: string; identifier: string; node_id: number }[];
}
