import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button, ContentBox, httpErrorToHuman, Input, Label, Select, Spinner, Switch, TextArea, toast } from '@pterodactyl/sdk';
import { createEndpoint, getMeta, getTargets, metaKey, ROOT_KEY, updateEndpoint, validationErrors, type Context } from './api';
import EventPicker from './EventPicker';
import { MASK, type Endpoint, type FieldSpec, type Filters, type Meta, type ProviderSpec } from './types';

function initialConfig(provider: ProviderSpec | undefined, current?: Record<string, unknown>): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    for (const field of provider?.fields ?? []) {
        config[field.key] = current?.[field.key] ?? field.default ?? (field.type === 'toggle' ? false : '');
    }

    return config;
}

function ConfigField({
    field,
    value,
    error,
    onChange,
}: {
    field: FieldSpec;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
}) {
    const id = `wh-field-${field.key}`;
    const saved = field.secret && value === MASK;
    const text = saved ? '' : typeof value === 'string' ? value : value == null ? '' : String(value);
    const help = saved ? 'Saved. Type a new value to replace it.' : field.help;

    if (field.type === 'toggle') {
        return <Switch id={id} checked={value === true} onChange={onChange} label={field.label} description={field.help || undefined} />;
    }

    return (
        <div>
            <Label htmlFor={id}>
                {field.label}
                {field.required && <span className='wh:text-destructive'> *</span>}
            </Label>
            {field.type === 'select' ? (
                <Select id={id} value={text} options={field.options} onChange={(next) => onChange(String(next))} hasError={!!error} />
            ) : field.type === 'textarea' || field.type === 'headers' ? (
                <TextArea
                    id={id}
                    rows={field.type === 'headers' ? 3 : 6}
                    className='wh:font-mono wh:text-xs'
                    value={text}
                    placeholder={saved ? '••••••••' : field.placeholder}
                    onChange={(event) => onChange(event.target.value)}
                    spellCheck={false}
                />
            ) : (
                <Input
                    id={id}
                    type={field.secret ? 'password' : 'text'}
                    autoComplete='off'
                    value={text}
                    placeholder={saved ? '••••••••' : field.placeholder}
                    onChange={(event) => onChange(event.target.value)}
                    spellCheck={false}
                />
            )}
            {error ? (
                <p role='alert' className='wh:mt-1 wh:text-xs wh:text-destructive'>
                    {error}
                </p>
            ) : (
                help && <p className='wh:mt-1 wh:text-xs wh:text-muted-foreground'>{help}</p>
            )}
        </div>
    );
}

/** Admin endpoints only: limit server events to some nodes or servers. */
function FilterFields({ value, onChange }: { value: Filters; onChange: (filters: Filters) => void }) {
    const { data: targets } = useQuery({ queryKey: [...ROOT_KEY, 'targets'], queryFn: getTargets });

    return (
        <div className='wh:grid wh:grid-cols-1 wh:gap-4 wh:md:grid-cols-2'>
            <div>
                <Label htmlFor='wh-filter-nodes'>Nodes</Label>
                <Select
                    id='wh-filter-nodes'
                    multiple
                    value={value.nodes}
                    placeholder='Every node'
                    options={(targets?.nodes ?? []).map((node) => ({ value: node.id, label: node.name }))}
                    onChange={(nodes) => onChange({ ...value, nodes: nodes.map(Number) })}
                />
            </div>
            <div>
                <Label htmlFor='wh-filter-servers'>Servers</Label>
                <Select
                    id='wh-filter-servers'
                    multiple
                    value={value.servers}
                    placeholder='Every server'
                    options={(targets?.servers ?? []).map((server) => ({ value: server.id, label: `${server.name} (${server.identifier})` }))}
                    onChange={(servers) => onChange({ ...value, servers: servers.map(Number) })}
                />
            </div>
            <p className='wh:text-xs wh:text-muted-foreground wh:md:col-span-2'>
                Server events from these nodes or servers only. Events about no server (users, nodes, eggs…) always go through.
            </p>
        </div>
    );
}

function EditorForm({ context, meta, endpoint, onClose }: { context: Context; meta: Meta; endpoint?: Endpoint; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(endpoint?.name ?? '');
    const [providerId, setProviderId] = useState(endpoint?.provider ?? meta.providers[0]?.id ?? '');
    const provider = meta.providers.find((item) => item.id === providerId);
    const [config, setConfig] = useState<Record<string, unknown>>(() => initialConfig(provider, endpoint?.config));
    const [events, setEvents] = useState<string[]>(endpoint?.events ?? []);
    const [filters, setFilters] = useState<Filters>(endpoint?.filters ?? { servers: [], nodes: [] });
    const [enabled, setEnabled] = useState(endpoint?.enabled ?? true);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);

    const chooseProvider = (id: string) => {
        setProviderId(id);
        // Settings of one service mean nothing to another; only a matching saved one is kept.
        const next = meta.providers.find((item) => item.id === id);
        setConfig(initialConfig(next, id === endpoint?.provider ? endpoint.config : undefined));
        setErrors({});
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setErrors({});

        const input = { name: name.trim(), provider: providerId, config, events, enabled, ...(meta.scope === 'admin' ? { filters } : {}) };
        try {
            if (endpoint) await updateEndpoint(context, endpoint.id, input);
            else await createEndpoint(context, input);
            await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
            toast.success(endpoint ? 'Webhook saved.' : 'Webhook created. Send a test to check it.');
            onClose();
        } catch (error) {
            const fields = validationErrors(error);
            setErrors(fields);
            toast.error(Object.values(fields)[0] ?? httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    const eventsError = errors.events ?? Object.entries(errors).find(([key]) => key.startsWith('events.'))?.[1];

    return (
        <form onSubmit={(event) => void submit(event)} className='wh:flex wh:flex-col wh:gap-6'>
            <div className='wh:flex wh:items-center wh:gap-3'>
                <Button.Text type='button' size='small' onClick={onClose}>
                    <ArrowLeft className='wh:size-4' aria-hidden />
                    Webhooks
                </Button.Text>
                <h2 className='wh:text-lg wh:font-semibold'>{endpoint ? `Edit ${endpoint.name}` : 'New webhook'}</h2>
            </div>

            <ContentBox title='Destination'>
                <div className='wh:flex wh:flex-col wh:gap-4'>
                    <div className='wh:grid wh:grid-cols-1 wh:gap-4 wh:md:grid-cols-2'>
                        <div>
                            <Label htmlFor='wh-name'>
                                Name<span className='wh:text-destructive'> *</span>
                            </Label>
                            <Input id='wh-name' value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder='#alerts on Discord' />
                            {errors.name && <p className='wh:mt-1 wh:text-xs wh:text-destructive'>{errors.name}</p>}
                        </div>
                        <div>
                            <Label htmlFor='wh-provider'>Service</Label>
                            <Select
                                id='wh-provider'
                                value={providerId}
                                options={meta.providers.map((item) => ({ value: item.id, label: item.label }))}
                                onChange={(next) => chooseProvider(String(next))}
                                hasError={!!errors.provider}
                            />
                            {errors.provider && <p className='wh:mt-1 wh:text-xs wh:text-destructive'>{errors.provider}</p>}
                        </div>
                    </div>
                    {provider?.description && <p className='wh:text-sm wh:text-muted-foreground'>{provider.description}</p>}
                    {provider?.fields.map((field) => (
                        <ConfigField
                            key={`${provider.id}-${field.key}`}
                            field={field}
                            value={config[field.key]}
                            error={errors[`config.${field.key}`] ?? (field.key === 'url' ? errors.config : undefined)}
                            onChange={(value) => setConfig((current) => ({ ...current, [field.key]: value }))}
                        />
                    ))}
                    {!provider?.fields.some((field) => field.key === 'url') && errors['config.url'] && (
                        <p role='alert' className='wh:text-sm wh:text-destructive'>
                            {errors['config.url']}
                        </p>
                    )}
                    {!meta.private_targets && (
                        <p className='wh:text-xs wh:text-muted-foreground'>Addresses on private networks are refused on this panel.</p>
                    )}
                </div>
            </ContentBox>

            <ContentBox title='Events'>
                <EventPicker scope={meta.scope} meta={meta} value={events} onChange={setEvents} error={eventsError} />
            </ContentBox>

            {meta.scope === 'admin' && (
                <ContentBox title='Filters'>
                    <FilterFields value={filters} onChange={setFilters} />
                </ContentBox>
            )}

            <div className='wh:flex wh:flex-col wh:gap-4 wh:sm:flex-row wh:sm:items-center wh:sm:justify-between'>
                <Switch checked={enabled} onChange={setEnabled} label='Active' description='Turned off, the webhook keeps its settings and receives nothing.' />
                <div className='wh:flex wh:gap-3 wh:sm:justify-end'>
                    <Button type='button' isSecondary onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type='submit' isLoading={busy} disabled={!name.trim() || !providerId || events.length === 0}>
                        {endpoint ? 'Save' : 'Create webhook'}
                    </Button>
                </div>
            </div>
        </form>
    );
}

/** Create or edit a webhook, with the services and events the context offers. */
export default function EndpointEditor({ context, endpoint, onClose }: { context: Context; endpoint?: Endpoint; onClose: () => void }) {
    const { data: meta } = useQuery({ queryKey: metaKey(context), queryFn: () => getMeta(context) });
    if (!meta) return <Spinner size='large' centered />;

    return <EditorForm context={context} meta={meta} endpoint={endpoint} onClose={onClose} />;
}
