import { ServerContentBlock, Spinner, useCurrentServerUuid, type ScreenComponentProps } from '@pterodactyl/sdk';
import SubdomainsManager from './SubdomainsManager';

/** Server → Subdomains. */
export default function ServerSubdomainsScreen(_props: ScreenComponentProps) {
    const uuid = useCurrentServerUuid();

    return (
        <ServerContentBlock title='Subdomains'>
            {uuid ? (
                <SubdomainsManager context={{ kind: 'server', uuid }} emptyDescription='Give this server a name, such as play.example.com, that players can join with instead of its IP address.' />
            ) : (
                <Spinner size='large' centered />
            )}
        </ServerContentBlock>
    );
}
