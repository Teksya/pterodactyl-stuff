import { useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, SearchX } from 'lucide-react';
import { Button, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Input, Select } from '@pterodactyl/sdk';
import { cn, type ViewProps } from '@pterodactyl/sdk/theme';
import { PAGE_SIZES, usePaging, type PageSize, type Paging } from './paging';

const number = new Intl.NumberFormat();
// The Select's values are strings: 0 ("All") would read as no value.
const sizeOptions = PAGE_SIZES.map((size) => ({ value: String(size), label: size === 0 ? 'All' : number.format(size) }));

/** First, previous, the page out of how many, next, last. */
function PageButtons({ paging, onTurn }: { paging: Paging; onTurn?: () => void }) {
    const { page, pages, setPage } = paging;
    const turn = (to: number) => {
        setPage(to);
        onTurn?.();
    };
    const button = (label: string, to: number, Icon: typeof ChevronLeft, disabled: boolean) => (
        <Button size='xsmall' isSecondary disabled={disabled} onClick={() => turn(to)} title={label} aria-label={label} className='fp:px-1.5'>
            <Icon aria-hidden className='fp:size-4' />
        </Button>
    );

    return (
        <div className='fp:flex fp:items-center fp:gap-1'>
            {button('First page', 0, ChevronsLeft, page === 0)}
            {button('Previous page', page - 1, ChevronLeft, page === 0)}
            <span className='fp:min-w-24 fp:px-1 fp:text-center fp:text-sm fp:text-muted-foreground'>
                Page {number.format(page + 1)} of {number.format(pages)}
            </span>
            {button('Next page', page + 1, ChevronRight, page >= pages - 1)}
            {button('Last page', pages - 1, ChevronsRight, page >= pages - 1)}
        </div>
    );
}

/** "101–200 of 1,234", and how many the folder holds while a filter is on. */
function Range({ paging }: { paging: Paging }) {
    const { start, end, matching, total, filter } = paging;

    return (
        <span className='fp:text-sm fp:text-muted-foreground'>
            {matching === 0 ? 'None' : `${number.format(start + 1)}–${number.format(end)}`} of {number.format(matching)}
            {filter.trim() !== '' && ` matching, ${number.format(total)} in the folder`}
        </span>
    );
}

/**
 * The file list with its pages: above it a filter by name, the range shown, the page size and the
 * pages; below it the pages again, once there is more than one. An empty folder shows the list alone.
 */
export default function PagedList({ model, Default, className }: ViewProps<'server.files.manager.list'>) {
    const paging = usePaging();
    const top = useRef<HTMLDivElement>(null);
    if (!paging || model.loading || paging.total === 0) return <Default model={model} className={className} />;

    const nothingMatches = paging.matching === 0;

    return (
        <div className={cn('fp:flex fp:flex-col fp:gap-2', className)}>
            <div ref={top} className='fp:flex fp:scroll-mt-20 fp:flex-wrap fp:items-center fp:gap-x-4 fp:gap-y-2'>
                <div className='fp:relative fp:w-full fp:sm:w-64'>
                    <Search aria-hidden className='fp:pointer-events-none fp:absolute fp:top-1/2 fp:left-3 fp:size-4 fp:-translate-y-1/2 fp:text-muted-foreground' />
                    <Input
                        type='search'
                        aria-label='Filter this folder by name'
                        placeholder='Filter this folder'
                        value={paging.filter}
                        onChange={(event) => paging.setFilter(event.target.value)}
                        className='fp:pl-9'
                    />
                </div>
                <Range paging={paging} />
                <div className='fp:ml-auto fp:flex fp:flex-wrap fp:items-center fp:gap-x-4 fp:gap-y-2'>
                    <div className='fp:flex fp:items-center fp:gap-2 fp:text-sm fp:text-muted-foreground'>
                        <span id='fp-page-size'>Per page</span>
                        <div className='fp:w-24' aria-labelledby='fp-page-size'>
                            <Select value={String(paging.size)} options={sizeOptions} onChange={(value) => paging.setSize(Number(value) as PageSize)} />
                        </div>
                    </div>
                    {paging.pages > 1 && <PageButtons paging={paging} />}
                </div>
            </div>
            {nothingMatches ? (
                <Empty size='compact' className='fp:border'>
                    <EmptyHeader>
                        <EmptyMedia variant='icon'>
                            <SearchX />
                        </EmptyMedia>
                        <EmptyTitle>No files match</EmptyTitle>
                        <EmptyDescription>No name in this folder holds “{paging.filter.trim()}”.</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <Default model={model} />
            )}
            {paging.pages > 1 && (
                <div className='fp:flex fp:flex-wrap fp:items-center fp:justify-between fp:gap-2'>
                    <Range paging={paging} />
                    {/* Turning the page from the foot brings its top back into view. */}
                    <PageButtons paging={paging} onTurn={() => top.current?.scrollIntoView?.({ block: 'start' })} />
                </div>
            )}
        </div>
    );
}
