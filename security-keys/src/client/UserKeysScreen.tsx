import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ContentBox,
    DeleteAction,
    Dialog,
    httpErrorToHuman,
    toast,
    useCurrentResource,
    type ScreenComponentProps,
} from '@pterodactyl/sdk';
import { deleteUserKey, listUserKeys, userKeysQueryKey, type SecurityKey } from './api';
import KeyList from './KeyList';

/** Admin → Users → a user → Security Keys: removing a lost key lets its owner back in. */
export default function UserKeysScreen(_props: ScreenComponentProps) {
    const resource = useCurrentResource();
    const userId = resource?.kind === 'admin.user' ? resource.resource.attributes.id : 0;
    const queryClient = useQueryClient();
    const { data: keys } = useQuery({ queryKey: userKeysQueryKey(userId), queryFn: () => listUserKeys(userId), enabled: userId > 0 });
    const actions = useCallback(
        (key: SecurityKey) => (
            <Dialog.ConfirmTrigger
                title='Remove Security Key'
                confirm='Remove Key'
                onConfirmed={async (_event, close) => {
                    try {
                        await deleteUserKey(userId, key.id);
                        await queryClient.invalidateQueries({ queryKey: userKeysQueryKey(userId) });
                        close();
                    } catch (error) {
                        toast.error(httpErrorToHuman(error));
                    }
                }}
                trigger={({ onClick }) => <DeleteAction aria-label={`Remove ${key.name}`} onClick={onClick} />}
            >
                <strong>{key.name}</strong> will no longer sign in to this account. If it was the account’s only second
                factor, the user signs in with their password alone until they add another.
            </Dialog.ConfirmTrigger>
        ),
        [queryClient, userId]
    );

    return (
        <ContentBox title='Security Keys'>
            <KeyList keys={keys} actions={actions} emptyDescription='This user has not added a security key.' />
        </ContentBox>
    );
}
