import { cn, type LayoutBrand } from '@pterodactyl/sdk/theme';
import PterodactylMark from './PterodactylMark';

/** The theme's logo when it sets one (otherwise the Pterodactyl mark) beside the panel's name. */
export default function Brand({
    brand,
    className,
    nameClassName,
    logoClassName,
}: {
    brand: LayoutBrand;
    className?: string;
    nameClassName?: string;
    logoClassName?: string;
}) {
    return (
        <span className={cn('flex min-w-0 items-center gap-3', className)}>
            {/* The name beside it says what the logo is. */}
            {brand.logoUrl ? (
                <img src={brand.logoUrl} alt='' className={cn('h-8 w-auto max-w-24 shrink-0 object-contain', logoClassName)} />
            ) : (
                <PterodactylMark className='h-8 w-auto shrink-0' />
            )}
            <span className={cn('truncate font-header text-lg font-semibold tracking-tight', nameClassName)}>{brand.name}</span>
        </span>
    );
}
