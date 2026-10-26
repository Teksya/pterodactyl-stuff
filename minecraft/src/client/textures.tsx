import { useState } from 'react';
import { Avatar, cn } from '@pterodactyl/sdk';
import { shortName } from './players/items';
import { settings } from './settings';

// The newest version the picture services have; older items keep their pictures there.
const ASSETS_VERSION = '1.21.11';

/** Where an item's picture may be, best first: a 3D render, then the item's texture, then the block's. */
export function itemPictures(id: string): string[] {
    const [namespace, name] = id.includes(':') ? id.split(':', 2) : ['minecraft', id];
    // Mods' items have no picture there.
    if (!settings.textures || namespace !== 'minecraft' || !/^[a-z0-9_]+$/.test(name)) return [];

    return [
        `https://mc.nerothe.com/img/${ASSETS_VERSION}/minecraft_${name}.png`,
        `https://assets.mcasset.cloud/${ASSETS_VERSION}/assets/minecraft/textures/item/${name}.png`,
        `https://assets.mcasset.cloud/${ASSETS_VERSION}/assets/minecraft/textures/block/${name}.png`,
    ];
}

/** An item's picture, or its short name when no service has one. */
export function ItemIcon({ id, className }: { id: string; className?: string }) {
    const pictures = itemPictures(id);
    const [index, setIndex] = useState(0);

    if (index >= pictures.length) {
        return <span className={cn('mc:font-mono mc:text-[0.6rem] mc:font-bold mc:text-muted-foreground', className)}>{shortName(id)}</span>;
    }

    return (
        <img
            src={pictures[index]}
            alt=''
            loading='lazy'
            draggable={false}
            onError={() => setIndex(index + 1)}
            className={cn('mc:pointer-events-none mc:size-full mc:object-contain mc:[image-rendering:pixelated]', className)}
        />
    );
}

/** The skin's face: by UUID on online-mode servers, by name otherwise (the UUID is then the server's own). */
export function Head({ uuid, name, size = 32, className }: { uuid: string; name: string | null; size?: number; className?: string }) {
    const [failed, setFailed] = useState(false);

    if (!settings.textures || failed) {
        return (
            <span className={cn('mc:flex mc:shrink-0 mc:overflow-hidden mc:rounded-xs', className)} style={{ width: size, height: size }}>
                <Avatar name={uuid} size={size} square variant='pixel' />
            </span>
        );
    }

    return (
        <img
            src={`https://mc-heads.net/avatar/${encodeURIComponent(name ?? uuid)}/${size * 2}`}
            alt=''
            width={size}
            height={size}
            loading='lazy'
            onError={() => setFailed(true)}
            className={cn('mc:shrink-0 mc:rounded-xs mc:[image-rendering:pixelated]', className)}
        />
    );
}
