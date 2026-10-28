import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, PlugZap } from 'lucide-react';
import {
    Alert,
    Button,
    httpErrorToHuman,
    Input,
    Label,
    ListToolbar,
    PageContentBlock,
    PageHeading,
    Spinner,
    TitledGreyBox,
    useCurrentResource,
    type ScreenComponentProps,
} from '@pterodactyl/sdk';
import { checkConnection, listAll, ROOT_KEY, type Context } from './api';
import SubdomainsManager from './SubdomainsManager';
import SubdomainTable from './SubdomainTable';
import type { Check, Subdomain } from './types';

const adminContextOf = (subdomain: Subdomain): Context => ({ kind: 'admin-server', serverId: subdomain.server?.id ?? 0 });

/** Asks Cloudflare whether the token works and reaches each offered domain. */
function ConnectionCheck() {
    const [result, setResult] = useState<Check | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            setResult(await checkConnection());
        } catch (cause) {
            setError(httpErrorToHuman(cause));
        } finally {
            setBusy(false);
        }
    };

    return (
        <TitledGreyBox title='Cloudflare' className='sd:mb-6'>
            <div className='sd:flex sd:flex-col sd:gap-3 sd:sm:flex-row sd:sm:items-center sd:sm:justify-between'>
                <p className='sd:text-sm sd:text-muted-foreground'>The token and domains are set in Admin → Extensions → Subdomains.</p>
                <Button type='button' size='small' isSecondary isLoading={busy} onClick={() => void run()}>
                    <PlugZap className='sd:size-4' aria-hidden />
                    Check the connection
                </Button>
            </div>
            {error && (
                <Alert type='danger' className='sd:mt-3'>
                    {error}
                </Alert>
            )}
            {result && (
                <div className='sd:mt-3 sd:flex sd:flex-col sd:gap-1.5 sd:text-sm'>
                    {result.error ? (
                        <Alert type='danger'>{result.error}</Alert>
                    ) : result.domains.length === 0 ? (
                        <Alert type='warning'>The token works, but no domain is offered yet.</Alert>
                    ) : (
                        result.domains.map((domain) => (
                            <p key={domain.domain} className='sd:flex sd:items-start sd:gap-2'>
                                {domain.ok ? (
                                    <CircleCheck className='sd:mt-0.5 sd:size-4 sd:shrink-0 sd:text-success' aria-label='Reachable' />
                                ) : (
                                    <CircleX className='sd:mt-0.5 sd:size-4 sd:shrink-0 sd:text-destructive' aria-label='Unreachable' />
                                )}
                                <span>
                                    <span className='sd:font-mono'>{domain.domain}</span>
                                    {domain.error && <span className='sd:text-muted-foreground'> — {domain.error}</span>}
                                </span>
                            </p>
                        ))
                    )}
                </div>
            )}
        </TitledGreyBox>
    );
}

/** Admin → Subdomains: every server's subdomains. */
export default function AdminSubdomainsScreen(_props: ScreenComponentProps) {
    const [filter, setFilter] = useState('');
    const { data } = useQuery({ queryKey: [...ROOT_KEY, 'all'], queryFn: listAll });
    const needle = filter.trim().toLowerCase();
    const rows = needle ? data?.filter((item) => item.host.includes(needle) || (item.server?.name.toLowerCase().includes(needle) ?? false)) : data;

    return (
        <PageContentBlock title='Admin · Subdomains'>
            <PageHeading title='Subdomains' description='Every server’s subdomains. Each server’s are also on its Subdomains tab, where new ones are made.' />
            <ConnectionCheck />
            <ListToolbar summary={data ? `${data.length} subdomain${data.length === 1 ? '' : 's'}` : undefined}>
                <div className='sd:w-56'>
                    <Label htmlFor='sd-filter' className='sd:sr-only'>
                        Filter
                    </Label>
                    <Input id='sd-filter' placeholder='Name or server' value={filter} onChange={(event) => setFilter(event.target.value)} />
                </div>
            </ListToolbar>
            {data ? (
                <SubdomainTable subdomains={rows} contextOf={adminContextOf} canManage showServer emptyDescription={needle ? 'No subdomain matches.' : 'No server has a subdomain yet.'} />
            ) : (
                <Spinner size='large' centered />
            )}
        </PageContentBlock>
    );
}

/** Admin → Servers → a server → Subdomains: the server's subdomains, without the users' limit. */
export function AdminServerSubdomainsScreen(_props: ScreenComponentProps) {
    const resource = useCurrentResource();
    const serverId = resource?.kind === 'admin.server' ? resource.resource.attributes.id : 0;
    if (!serverId) return <Spinner size='large' centered />;

    return (
        <TitledGreyBox title='Subdomains'>
            <SubdomainsManager context={{ kind: 'admin-server', serverId }} emptyDescription='This server has no subdomain.' />
        </TitledGreyBox>
    );
}
