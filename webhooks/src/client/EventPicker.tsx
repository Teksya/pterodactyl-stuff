import { useMemo, useState } from 'react';
import { Alert, Checkbox, Input, Label, Switch } from '@pterodactyl/sdk';
import { allEvents, isAllEvents, isMonitored } from './present';
import type { EventGroup, Meta, Scope } from './types';

const SEVERITY_DOT: Record<string, string> = {
    info: 'wh:bg-primary',
    success: 'wh:bg-success',
    warning: 'wh:bg-caution',
    danger: 'wh:bg-destructive',
};

/**
 * The events a webhook receives: everything, or groups and single events, plus patterns for
 * events the catalogue does not list (another extension's activity, for instance).
 */
export default function EventPicker({
    scope,
    meta,
    value,
    onChange,
    error,
}: {
    scope: Scope;
    meta: Meta;
    value: string[];
    onChange: (events: string[]) => void;
    error?: string;
}) {
    const [search, setSearch] = useState('');
    const known = useMemo(() => new Set(meta.groups.flatMap((group) => group.events.map((event) => event.key))), [meta.groups]);
    const everything = isAllEvents(scope, value);
    const selected = new Set(value);
    const custom = value.filter((event) => !known.has(event) && !allEvents(scope).includes(event));
    const [customText, setCustomText] = useState(custom.join(', '));
    const query = search.trim().toLowerCase();

    const groups = useMemo<EventGroup[]>(
        () =>
            meta.groups
                .map((group) => ({
                    ...group,
                    events: query
                        ? group.events.filter((event) => `${group.label} ${event.label} ${event.key}`.toLowerCase().includes(query))
                        : group.events,
                }))
                .filter((group) => group.events.length > 0),
        [meta.groups, query]
    );

    const setKeys = (keys: string[], on: boolean) => {
        const next = new Set(value);
        for (const key of keys) {
            if (on) next.add(key);
            else next.delete(key);
        }
        onChange([...next]);
    };

    const setCustom = (text: string) => {
        setCustomText(text);
        const patterns = text
            .split(/[\s,]+/)
            .map((pattern) => pattern.trim())
            .filter(Boolean);
        onChange([...value.filter((event) => known.has(event) || allEvents(scope).includes(event)), ...patterns]);
    };

    const watchesMonitor = everything || value.some((event) => isMonitored(event) || event === 'server:state.*' || event === 'server:resources.*');

    return (
        <div className='wh:flex wh:flex-col wh:gap-4'>
            <Switch
                checked={everything}
                onChange={(on) => onChange(on ? allEvents(scope) : [])}
                label='Every event'
                description={
                    scope === 'admin'
                        ? 'Everything that happens on the panel, including events added later.'
                        : 'Everything this webhook can receive, including events added later.'
                }
            />

            {!everything && (
                <>
                    <Input
                        aria-label='Search events'
                        placeholder='Search events…'
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <div className='wh:flex wh:flex-col wh:gap-4'>
                        {groups.map((group) => {
                            const keys = group.events.map((event) => event.key);
                            const count = keys.filter((key) => selected.has(key)).length;

                            return (
                                <fieldset key={group.id} className='wh:rounded-lg wh:border wh:border-border wh:p-3'>
                                    <legend className='wh:px-1'>
                                        <label className='wh:flex wh:cursor-pointer wh:items-center wh:gap-2 wh:text-sm wh:font-medium'>
                                            <Checkbox
                                                checked={count === keys.length}
                                                indeterminate={count > 0 && count < keys.length}
                                                onChange={(on) => setKeys(keys, on)}
                                                aria-label={`All ${group.label} events`}
                                            />
                                            {group.label}
                                            <span className='wh:text-xs wh:font-normal wh:text-muted-foreground'>
                                                {count}/{keys.length}
                                            </span>
                                        </label>
                                    </legend>
                                    <div className='wh:grid wh:grid-cols-1 wh:gap-x-4 wh:gap-y-1.5 wh:sm:grid-cols-2'>
                                        {group.events.map((event) => (
                                            <label key={event.key} className='wh:flex wh:cursor-pointer wh:items-center wh:gap-2 wh:text-sm' title={event.key}>
                                                <Checkbox checked={selected.has(event.key)} onChange={(on) => setKeys([event.key], on)} />
                                                <span aria-hidden className={`wh:size-1.5 wh:shrink-0 wh:rounded-full ${SEVERITY_DOT[event.severity]}`} />
                                                <span className='wh:truncate'>{event.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            );
                        })}
                        {groups.length === 0 && <p className='wh:text-sm wh:text-muted-foreground'>No event matches “{search}”.</p>}
                    </div>

                    <div>
                        <Label htmlFor='wh-custom-events'>Other events</Label>
                        <Input id='wh-custom-events' value={customText} onChange={(event) => setCustom(event.target.value)} placeholder='server:backup.*, user:security-key.create' />
                        <p className='wh:mt-1 wh:text-xs wh:text-muted-foreground'>
                            Event keys or patterns with *, separated by commas: for events other extensions log, or whole families.
                        </p>
                    </div>
                </>
            )}

            {error && (
                <p role='alert' className='wh:text-sm wh:text-destructive'>
                    {error}
                </p>
            )}

            {scope !== 'account' && watchesMonitor && (
                <Alert type={meta.monitor ? 'info' : 'warning'}>
                    {meta.monitor
                        ? `State and resource events come from a check of the server every ${meta.monitor_interval === 1 ? 'minute' : `${meta.monitor_interval} minutes`}: a crash is a server that went offline without a stop, restart or kill request.`
                        : 'The administrator turned server monitoring off: state and resource events are not sent.'}
                </Alert>
            )}
        </div>
    );
}
