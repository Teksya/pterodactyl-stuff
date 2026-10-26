import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Badge, Input, Label, NumberInput, Select, Switch, TextArea } from '@pterodactyl/sdk';
import { COLOURS, FORMATS } from './motd';
import type { Property } from './schema';

interface Props {
    property: Property;
    value: string;
    changed: boolean;
    disabled: boolean;
    onChange: (value: string) => void;
}

/** One key of server.properties, with the control its value calls for. */
export default function PropertyField({ property, value, changed, disabled, onChange }: Props) {
    const id = `mc-property-${property.key}`;
    const { field } = property;
    const locked = disabled || property.managed === true;
    const label = (
        <span className='mc:flex mc:items-center mc:gap-2'>
            {property.label}
            {property.managed && <Badge size='sm' variant='soft'>Set by the panel</Badge>}
            {changed && <Badge size='sm' tone='accent' variant='soft'>Changed</Badge>}
        </span>
    );
    const help = (
        <p className='mc:mt-1 mc:text-xs mc:text-muted-foreground'>
            {property.help && <>{property.help} </>}
            <code className='mc:text-[0.7rem] mc:opacity-70'>{property.key}</code>
        </p>
    );

    if (field.kind === 'toggle') {
        return (
            <div>
                <Switch id={id} label={property.label} checked={value === 'true'} disabled={locked} onChange={(checked) => onChange(checked ? 'true' : 'false')} />
                {changed && <Badge size='sm' tone='accent' variant='soft' className='mc:mt-1'>Changed</Badge>}
                {help}
            </div>
        );
    }

    return (
        <div>
            <Label htmlFor={id}>{label}</Label>
            {field.kind === 'select' && (
                <Select
                    id={id}
                    value={value}
                    disabled={locked}
                    // A value of another version (such as "default" for the world type) stays selectable.
                    options={field.options.some((option) => option.value === value) || value === '' ? field.options : [...field.options, { value, label: value }]}
                    onChange={(selected) => onChange(String(selected))}
                />
            )}
            {field.kind === 'number' && (
                <NumberInput
                    id={id}
                    value={value === '' ? null : Number(value)}
                    min={field.min}
                    max={field.max}
                    disabled={locked}
                    onValueChange={(next) => onChange(next === null ? '' : String(next))}
                />
            )}
            {field.kind === 'text' && <Input id={id} value={value} placeholder={field.placeholder} readOnly={locked} onChange={(event) => onChange(event.currentTarget.value)} />}
            {field.kind === 'secret' && <SecretField id={id} value={value} disabled={locked} onChange={onChange} />}
            {field.kind === 'motd' && <MotdField id={id} value={value} disabled={locked} onChange={onChange} />}
            {help}
        </div>
    );
}

function SecretField({ id, value, disabled, onChange }: { id: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
    const [shown, setShown] = useState(false);

    return (
        <div className='mc:relative'>
            <Input id={id} type={shown ? 'text' : 'password'} value={value} readOnly={disabled} autoComplete='off' className='mc:pr-10' onChange={(event) => onChange(event.currentTarget.value)} />
            <button
                type='button'
                onClick={() => setShown(!shown)}
                aria-label={shown ? 'Hide the password' : 'Show the password'}
                className='mc:absolute mc:top-1/2 mc:right-2 mc:flex mc:size-7 mc:-translate-y-1/2 mc:cursor-pointer mc:items-center mc:justify-center mc:rounded mc:border-0 mc:bg-transparent mc:text-muted-foreground mc:hover:text-foreground'
            >
                {shown ? <EyeOff aria-hidden className='mc:size-4' /> : <Eye aria-hidden className='mc:size-4' />}
            </button>
        </div>
    );
}

/** The message of the day on two lines, with buttons that insert § codes where the cursor is. */
function MotdField({ id, value, disabled, onChange }: { id: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
    const [cursor, setCursor] = useState<number | null>(null);
    const insert = (code: string) => {
        const at = cursor ?? value.length;
        onChange(`${value.slice(0, at)}§${code}${value.slice(at)}`);
        setCursor(at + 2);
    };

    return (
        <div className='mc:flex mc:flex-col mc:gap-2'>
            <TextArea
                id={id}
                rows={2}
                value={value}
                readOnly={disabled}
                className='mc:font-mono'
                onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
                // The server list shows two lines.
                onChange={(event) => onChange(event.currentTarget.value.split('\n').slice(0, 2).join('\n'))}
            />
            {!disabled && (
                <div className='mc:flex mc:flex-wrap mc:items-center mc:gap-1' role='group' aria-label='Insert a colour or a format'>
                    {Object.entries(COLOURS).map(([code, colour]) => (
                        <button
                            key={code}
                            type='button'
                            title={`${colour.name} (§${code})`}
                            aria-label={colour.name}
                            onClick={() => insert(code)}
                            className='mc:size-5 mc:cursor-pointer mc:rounded-xs mc:border mc:border-border mc:p-0'
                            style={{ backgroundColor: colour.hex }}
                        />
                    ))}
                    <span className='mc:mx-1 mc:h-4 mc:w-px mc:bg-border' aria-hidden />
                    {Object.entries(FORMATS).map(([code, format]) => (
                        <button
                            key={code}
                            type='button'
                            title={`${format.name} (§${code})`}
                            onClick={() => insert(code)}
                            className='mc:h-5 mc:min-w-5 mc:cursor-pointer mc:rounded-xs mc:border mc:border-border mc:bg-transparent mc:px-1 mc:text-xs mc:text-foreground'
                            style={format.style}
                        >
                            {code === 'r' ? 'Reset' : format.name[0]}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
