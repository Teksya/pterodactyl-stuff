import { useEffect, useState } from 'react';
import { Button, Dialog, Label, TextArea } from '@pterodactyl/sdk';
import type { Preferences } from './preferences';

const lines = (text: string) =>
    text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

const FIELDS = [
    {
        key: 'hide',
        label: 'Hide lines containing',
        help: 'One per line. Text matches in any case; /like this/ is a regular expression. Hidden lines stay in the download.',
        placeholder: 'No memory leak detected\n/Can.t keep up!/',
    },
    {
        key: 'highlight',
        label: 'Highlight',
        help: 'Words to mark wherever they appear, such as player names. Same format.',
        placeholder: 'Steve\n/joined the game/',
    },
    {
        key: 'favourites',
        label: 'Favourite commands',
        help: 'One per line, in the order of their buttons above the command line.',
        placeholder: 'save-all\nsay Restarting in 5 minutes\nlist',
    },
] as const;

/** Hide and highlight rules and the favourite commands, one per line. */
export default function RulesDialog({
    open,
    preferences,
    onClose,
    onSave,
}: {
    open: boolean;
    preferences: Preferences;
    onClose: () => void;
    onSave: (change: Pick<Preferences, 'hide' | 'highlight' | 'favourites'>) => void;
}) {
    const [values, setValues] = useState({ hide: '', highlight: '', favourites: '' });

    useEffect(() => {
        if (open) setValues({ hide: preferences.hide.join('\n'), highlight: preferences.highlight.join('\n'), favourites: preferences.favourites.join('\n') });
    }, [open, preferences]);

    return (
        <Dialog open={open} onClose={onClose} title='Console rules'>
            <div className='cx:flex cx:flex-col cx:gap-5'>
                {FIELDS.map((field) => (
                    <div key={field.key}>
                        <Label htmlFor={`cx-rules-${field.key}`}>{field.label}</Label>
                        <TextArea
                            id={`cx-rules-${field.key}`}
                            rows={4}
                            className='cx:font-mono cx:text-xs'
                            spellCheck={false}
                            placeholder={field.placeholder}
                            value={values[field.key]}
                            onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                        />
                        <p className='cx:mt-1 cx:text-xs cx:text-muted-foreground'>{field.help}</p>
                    </div>
                ))}
            </div>
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    onClick={() => {
                        onSave({ hide: lines(values.hide).slice(0, 50), highlight: lines(values.highlight).slice(0, 50), favourites: lines(values.favourites).slice(0, 50) });
                        onClose();
                    }}
                >
                    Save
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
