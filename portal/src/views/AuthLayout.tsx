import { Main, cn, useThemeSettings, type LayoutBrand, type ViewProps } from '@pterodactyl/sdk/theme';
import Brand from './Brand';

// It imports nothing from @pterodactyl/sdk, so the sign-in screen renders without loading the full SDK first.

/** The texts of the brand half, set on Admin > Themes. */
interface Settings {
    tagline?: string;
    subtitle?: string;
}

/** The brand half of the screen, painted with the theme's primary and accent colours. */
function Showcase({ brand }: { brand: LayoutBrand }) {
    const { tagline, subtitle } = useThemeSettings<Settings>();

    return (
        <div className='relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between xl:p-16'>
            <div aria-hidden className='absolute inset-0 bg-linear-to-br from-primary via-primary to-accent' />
            <div
                aria-hidden
                className='absolute -top-1/4 -right-1/4 size-[36rem] rounded-full bg-accent/60 blur-3xl animate-drift motion-reduce:animate-none'
            />
            <div
                aria-hidden
                className='absolute -bottom-1/4 -left-1/5 size-[30rem] rounded-full bg-primary-foreground/15 blur-3xl animate-drift [animation-delay:-9s] motion-reduce:animate-none'
            />
            <div aria-hidden className='dots absolute inset-0 opacity-20' />
            <Brand brand={brand} className='relative' />
            <div className='relative max-w-md'>
                {/* The panel colours every paragraph with --foreground; these sit on the primary colour. */}
                <p className='font-header text-4xl leading-tight font-semibold tracking-tight text-balance text-primary-foreground xl:text-5xl'>
                    {tagline || 'Your servers, one sign-in away.'}
                </p>
                {subtitle !== '' && (
                    <p className='mt-5 text-base text-primary-foreground/80'>
                        {subtitle ?? 'Start, watch and manage every server from a single place.'}
                    </p>
                )}
            </div>
        </div>
    );
}

/** The sign-in pages: the brand on one half, the routed form centred on the other. */
export default function AuthLayout({ model, className, children }: ViewProps<'layout.auth'>) {
    const { brand } = model;

    return (
        <div className={cn('grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]', className)}>
            <Showcase brand={brand} />
            <div className='flex min-w-0 flex-col px-6 py-8 sm:px-10'>
                <Brand brand={brand} className='text-foreground lg:hidden [&_svg]:text-primary' />
                <Main className='flex flex-1 items-start justify-center py-12 sm:items-center'>
                    <div className='w-full max-w-sm'>{children}</div>
                </Main>
                <p className='text-center text-xs text-muted-foreground'>
                    &copy; 2015 - <span suppressHydrationWarning>{new Date().getFullYear()}</span>{' '}
                    <a
                        rel='noopener nofollow noreferrer'
                        href='https://pterodactyl.io'
                        target='_blank'
                        className='text-muted-foreground no-underline hover:text-foreground'
                    >
                        Pterodactyl Software
                    </a>
                </p>
            </div>
        </div>
    );
}
