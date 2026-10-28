<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Http;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use OlivierDutoit\Subdomains\Dns\DnsException;
use OlivierDutoit\Subdomains\Dns\DnsProvider;
use OlivierDutoit\Subdomains\Jobs\DeleteRecords;
use OlivierDutoit\Subdomains\Models\Subdomain;
use OlivierDutoit\Subdomains\Records\Planner;
use OlivierDutoit\Subdomains\Records\Services;
use OlivierDutoit\Subdomains\Records\Syncer;
use OlivierDutoit\Subdomains\Settings;
use OlivierDutoit\Subdomains\SubdomainsProvider;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Throwable;

/**
 * What the server and admin screens share. `privileged` is a root administrator: not limited
 * in number, and still able to make subdomains while users are not allowed to.
 */
final class SubdomainService
{
    public function __construct(private readonly Syncer $syncer, private readonly DnsProvider $dns) {}

    /** @return array<string, mixed> */
    public function meta(Server $server, bool $privileged, bool $canManage): array
    {
        $server->loadMissing('allocations');

        return [
            'configured' => Settings::configured(),
            'enabled' => $privileged || Settings::bool('server_subdomains'),
            'domains' => Settings::domains(),
            'limit' => $privileged ? null : Settings::int('max_per_server', 0, 20),
            'count' => Subdomain::query()->where('server_id', $server->id)->count(),
            'min_length' => Settings::int('min_length', 1, 20),
            'can_manage' => $canManage,
            'service' => Services::for($server),
            'allocations' => $server->allocations->sortBy('port')->values()->map(fn (Allocation $allocation): array => [
                'id' => $allocation->id,
                'ip' => $allocation->ip,
                'alias' => $allocation->ip_alias,
                'port' => (int) $allocation->port,
                'primary' => $allocation->id === $server->allocation_id,
            ])->all(),
        ];
    }

    /**
     * @param  Builder<Subdomain>  $query
     * @return list<array<string, mixed>>
     */
    public function list(Builder $query, bool $withServer = false): array
    {
        return $query->with(['server.allocation', 'server.allocations'])->orderBy('domain')->orderBy('name')->get()
            ->map(fn (Subdomain $subdomain): array => $this->present($subdomain, $withServer))
            ->values()
            ->all();
    }

    /** @return array<string, mixed> */
    public function present(Subdomain $subdomain, bool $withServer = false): array
    {
        $allocation = Planner::allocationOf($subdomain, $subdomain->server);
        $srv = in_array('srv', array_column($subdomain->records ?? [], 'role'), true);
        $port = $allocation !== null ? (int) $allocation->port : null;

        return [
            'id' => $subdomain->id,
            'name' => $subdomain->name,
            'domain' => $subdomain->domain,
            'host' => $subdomain->host(),
            'address' => $srv || $port === null ? $subdomain->host() : $subdomain->host().':'.$port,
            'srv' => $srv,
            'port' => $port,
            'allocation_id' => $subdomain->allocation_id,
            'follows_primary' => $subdomain->allocation_id === null,
            'records' => array_map(fn (array $record): array => ['type' => $record['type'], 'name' => $record['name']], $subdomain->records ?? []),
            'status' => $subdomain->status,
            'error' => $subdomain->error,
            'synced_at' => $subdomain->synced_at?->toAtomString(),
            'created_at' => $subdomain->created_at->toAtomString(),
            'server' => $withServer ? ['id' => $subdomain->server->id, 'name' => $subdomain->server->name, 'identifier' => $subdomain->server->uuidShort] : null,
        ];
    }

    /** @return array{available: bool|null, reason: string|null} null when the provider could not be asked */
    public function available(string $name, string $domain): array
    {
        $refusal = $this->refusal($name, $domain);
        if ($refusal !== null) {
            return ['available' => false, 'reason' => $refusal[1]];
        }

        try {
            if ($this->dns->find($this->dns->zoneFor($domain), $name.'.'.$domain) !== []) {
                return ['available' => false, 'reason' => 'This name already has records at Cloudflare.'];
            }
        } catch (DnsException $exception) {
            return ['available' => null, 'reason' => $exception->getMessage()];
        }

        return ['available' => true, 'reason' => null];
    }

    public function create(Server $server, Request $request, User $actor, bool $privileged): Subdomain
    {
        $this->authorizeEnabled($privileged);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:63'],
            'domain' => ['required', 'string', 'max:191'],
            'allocation_id' => ['nullable', 'integer'],
        ]);

        $name = strtolower(trim((string) $data['name']));
        $domain = strtolower(trim((string) $data['domain']));
        $refusal = $this->refusal($name, $domain);
        if ($refusal !== null) {
            throw ValidationException::withMessages([$refusal[0] => $refusal[1]]);
        }

        $limit = Settings::int('max_per_server', 0, 20);
        if (! $privileged && Subdomain::query()->where('server_id', $server->id)->count() >= $limit) {
            throw ValidationException::withMessages(['name' => $limit === 0 ? 'Subdomains are not available for this server.' : sprintf('This server already has %d subdomain(s), the most it can have.', $limit)]);
        }

        try {
            $subdomain = Subdomain::query()->create([
                'server_id' => $server->id,
                'allocation_id' => $this->allocationId($server, $data['allocation_id'] ?? null),
                'name' => $name,
                'domain' => $domain,
                'status' => Subdomain::PENDING,
                'created_by' => $actor->id,
            ]);
        } catch (QueryException) {
            throw ValidationException::withMessages(['name' => 'This name is taken.']);
        }

        $subdomain->setRelation('server', $server);

        try {
            $this->syncer->create($subdomain);
        } catch (DnsException $exception) {
            $subdomain->delete();
            throw ValidationException::withMessages([str_contains($exception->getMessage(), 'already has') ? 'name' : 'dns' => $exception->getMessage()]);
        }

        $this->log('server:subdomain.create', $subdomain, $privileged);

        return $subdomain;
    }

    /** Points the subdomain at another of the server's allocations, or back at the primary one (null). */
    public function update(Subdomain $subdomain, Request $request, bool $privileged): Subdomain
    {
        $this->authorizeEnabled($privileged);
        $data = $request->validate(['allocation_id' => ['nullable', 'integer']]);

        $subdomain->allocation_id = $this->allocationId($subdomain->server, $data['allocation_id'] ?? null);
        $subdomain->save();

        if (! $this->syncer->sync($subdomain)) {
            throw ValidationException::withMessages(['dns' => (string) $subdomain->error]);
        }

        return $subdomain;
    }

    /** The records go first; when the provider fails, the subdomain goes anyway and a job retries them. */
    public function delete(Subdomain $subdomain, bool $privileged): void
    {
        $this->authorizeEnabled($privileged);
        $records = $subdomain->recordRefs();

        try {
            $this->syncer->remove($records);
        } catch (DnsException) {
            DeleteRecords::dispatch($records)->delay(now()->addMinute());
        }

        $subdomain->delete();
        $this->log('server:subdomain.delete', $subdomain, $privileged);
    }

    public function resync(Subdomain $subdomain): Subdomain
    {
        $this->syncer->sync($subdomain);

        return $subdomain;
    }

    /**
     * Why a name cannot be taken, before asking the provider.
     *
     * @return array{0: 'name'|'domain', 1: string}|null the field at fault and why
     */
    private function refusal(string $name, string $domain): ?array
    {
        $min = Settings::int('min_length', 1, 20);
        if (strlen($name) < $min || ! preg_match(SubdomainsProvider::LABEL, $name)) {
            return ['name', sprintf('Use %d to 63 lower-case letters, digits and hyphens, without a hyphen at either end.', $min)];
        }
        if (! in_array($domain, Settings::domains(), true)) {
            return ['domain', 'Choose one of the offered domains.'];
        }
        if (in_array($name, Settings::strings('reserved'), true)) {
            return ['name', 'This name is reserved.'];
        }
        if (Subdomain::query()->where('domain', $domain)->where('name', $name)->exists()) {
            return ['name', 'This name is taken.'];
        }

        return null;
    }

    private function allocationId(Server $server, mixed $id): ?int
    {
        if ($id === null) {
            return null;
        }

        if (! $server->allocations()->whereKey((int) $id)->exists()) {
            throw ValidationException::withMessages(['allocation_id' => 'Choose one of the server\'s allocations.']);
        }

        return (int) $id;
    }

    private function authorizeEnabled(bool $privileged): void
    {
        if (! Settings::configured()) {
            throw ValidationException::withMessages(['dns' => 'The administrator has not finished setting up subdomains.']);
        }
        abort_unless($privileged || Settings::bool('server_subdomains'), 403, 'The administrator has turned subdomains off.');
    }

    private function log(string $event, Subdomain $subdomain, bool $privileged): void
    {
        if ($privileged) {
            return;
        }

        try {
            Activity::event($event)->property('subdomain', $subdomain->host())->log();
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
