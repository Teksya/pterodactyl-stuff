import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CloudLightning, CloudRain, Moon, Save, Sun, Sunrise, Sunset } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
    Alert,
    Button,
    CopyOnClick,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
    Input,
    NumberInput,
    Select,
    ServerContentBlock,
    Spinner,
    Switch,
    TitledGreyBox,
    cn,
    useCurrentServer,
    usePanelNavigate,
    httpErrorToHuman,
    useCurrentServerUuid,
    useServerPermission,
    type ScreenComponentProps,
} from '@pterodactyl/sdk';
import { keys, world as fetchWorld, type WorldAction } from '../api';
import { useWorldAction } from '../players/usePlayerAction';
import type { WorldInfo } from '../types';
import { useServerState } from '../useServerState';
import SnapshotsTab from './SnapshotsTab';

/** Server → Worlds: the active world (its weather, time and rules), and every world with its snapshots. */
export default function WorldScreen({ data }: ScreenComponentProps) {
    const id = useCurrentServer((server) => server.attributes.identifier) ?? '';
    const navigate = usePanelNavigate();
    const search = data.search as Record<string, unknown> | undefined;
    const tab = search?.tab === 'snapshots' ? 'snapshots' : 'world';

    return (
        <ServerContentBlock title='Worlds'>
            <div className='mc:mb-6 mc:flex mc:w-fit mc:rounded-md mc:border mc:border-border mc:p-0.5' role='tablist' aria-label='Worlds'>
                {(['world', 'snapshots'] as const).map((value) => (
                    <button
                        key={value}
                        type='button'
                        role='tab'
                        aria-selected={tab === value}
                        onClick={() => void navigate({ extension: 'minecraft', screen: 'world', params: { id }, search: value === 'snapshots' ? { tab: value } : {} })}
                        className={cn(
                            'mc:cursor-pointer mc:rounded-sm mc:border-0 mc:px-3 mc:py-1 mc:text-sm',
                            tab === value ? 'mc:bg-primary mc:text-primary-foreground' : 'mc:bg-transparent mc:text-muted-foreground mc:hover:text-foreground'
                        )}
                    >
                        {value === 'world' ? 'Active world' : 'Worlds & snapshots'}
                    </button>
                ))}
            </div>
            {tab === 'snapshots' ? <SnapshotsTab /> : <ActiveWorld />}
        </ServerContentBlock>
    );
}

function ActiveWorld() {
    const uuid = useCurrentServerUuid() ?? '';
    const query = useQuery({ queryKey: keys.world(uuid), queryFn: () => fetchWorld(uuid), enabled: uuid !== '' });
    const state = useServerState();
    const canManage = useServerPermission('ext.minecraft.manage');
    const running = state === 'running';

    return (
        <>
            {query.isPending ? (
                <Spinner size='large' centered />
            ) : query.isError ? (
                <Alert type='danger'>{httpErrorToHuman(query.error)}</Alert>
            ) : !query.data.found ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>No world yet</EmptyTitle>
                        <EmptyDescription>The server creates its world the first time it starts.</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className='mc:flex mc:flex-col mc:gap-6'>
                    <div className='mc:grid mc:gap-6 mc:xl:grid-cols-2'>
                        <InfoCard info={query.data} />
                        {canManage && <WorldControls running={running} />}
                    </div>
                    <Gamerules rules={query.data.rules} editable={canManage && running} running={running} />
                </div>
            )}
        </>
    );
}

function InfoCard({ info }: { info: WorldInfo }) {
    const time = info.dayTime != null ? info.dayTime % 24000 : null;
    const clock = time === null ? '—' : `${String(Math.floor((time / 1000 + 6) % 24)).padStart(2, '0')}:${String(Math.floor(((time % 1000) / 1000) * 60)).padStart(2, '0')}`;
    const rows: [string, ReactNode][] = [
        ['Name', info.name ?? '—'],
        ['Version', info.version ?? '—'],
        ['Seed', info.seed ? <CopyOnClick text={info.seed}><code className='mc:cursor-pointer'>{info.seed}</code></CopyOnClick> : '—'],
        ['Spawn', info.spawn ? `${info.spawn.x}, ${info.spawn.y}, ${info.spawn.z}` : '—'],
        ['Weather', info.thundering ? 'Thunder' : info.raining ? 'Rain' : 'Clear'],
        ['Time of day', clock],
        ['Hardcore', info.hardcore ? 'Yes' : 'No'],
    ];

    return (
        <TitledGreyBox title='World'>
            <dl className='mc:m-0 mc:grid mc:grid-cols-[auto_1fr] mc:gap-x-6 mc:gap-y-2 mc:text-sm'>
                {rows.map(([label, value]) => (
                    <div key={label} className='mc:contents'>
                        <dt className='mc:text-muted-foreground'>{label}</dt>
                        <dd className='mc:m-0 mc:min-w-0 mc:break-all'>{value}</dd>
                    </div>
                ))}
            </dl>
            <p className='mc:mt-3 mc:mb-0 mc:text-xs mc:text-muted-foreground'>As the world was last saved.</p>
        </TitledGreyBox>
    );
}

function Choice({ icon: Icon, label, action, disabled, onRun }: { icon?: LucideIcon; label: string; action: WorldAction; disabled: boolean; onRun: (action: WorldAction) => void }) {
    return (
        <Button size='small' isSecondary disabled={disabled} onClick={() => onRun(action)}>
            {Icon && <Icon aria-hidden className='mc:mr-1.5 mc:size-4' />}
            {label}
        </Button>
    );
}

function WorldControls({ running }: { running: boolean }) {
    const action = useWorldAction();
    const run = (input: WorldAction) => action.mutate(input);
    const disabled = action.isPending || !running;

    return (
        <TitledGreyBox title='Change it now'>
            {!running && <Alert type='info' className='mc:mb-4'>These go through the console: start the server to use them.</Alert>}
            <div className='mc:flex mc:flex-col mc:gap-4'>
                <Row label='Weather'>
                    <Choice icon={Sun} label='Clear' action={{ action: 'weather', weather: 'clear' }} disabled={disabled} onRun={run} />
                    <Choice icon={CloudRain} label='Rain' action={{ action: 'weather', weather: 'rain' }} disabled={disabled} onRun={run} />
                    <Choice icon={CloudLightning} label='Thunder' action={{ action: 'weather', weather: 'thunder' }} disabled={disabled} onRun={run} />
                </Row>
                <Row label='Time'>
                    <Choice icon={Sunrise} label='Day' action={{ action: 'time', time: 'day' }} disabled={disabled} onRun={run} />
                    <Choice icon={Sun} label='Noon' action={{ action: 'time', time: 'noon' }} disabled={disabled} onRun={run} />
                    <Choice icon={Sunset} label='Night' action={{ action: 'time', time: 'night' }} disabled={disabled} onRun={run} />
                    <Choice icon={Moon} label='Midnight' action={{ action: 'time', time: 'midnight' }} disabled={disabled} onRun={run} />
                </Row>
                <Row label='Difficulty'>
                    {(['peaceful', 'easy', 'normal', 'hard'] as const).map((difficulty) => (
                        <Choice key={difficulty} label={difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} action={{ action: 'difficulty', difficulty }} disabled={disabled} onRun={run} />
                    ))}
                </Row>
                <Row label='Save'>
                    <Choice icon={Save} label='Save the world now' action={{ action: 'save' }} disabled={disabled} onRun={run} />
                </Row>
                <p className='mc:m-0 mc:text-xs mc:text-muted-foreground'>The difficulty set here lasts until the next restart; the one in the Properties applies at each start.</p>
            </div>
        </TitledGreyBox>
    );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <p className='mc:mt-0 mc:mb-1.5 mc:text-xs mc:font-medium mc:text-muted-foreground mc:uppercase'>{label}</p>
            <div className='mc:flex mc:flex-wrap mc:gap-2'>{children}</div>
        </div>
    );
}

function Gamerules({ rules, editable, running }: { rules: Record<string, string>; editable: boolean; running: boolean }) {
    const action = useWorldAction();
    const [filter, setFilter] = useState('');
    const [view, setView] = useState<'all' | 'on' | 'off'>('all');
    // Values set here, shown until the world is saved again.
    const [set, setSet] = useState<Record<string, string>>({});
    const entries = useMemo(() => Object.entries({ ...rules, ...set }), [rules, set]);

    const needle = filter.trim().toLowerCase();
    const shown = entries.filter(([name, value]) => (!needle || name.toLowerCase().includes(needle)) && (view === 'all' || (view === 'on' ? isOn(value) : isOff(value))));
    const change = (rule: string, value: string) => action.mutate({ action: 'gamerule', rule, value }, { onSuccess: () => setSet((current) => ({ ...current, [rule]: value })) });

    return (
        <TitledGreyBox
            title='Game rules'
            actions={
                <div className='mc:flex mc:items-center mc:gap-2'>
                    <Input aria-label='Find a game rule' placeholder='Find a rule' value={filter} onChange={(event) => setFilter(event.currentTarget.value)} className='mc:w-44' />
                    <div className='mc:w-32'>
                        <Select value={view} onChange={(value) => setView(value as 'all' | 'on' | 'off')} options={[{ value: 'all', label: 'All rules' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
                    </div>
                </div>
            }
        >
            {entries.length === 0 ? (
                <p className='mc:m-0 mc:text-sm mc:text-muted-foreground'>The world's level.dat lists no game rule.</p>
            ) : (
                <>
                    {!running && <Alert type='info' className='mc:mb-4'>The rules change through the console: start the server to change them.</Alert>}
                    <div className='mc:grid mc:gap-x-8 mc:gap-y-3 mc:md:grid-cols-2'>
                        {shown.map(([name, value]) => (
                            <GameruleField key={name} name={name} value={value} disabled={!editable || action.isPending} onChange={(next) => change(name, next)} />
                        ))}
                    </div>
                </>
            )}
        </TitledGreyBox>
    );
}

// Saved as "true"/"false" before 1.21.11, as a byte (1/0) after.
const isOn = (value: string) => value === 'true';
const isOff = (value: string) => value === 'false';

/** "keepInventory" or "minecraft:keep_inventory" as "Keep inventory". */
function ruleLabel(name: string): string {
    const words = name
        .replace(/^[a-z0-9_.-]+:/, '')
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase();

    return words.charAt(0).toUpperCase() + words.slice(1);
}

function GameruleField({ name, value, disabled, onChange }: { name: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
    const [draft, setDraft] = useState<number | null>(null);

    if (isOn(value) || isOff(value)) {
        return <Switch label={ruleLabel(name)} description={name} checked={isOn(value)} disabled={disabled} onChange={(checked) => onChange(checked ? 'true' : 'false')} />;
    }

    const current = draft ?? Number(value);

    return (
        <div className='mc:flex mc:items-center mc:gap-3'>
            <div className='mc:min-w-0 mc:flex-1'>
                <p className='mc:m-0 mc:text-sm'>{ruleLabel(name)}</p>
                <code className='mc:text-xs mc:text-muted-foreground'>{name}</code>
            </div>
            <div className='mc:w-28'>
                <NumberInput aria-label={name} value={Number.isFinite(current) ? current : null} disabled={disabled} onValueChange={setDraft} />
            </div>
            <Button size='small' isSecondary disabled={disabled || draft === null || draft === Number(value)} onClick={() => draft !== null && (onChange(String(draft)), setDraft(null))}>
                Set
            </Button>
        </div>
    );
}
