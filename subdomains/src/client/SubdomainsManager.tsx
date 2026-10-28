import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, ListToolbar, NewButton, Spinner, Tooltip } from '@pterodactyl/sdk';
import { getMeta, listKey, listSubdomains, metaKey, type Context } from './api';
import { blockedReason } from './present';
import SubdomainForm from './SubdomainForm';
import SubdomainTable from './SubdomainTable';

/** One server's subdomains: the list, and the dialog that makes a new one. */
export default function SubdomainsManager({ context, emptyDescription }: { context: Context; emptyDescription: string }) {
    const [creating, setCreating] = useState(false);
    const { data: meta } = useQuery({ queryKey: metaKey(context), queryFn: () => getMeta(context) });
    const { data: subdomains } = useQuery({ queryKey: listKey(context), queryFn: () => listSubdomains(context) });
    const contextOf = useCallback(() => context, [context]);

    if (!meta) return <Spinner size='large' centered />;

    const blocked = blockedReason(meta);
    const summary = meta.limit !== null ? `${meta.count} of ${meta.limit} subdomains` : `${meta.count} subdomain${meta.count === 1 ? '' : 's'}`;

    return (
        <div>
            {!meta.configured && (
                <Alert type='warning' className='sd:mb-6'>
                    Subdomains need a Cloudflare API token and at least one domain, in Admin → Extensions → Subdomains.
                </Alert>
            )}
            {meta.configured && !meta.enabled && (
                <Alert type='warning' className='sd:mb-6'>
                    The administrator has turned subdomains off: the existing ones keep working.
                </Alert>
            )}
            <ListToolbar summary={summary}>
                {meta.can_manage && (
                    <Tooltip content={blocked} disabled={!blocked}>
                        <span>
                            <NewButton onClick={() => setCreating(true)} disabled={blocked !== null}>
                                New subdomain
                            </NewButton>
                        </span>
                    </Tooltip>
                )}
            </ListToolbar>
            <SubdomainTable
                subdomains={subdomains}
                contextOf={contextOf}
                canManage={meta.can_manage && meta.enabled}
                allocations={meta.allocations}
                emptyDescription={emptyDescription}
            />
            {meta.can_manage && <SubdomainForm context={context} meta={meta} open={creating} onClose={() => setCreating(false)} />}
        </div>
    );
}
