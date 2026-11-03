import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitBranch } from 'lucide-react';
import {
    Alert,
    Badge,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    PageContentBlock,
    PageHeading,
    PanelLink,
    Spinner,
    Table,
    fromNow,
    type ScreenComponentProps,
    type TableColumn,
} from '@pterodactyl/sdk';
import { keys, listRepositories } from './api';
import { shortSha, statusOf } from './present';
import type { AdminRepository } from './types';

/** Admin → Git Deploy: every server deploying from a repository, with its last deploy. */
export default function AdminScreen(_props: ScreenComponentProps) {
    const query = useQuery({ queryKey: keys.admin(), queryFn: listRepositories });

    const columns = useMemo<TableColumn<AdminRepository>[]>(
        () => [
            {
                id: 'server',
                label: 'Server',
                sortValue: (repository) => repository.server.name,
                cell: (repository) => (
                    <PanelLink destination={{ to: '/server/$id', params: { id: repository.server.identifier } }} className='gd:font-medium'>
                        {repository.server.name}
                    </PanelLink>
                ),
            },
            {
                id: 'repository',
                label: 'Repository',
                sortValue: (repository) => repository.url,
                cell: (repository) => (
                    <div className='gd:min-w-0'>
                        <p className='gd:truncate gd:text-sm'>{repository.url}</p>
                        <p className='gd:text-xs gd:text-muted-foreground'>
                            {repository.branch} → {repository.directory}
                            {repository.auto_deploy ? ' · on push' : ''}
                        </p>
                    </div>
                ),
            },
            {
                id: 'last',
                label: 'Last deploy',
                sortValue: (repository) => repository.last_deployment?.created_at ?? '',
                cell: (repository) => {
                    const last = repository.last_deployment;
                    if (!last) return <span className='gd:text-xs gd:text-muted-foreground'>Never</span>;
                    const status = statusOf(last.status);

                    return (
                        <span className='gd:flex gd:items-center gd:gap-2 gd:whitespace-nowrap gd:text-xs'>
                            <Badge size='sm' tone={status.tone}>
                                {status.label}
                            </Badge>
                            <code className='gd:font-mono'>{shortSha(last.commit)}</code>
                            <span className='gd:text-muted-foreground'>{fromNow(last.created_at)}</span>
                        </span>
                    );
                },
            },
        ],
        []
    );

    return (
        <PageContentBlock title='Admin · Git Deploy'>
            <PageHeading title='Git Deploy' description='Servers that deploy from a Git repository. Each server’s Deploy tab links it, deploys and rolls back.' />
            {query.data && !query.data.meta.git_available && (
                <Alert type='info' className='gd:mb-6'>
                    The panel’s host has no git command: SSH addresses and “Any Git server” are unavailable. GitHub, GitLab and Gitea over HTTPS work through their APIs.
                </Alert>
            )}
            {query.data ? (
                <Table
                    rows={query.data.data}
                    columns={columns}
                    keyOf={(repository) => repository.uuid}
                    emptyState={
                        <Empty size='compact'>
                            <EmptyHeader>
                                <EmptyMedia variant='icon'>
                                    <GitBranch />
                                </EmptyMedia>
                                <EmptyTitle>No repository yet</EmptyTitle>
                                <EmptyDescription>Servers link a repository from their Deploy tab.</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    }
                />
            ) : (
                <Spinner size='large' centered />
            )}
        </PageContentBlock>
    );
}
