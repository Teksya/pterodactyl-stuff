import { useCallback, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Checkbox,
    ContentBox,
    DeleteAction,
    Dialog,
    EditAction,
    httpErrorToHuman,
    Input,
    Label,
    PageContentBlock,
    toast,
} from '@pterodactyl/sdk';
import { accountKeysQueryKey, deleteKey, listKeys, registrationOptions, renameKey, storeKey, type SecurityKey } from './api';
import KeyList from './KeyList';
import { settings } from './settings';
import { ceremonyError, creationOptions, credentialJson, isCancelled, supportsWebAuthn } from './webauthn';

const errorMessage = (error: unknown) => (error instanceof DOMException ? ceremonyError(error) : httpErrorToHuman(error));

function AddKey() {
    const queryClient = useQueryClient();
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [passkey, setPasskey] = useState(settings.passwordless);
    const supported = supportsWebAuthn();

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);

        try {
            const options = await registrationOptions(password, settings.passwordless && passkey);
            const credential = await navigator.credentials.create({ publicKey: creationOptions(options) });
            if (!(credential instanceof PublicKeyCredential)) throw new DOMException('No credential.', 'NotAllowedError');

            await storeKey(name.trim(), credentialJson(credential));
            await queryClient.invalidateQueries({ queryKey: accountKeysQueryKey });
            toast.success('Security key added.');
            setName('');
            setPassword('');
        } catch (error) {
            if (!isCancelled(error)) toast.error(errorMessage(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <ContentBox title='Add Security Key' className='sk:flex-none sk:md:w-1/2'>
            <form onSubmit={(event) => void submit(event)} className='sk:flex sk:flex-col sk:gap-4'>
                <p className='sk:text-sm sk:text-muted-foreground'>
                    A YubiKey or any FIDO2 key, or this device’s passkey. Once added, the key is asked for after your password
                    (beside your authenticator app, if you use one).
                </p>
                <div>
                    <Label htmlFor='sk-name'>Key name</Label>
                    <Input id='sk-name' value={name} maxLength={64} onChange={(event) => setName(event.target.value)} placeholder='YubiKey 5C' />
                </div>
                <div>
                    <Label htmlFor='sk-password'>Current password</Label>
                    <Input
                        id='sk-password'
                        type='password'
                        autoComplete='current-password'
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                    />
                </div>
                {settings.passwordless && (
                    <label htmlFor='sk-passkey' className='sk:flex sk:items-start sk:gap-2 sk:text-sm'>
                        <Checkbox id='sk-passkey' checked={passkey} onChange={setPasskey} />
                        <span>
                            Use for passwordless sign-in
                            <span className='sk:block sk:text-muted-foreground'>
                                Stores a passkey on the key, protected by its PIN or fingerprint. Older keys without
                                passkey support can only be added with this unticked.
                            </span>
                        </span>
                    </label>
                )}
                {!supported && (
                    <p role='alert' className='sk:text-sm sk:text-destructive'>
                        This browser cannot use security keys.
                    </p>
                )}
                <div className='sk:flex sk:justify-end'>
                    <Button type='submit' disabled={!supported || !name.trim() || !password} isLoading={busy}>
                        Add key
                    </Button>
                </div>
            </form>
        </ContentBox>
    );
}

function RenameKey({ item }: { item: SecurityKey }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(item.name);

    return (
        <Dialog.ConfirmTrigger
            title='Rename Security Key'
            confirm='Save'
            onConfirmed={async (_event, close) => {
                try {
                    await renameKey(item.id, name.trim());
                    await queryClient.invalidateQueries({ queryKey: accountKeysQueryKey });
                    close();
                } catch (error) {
                    toast.error(errorMessage(error));
                }
            }}
            trigger={({ onClick }) => <EditAction aria-label={`Rename ${item.name}`} onClick={onClick} />}
        >
            <Label htmlFor={`sk-rename-${item.id}`}>Key name</Label>
            <Input id={`sk-rename-${item.id}`} value={name} maxLength={64} onChange={(event) => setName(event.target.value)} />
        </Dialog.ConfirmTrigger>
    );
}

function RemoveKey({ item }: { item: SecurityKey }) {
    const queryClient = useQueryClient();
    const [password, setPassword] = useState('');

    return (
        <Dialog.ConfirmTrigger
            title='Remove Security Key'
            confirm='Remove Key'
            onConfirmed={async (_event, close) => {
                try {
                    await deleteKey(item.id, password);
                    await queryClient.invalidateQueries({ queryKey: accountKeysQueryKey });
                    setPassword('');
                    close();
                } catch (error) {
                    toast.error(errorMessage(error));
                }
            }}
            trigger={({ onClick }) => <DeleteAction aria-label={`Remove ${item.name}`} onClick={onClick} />}
        >
            <p className='sk:mb-4'>
                <strong>{item.name}</strong> will no longer sign in to this account. Enter your password to confirm.
            </p>
            <Label htmlFor={`sk-remove-${item.id}`}>Current password</Label>
            <Input
                id={`sk-remove-${item.id}`}
                type='password'
                autoComplete='current-password'
                value={password}
                onChange={(event) => setPassword(event.target.value)}
            />
        </Dialog.ConfirmTrigger>
    );
}

/** Account → Security Keys. */
export default function KeysScreen() {
    const { data: keys } = useQuery({ queryKey: accountKeysQueryKey, queryFn: listKeys });
    const actions = useCallback(
        (key: SecurityKey) => (
            <>
                <RenameKey item={key} />
                <RemoveKey item={key} />
            </>
        ),
        []
    );

    return (
        <PageContentBlock title='Security Keys'>
            <div className='sk:my-10 sk:flex sk:flex-col sk:gap-8 sk:md:flex-row'>
                <AddKey />
                <ContentBox title='Security Keys' className='sk:min-w-0 sk:flex-1'>
                    <KeyList keys={keys} actions={actions} emptyDescription='Add a key to use it after your password when you sign in.' />
                </ContentBox>
            </div>
        </PageContentBlock>
    );
}
