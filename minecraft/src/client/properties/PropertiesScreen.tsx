import { useMemo, useState } from 'react';
import { FileCode2 } from 'lucide-react';
import {
    Alert,
    Button,
    Dialog,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
    Input,
    Label,
    PanelLink,
    ServerContentBlock,
    Spinner,
    TitledGreyBox,
    httpErrorToHuman,
    toast,
    useCurrentServer,
    useCurrentServerUuid,
    useExtensionAction,
    useNavigationBlocker,
    useServerFileContent,
    useServerPermission,
    useWriteServerFile,
    type ScreenComponentProps,
} from '@pterodactyl/sdk';
import RestartNotice from '../RestartNotice';
import { parseProperties, serializeProperties } from './file';
import { MotdPreview } from './motd';
import PropertyField from './PropertyField';
import { DEFAULTS, KNOWN_KEYS, SECTIONS, type Property } from './schema';
import { IconImage, IconUpload, useServerIcon } from './ServerIcon';

export const PROPERTIES_FILE = '/server.properties';

/** Server → Properties: server.properties as forms, saved as one write that keeps the rest of the file. */
export default function PropertiesScreen(_props: ScreenComponentProps) {
    const uuid = useCurrentServerUuid() ?? '';
    const query = useServerFileContent(uuid, PROPERTIES_FILE);

    return (
        <ServerContentBlock title='Server Properties'>
            {query.isPending ? (
                <Spinner size='large' centered />
            ) : query.isError ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>No server.properties yet</EmptyTitle>
                        <EmptyDescription>
                            The server writes it the first time it starts: start it once, then come back. A proxy (BungeeCord, Velocity) has none. ({httpErrorToHuman(query.error)})
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                // Changes stay on top of a newer read, so a refetch on focus keeps what is being typed.
                <PropertiesForm contents={query.data ?? ''} onSaved={() => void query.refetch()} />
            )}
        </ServerContentBlock>
    );
}

function PropertiesForm({ contents, onSaved }: { contents: string; onSaved: () => void }) {
    const uuid = useCurrentServerUuid() ?? '';
    const identifier = useCurrentServer((server) => server.attributes.identifier) ?? '';
    const serverName = useCurrentServer((server) => server.attributes.name) ?? 'Minecraft Server';
    const canWrite = useServerPermission('file.update');
    const file = useMemo(() => parseProperties(contents), [contents]);
    const [changes, setChanges] = useState<Record<string, string>>({});
    const [reviewing, setReviewing] = useState(false);
    const [saved, setSaved] = useState(false);
    const write = useWriteServerFile(uuid);
    const icon = useServerIcon();

    const valueOf = (key: string) => changes[key] ?? file.values.get(key) ?? DEFAULTS[key] ?? '';
    const change = (key: string, value: string) =>
        setChanges((current) => {
            const next = { ...current, [key]: value };
            // Back to what the file holds: no longer a change.
            if ((file.values.get(key) ?? DEFAULTS[key] ?? '') === value) delete next[key];

            return next;
        });
    const pending = Object.keys(changes);
    useNavigationBlocker(pending.length > 0, { message: 'Leave without saving your changes to server.properties?' });

    const save = useExtensionAction('save-properties', async () => {
        await write.mutateAsync({ file: PROPERTIES_FILE, content: serializeProperties(file, changes) });
        toast.success('server.properties saved.');
        setReviewing(false);
        setSaved(true);
        setChanges({});
        onSaved();
    });

    const shown = (property: Property) => property.always || file.values.has(property.key);
    const others = [...file.values.keys()].filter((key) => !KNOWN_KEYS.has(key)).sort();

    return (
        <>
            {saved && <RestartNotice onRestarted={() => setSaved(false)}>Saved. The server reads server.properties when it starts: restart it to apply the changes.</RestartNotice>}
            {!canWrite && <Alert type='info' className='mc:mb-6'>You can read these settings; changing them takes the permission to edit files.</Alert>}

            <TitledGreyBox
                title='Server list'
                className='mc:mb-6'
                actions={
                    <PanelLink
                        destination={{ to: '/server/$id/files/$action', params: { id: identifier, action: 'edit' }, hash: PROPERTIES_FILE }}
                        className='mc:flex mc:items-center mc:gap-1.5 mc:text-sm'
                    >
                        <FileCode2 aria-hidden className='mc:size-4' />
                        Open the file
                    </PanelLink>
                }
            >
                <div className='mc:flex mc:flex-col mc:gap-4 mc:md:flex-row mc:md:items-center'>
                    <div className='mc:min-w-0 mc:flex-1'>
                        <MotdPreview motd={valueOf('motd')} name={serverName} icon={<IconImage url={icon.data} />} />
                    </div>
                    <IconUpload />
                </div>
            </TitledGreyBox>

            {SECTIONS.map((section) => {
                const properties = section.properties.filter(shown);
                if (properties.length === 0) return null;

                return (
                    <TitledGreyBox key={section.id} title={section.title} className='mc:mb-6'>
                        <div className='mc:grid mc:gap-x-8 mc:gap-y-5 mc:md:grid-cols-2'>
                            {properties.map((property) => (
                                <div key={property.key} className={property.field.kind === 'motd' ? 'mc:md:col-span-2' : undefined}>
                                    <PropertyField
                                        property={property}
                                        value={valueOf(property.key)}
                                        changed={property.key in changes}
                                        disabled={!canWrite}
                                        onChange={(value) => change(property.key, value)}
                                    />
                                </div>
                            ))}
                        </div>
                    </TitledGreyBox>
                );
            })}

            {others.length > 0 && (
                <TitledGreyBox title='Other keys' className='mc:mb-6'>
                    <p className='mc:mb-4 mc:text-sm mc:text-muted-foreground'>Keys of this server's version, of plugins or of mods, as they are written in the file.</p>
                    <div className='mc:grid mc:gap-x-8 mc:gap-y-5 mc:md:grid-cols-2'>
                        {others.map((key) => (
                            <div key={key}>
                                <Label htmlFor={`mc-other-${key}`}>{key}</Label>
                                <Input id={`mc-other-${key}`} value={valueOf(key)} readOnly={!canWrite} onChange={(event) => change(key, event.currentTarget.value)} />
                            </div>
                        ))}
                    </div>
                </TitledGreyBox>
            )}

            {canWrite && (
                <div className='mc:sticky mc:bottom-4 mc:z-10 mc:flex mc:items-center mc:justify-end mc:gap-3 mc:rounded-md mc:border mc:border-border mc:bg-card/95 mc:p-3 mc:shadow-lg mc:backdrop-blur'>
                    <span className='mc:mr-auto mc:text-sm mc:text-muted-foreground'>
                        {pending.length === 0 ? 'No changes' : `${pending.length} change${pending.length === 1 ? '' : 's'}`}
                    </span>
                    <Button isSecondary disabled={pending.length === 0} onClick={() => setChanges({})}>
                        Discard
                    </Button>
                    <Button disabled={pending.length === 0} onClick={() => setReviewing(true)}>
                        Review and save
                    </Button>
                </div>
            )}

            <Dialog open={reviewing} onClose={() => setReviewing(false)} title='Save server.properties'>
                <ul className='mc:m-0 mc:flex mc:list-none mc:flex-col mc:gap-2 mc:p-0 mc:text-sm'>
                    {pending.map((key) => (
                        <li key={key} className='mc:rounded-sm mc:bg-sunken mc:px-3 mc:py-2 mc:font-mono'>
                            <span className='mc:text-muted-foreground'>{key}</span>
                            <div className='mc:mt-1 mc:break-all'>
                                <span className='mc:text-destructive mc:line-through'>{display(key, file.values.get(key))}</span>
                                {' → '}
                                <span className='mc:text-success'>{display(key, changes[key])}</span>
                            </div>
                        </li>
                    ))}
                </ul>
                <Dialog.Footer>
                    <Button isSecondary onClick={() => setReviewing(false)}>
                        Cancel
                    </Button>
                    <Button isLoading={write.isPending} onClick={() => void save()}>
                        Save
                    </Button>
                </Dialog.Footer>
            </Dialog>
        </>
    );
}

function display(key: string, value: string | undefined): string {
    if (value === undefined) return '(not set)';
    if (key === 'rcon.password') return value === '' ? '(empty)' : '••••••••';

    return value === '' ? '(empty)' : value.replace(/\n/g, '\\n');
}
