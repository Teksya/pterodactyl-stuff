import { useId } from 'react';
import { Label, Select } from '@pterodactyl/sdk';
import type { DeliveryStatus } from './types';

const OPTIONS = [
    { value: 'all', label: 'Every status' },
    { value: 'success', label: 'Delivered' },
    { value: 'failed', label: 'Failed' },
    { value: 'pending', label: 'Pending' },
    { value: 'skipped', label: 'Skipped' },
];

export default function StatusFilter({ value, onChange }: { value: DeliveryStatus | ''; onChange: (status: DeliveryStatus | '') => void }) {
    const id = useId();

    return (
        <div className='wh:w-44'>
            <Label htmlFor={id} className='wh:sr-only'>
                Status
            </Label>
            <Select id={id} value={value || 'all'} options={OPTIONS} onChange={(next) => onChange(next === 'all' ? '' : (String(next) as DeliveryStatus))} />
        </div>
    );
}
