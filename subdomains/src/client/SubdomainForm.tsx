import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert, X } from 'lucide-react';
import { Alert, Button, Dialog, httpErrorToHuman, Input, Label, Select, Spinner, toast } from '@pterodactyl/sdk';
import { checkAvailable, createSubdomain, ROOT_KEY, validationErrors, type Context } from './api';
import { addressOf, allocationLabel, gameOf, nameProblem, normalizeName } from './present';
import type { Allocation, Meta } from './types';

const PRIMARY = 'primary';

/** The allocation choices: the primary one, followed when it changes, then each one in particular. */
export function allocationOptions(allocations: Allocation[]) {
    const primary = allocations.find((allocation) => allocation.primary);

    return [
        { value: PRIMARY, label: primary ? `Primary allocation (${allocationLabel(primary)})` : 'Primary allocation' },
        ...allocations.map((allocation) => ({ value: allocation.id, label: allocationLabel(allocation) + (allocation.primary ? ' · primary' : '') })),
    ];
}

export const allocationValue = (id: number | null) => (id === null ? PRIMARY : id);
export const allocationFromValue = (value: string | number) => (value === PRIMARY ? null : Number(value));

function useDebounced<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}

function Availability({ context, name, domain, minLength }: { context: Context; name: string; domain: string; minLength: number }) {
    const debounced = useDebounced(name, 400);
    const problem = nameProblem(name, minLength);
    const ready = debounced === name && name !== '' && problem === null && domain !== '';
    const query = useQuery({
        queryKey: [...ROOT_KEY, 'available', context.kind, debounced, domain],
        queryFn: () => checkAvailable(context, debounced, domain),
        enabled: ready,
        staleTime: 15_000,
        retry: false,
    });

    if (name === '') return null;
    if (problem) return <Hint tone='danger' text={problem} />;
    if (!ready || query.isFetching) {
        return (
            <p className='sd:mt-1 sd:flex sd:items-center sd:gap-1.5 sd:text-xs sd:text-muted-foreground'>
                <Spinner size='small' /> Checking…
            </p>
        );
    }
    if (query.isError) return <Hint tone='muted' text={httpErrorToHuman(query.error)} />;
    if (query.data?.available === true) return <Hint tone='success' text='Available' />;
    if (query.data?.available === false) return <Hint tone='danger' text={query.data.reason ?? 'Taken'} />;

    return <Hint tone='muted' text={query.data?.reason ?? 'Could not be checked.'} />;
}

function Hint({ tone, text }: { tone: 'success' | 'danger' | 'muted'; text: string }) {
    const Icon = tone === 'success' ? Check : tone === 'danger' ? X : CircleAlert;
    const color = tone === 'success' ? 'sd:text-success' : tone === 'danger' ? 'sd:text-destructive' : 'sd:text-muted-foreground';

    return (
        <p role='status' className={`sd:mt-1 sd:flex sd:items-center sd:gap-1.5 sd:text-xs ${color}`}>
            <Icon className='sd:size-3.5 sd:shrink-0' aria-hidden />
            {text}
        </p>
    );
}

/** A new name for the server: the name, its domain and the allocation it points at, with a live check and a preview. */
export default function SubdomainForm({ context, meta, open, onClose }: { context: Context; meta: Meta; open: boolean; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState('');
    const [domain, setDomain] = useState(meta.domains[0] ?? '');
    const [allocation, setAllocation] = useState<number | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) {
            setName('');
            setErrors({});
            setAllocation(null);
            setDomain((current) => (meta.domains.includes(current) ? current : (meta.domains[0] ?? '')));
        }
    }, [open, meta.domains]);

    const chosen = allocation === null ? meta.allocations.find((item) => item.primary) : meta.allocations.find((item) => item.id === allocation);
    const host = `${name || 'name'}.${domain || 'example.com'}`;
    const game = gameOf(meta.service);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setErrors({});
        try {
            const created = await createSubdomain(context, { name, domain, allocation_id: allocation });
            await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
            toast.success(`${created.address} is ready. DNS can take a few minutes to reach everyone.`);
            onClose();
        } catch (error) {
            const fields = validationErrors(error);
            setErrors(fields);
            if (Object.keys(fields).length === 0) toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={() => !busy && onClose()} title='New subdomain' description='A name players can use instead of the IP address and port.'>
            <form id='sd-create' onSubmit={(event) => void submit(event)} className='sd:flex sd:flex-col sd:gap-4'>
                <div>
                    <Label htmlFor='sd-name'>Name</Label>
                    <div className='sd:flex sd:items-start sd:gap-2'>
                        <div className='sd:min-w-0 sd:flex-1'>
                            <Input
                                id='sd-name'
                                autoFocus
                                autoComplete='off'
                                spellCheck={false}
                                $hasError={!!errors.name}
                                value={name}
                                maxLength={63}
                                placeholder='play'
                                onChange={(event) => setName(normalizeName(event.target.value))}
                            />
                        </div>
                        <span className='sd:pt-2 sd:text-muted-foreground' aria-hidden>
                            .
                        </span>
                        <div className='sd:min-w-0 sd:flex-1'>
                            <Label htmlFor='sd-domain' className='sd:sr-only'>
                                Domain
                            </Label>
                            <Select
                                id='sd-domain'
                                value={domain}
                                options={meta.domains.map((item) => ({ value: item, label: item }))}
                                onChange={(next) => setDomain(String(next))}
                                hasError={!!errors.domain}
                            />
                        </div>
                    </div>
                    {errors.name || errors.domain ? (
                        <Hint tone='danger' text={errors.name ?? errors.domain ?? ''} />
                    ) : (
                        <Availability context={context} name={name} domain={domain} minLength={meta.min_length} />
                    )}
                </div>

                {meta.allocations.length > 1 && (
                    <div>
                        <Label htmlFor='sd-allocation'>Points at</Label>
                        <Select
                            id='sd-allocation'
                            value={allocationValue(allocation)}
                            options={allocationOptions(meta.allocations)}
                            onChange={(next) => setAllocation(allocationFromValue(next))}
                            hasError={!!errors.allocation_id}
                        />
                        {errors.allocation_id && <Hint tone='danger' text={errors.allocation_id} />}
                    </div>
                )}

                <div className='sd:rounded-md sd:border sd:border-border sd:bg-muted/40 sd:p-3 sd:text-sm'>
                    <p className='sd:text-muted-foreground'>Players join with</p>
                    <p className='sd:mt-0.5 sd:break-all sd:font-mono sd:font-medium'>{addressOf(host, meta.service, chosen?.port ?? null)}</p>
                    <p className='sd:mt-1 sd:text-xs sd:text-muted-foreground'>
                        {meta.service
                            ? `${game} finds the port through an SRV record, so the name is enough.`
                            : 'This game does not look up SRV records, so players add the port.'}
                    </p>
                </div>

                {errors.dns && <Alert type='danger'>{errors.dns}</Alert>}
            </form>
            <Dialog.Footer>
                <Button type='button' isSecondary onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type='submit' form='sd-create' isLoading={busy} disabled={!name || !domain || nameProblem(name, meta.min_length) !== null}>
                    Create
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
