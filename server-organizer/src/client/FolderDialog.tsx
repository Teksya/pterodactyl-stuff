import { useEffect, useState, type FormEvent } from 'react';
import { Button, Dialog, Input, Label } from '@pterodactyl/sdk';

/** Names a new folder, or renames one. */
export default function FolderDialog({
    open,
    initial,
    onClose,
    onSave,
}: {
    open: boolean;
    /** The current name when renaming; a new folder otherwise. */
    initial: string | null;
    onClose: () => void;
    onSave: (name: string) => void;
}) {
    const [name, setName] = useState('');

    useEffect(() => {
        if (open) setName(initial ?? '');
    }, [open, initial]);

    const valid = name.trim().length > 0 && name.trim().length <= 50;
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!valid) return;
        onSave(name.trim());
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} title={initial === null ? 'New folder' : 'Rename folder'}>
            <form id='so-folder-form' onSubmit={submit}>
                <Label htmlFor='so-folder-name'>Name</Label>
                <Input id='so-folder-name' value={name} maxLength={50} autoFocus placeholder='Minecraft, Production, Friends…' onChange={(event) => setName(event.target.value)} />
            </form>
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    Cancel
                </Button>
                <Button type='submit' form='so-folder-form' disabled={!valid}>
                    {initial === null ? 'Create folder' : 'Save'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
