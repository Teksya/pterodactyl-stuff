<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Http;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use OlivierDutoit\Webhooks\Delivery\Dispatcher;
use OlivierDutoit\Webhooks\Delivery\InvalidTarget;
use OlivierDutoit\Webhooks\Delivery\Sender;
use OlivierDutoit\Webhooks\Delivery\TargetGuard;
use OlivierDutoit\Webhooks\Events\EventBuilder;
use OlivierDutoit\Webhooks\Events\EventCatalog;
use OlivierDutoit\Webhooks\Models\Delivery;
use OlivierDutoit\Webhooks\Models\Endpoint;
use OlivierDutoit\Webhooks\Scope;
use OlivierDutoit\Webhooks\Settings;
use OlivierDutoit\Webhooks\Targets\Field;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\Provider;
use OlivierDutoit\Webhooks\Targets\ProviderRegistry;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\User;

/** What every endpoint screen does, whoever owns the endpoints. */
final readonly class EndpointService
{
    public function __construct(
        private ProviderRegistry $providers,
        private TargetGuard $guard,
        private Sender $sender,
        private Dispatcher $dispatcher,
        private EventBuilder $builder,
    ) {}

    /** @return array<string, mixed> what the editor needs: providers, events, limits */
    public function meta(Owner $owner): array
    {
        $allowed = $owner->providers();

        return [
            'scope' => $owner->scope->value,
            'providers' => array_values(array_map(
                fn (Provider $provider): array => $provider->toArray(),
                array_filter($this->providers->all(), fn (Provider $provider): bool => in_array($provider->id(), $allowed, true)),
            )),
            'groups' => EventCatalog::groupsFor($owner->scope),
            'limit' => $owner->limit(),
            'count' => $owner->endpoints()->count(),
            'private_targets' => $owner->allowsPrivateTargets(),
            'monitor' => Settings::bool('monitor'),
            'monitor_interval' => Settings::int('monitor_interval', 1, 60),
            'enabled' => Settings::scopeEnabled($owner->scope),
        ];
    }

    /** @return list<array<string, mixed>> */
    public function list(Builder $query): array
    {
        return $query->with(['server:id,name,uuidShort', 'user:id,username'])->orderBy('name')->get()
            ->map(fn (Endpoint $endpoint): array => $this->present($endpoint))
            ->all();
    }

    /** @return array<string, mixed> */
    public function present(Endpoint $endpoint): array
    {
        return [
            ...$endpoint->toPanelArray($this->providers),
            'server' => $endpoint->server !== null ? ['id' => $endpoint->server->id, 'name' => $endpoint->server->name, 'identifier' => $endpoint->server->uuidShort] : null,
            'user' => $endpoint->user !== null ? ['id' => $endpoint->user->id, 'username' => $endpoint->user->username] : null,
        ];
    }

    /**
     * Create an endpoint, or update `$endpoint`, from the request. `$privileged` is a root
     * administrator on the admin screens, whom the limits set for users do not bind.
     */
    public function save(Owner $owner, Request $request, User $actor, ?Endpoint $endpoint = null, bool $privileged = false): Endpoint
    {
        // Existing ones can still be edited (or turned off) while new ones are refused.
        if ($endpoint === null && ! $privileged && ! Settings::scopeEnabled($owner->scope)) {
            throw new DisplayException('The administrator has turned these webhooks off.');
        }

        $providerId = (string) $request->input('provider', $endpoint?->provider ?? '');
        // Server and account endpoints only receive through the services users may choose (see Dispatcher::wants()).
        $allowed = in_array($providerId, $owner->providers(), true) || $providerId === $endpoint?->provider;
        $provider = $allowed ? $this->providers->find($providerId) : null;
        if ($provider === null) {
            throw ValidationException::withMessages(['provider' => 'Choose one of the available services.']);
        }

        $config = $request->input('config');
        $config = is_array($config) ? $config : [];
        $data = Validator::make($request->all(), $this->rules($owner, $provider, $config, $endpoint), [], [
            'events.*' => 'event',
            ...$this->attributeNames($provider),
        ])->validate();

        $events = $this->events($owner, $data['events']);

        try {
            $config = $provider->normalize($config, $endpoint?->config ?? []);
        } catch (InvalidArgumentException $exception) {
            throw ValidationException::withMessages(['config' => $exception->getMessage()]);
        }

        $this->checkTarget($owner, $provider, $config, $actor);

        if ($endpoint === null && ! $privileged && ($limit = $owner->limit()) !== null && $owner->endpoints()->count() >= $limit) {
            throw new DisplayException($limit === 0 ? 'The administrator does not allow these webhooks.' : sprintf('At most %d webhooks can be created here.', $limit));
        }

        $enabled = (bool) ($data['enabled'] ?? $endpoint?->enabled ?? true);
        $endpoint ??= new Endpoint([
            'uuid' => (string) Str::uuid(),
            'scope' => $owner->scope,
            'server_id' => $owner->server?->id,
            'user_id' => $owner->user?->id,
            'created_by' => $actor->id,
        ]);
        $created = ! $endpoint->exists;
        $reenabled = $enabled && ! $endpoint->enabled;

        $endpoint->fill([
            'name' => trim((string) $data['name']),
            'provider' => $provider->id(),
            'config' => $config,
            'target_label' => Str::limit($provider->targetLabel($config), 180),
            'events' => $events,
            'filters' => $owner->scope !== Scope::Admin ? null : (! array_key_exists('filters', $data) && $endpoint->exists ? $endpoint->filters : [
                'servers' => array_values(array_map(intval(...), $data['filters']['servers'] ?? [])),
                'nodes' => array_values(array_map(intval(...), $data['filters']['nodes'] ?? [])),
            ]),
            'enabled' => $enabled,
        ]);
        if ($created || $reenabled) {
            $endpoint->failure_count = 0;
            $endpoint->disabled_reason = null;
        }
        $endpoint->save();
        Dispatcher::forget();

        $this->log($owner, $created ? 'create' : 'update', $endpoint);

        return $endpoint;
    }

    public function delete(Owner $owner, Endpoint $endpoint): void
    {
        $endpoint->delete();
        Dispatcher::forget();
        $this->log($owner, 'delete', $endpoint);
    }

    /** Send a test event now and return how it went. */
    public function test(Endpoint $endpoint, User $actor): Delivery
    {
        $delivery = $this->dispatcher->createDelivery($endpoint, $this->builder->test($endpoint->server, $actor));

        return $this->sender->deliverNow($delivery);
    }

    /** Send a past delivery's payload again, as a new delivery. */
    public function redeliver(Delivery $original): Delivery
    {
        $uuid = (string) Str::uuid();
        $delivery = Delivery::query()->create([
            'uuid' => $uuid,
            'endpoint_id' => $original->endpoint_id,
            'event' => $original->event,
            'payload' => ['id' => $uuid] + $original->payload,
            'status' => Delivery::PENDING,
            'is_test' => $original->is_test,
        ])->setRelation('endpoint', $original->endpoint);

        return $this->sender->deliverNow($delivery);
    }

    /** @param Builder<Delivery> $query */
    public function deliveries(Builder $query, Request $request): LengthAwarePaginator
    {
        $status = $request->query('status');

        return $query
            ->when(in_array($status, [Delivery::PENDING, Delivery::SUCCESS, Delivery::FAILED, Delivery::SKIPPED], true), fn (Builder $inner) => $inner->where('status', $status))
            ->when(is_string($request->query('event')) && $request->query('event') !== '', fn (Builder $inner) => $inner->where('event', 'like', str_replace(['%', '_'], ['\%', '\_'], (string) $request->query('event')).'%'))
            ->orderByDesc('id')
            ->paginate(min(100, max(10, (int) $request->query('per_page', 25))));
    }

    /** @return array{data: list<array<string, mixed>>, meta: array{page: int, per_page: int, total: int}} */
    public function paginated(LengthAwarePaginator $page, ?callable $extra = null): array
    {
        return [
            'data' => array_map(fn (Delivery $delivery): array => [...$delivery->toPanelArray(), ...($extra !== null ? $extra($delivery) : [])], $page->items()),
            'meta' => ['page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ];
    }

    /** @return array<string, list<mixed>> */
    private function rules(Owner $owner, Provider $provider, array $config, ?Endpoint $endpoint): array
    {
        $rules = [
            'name' => ['required', 'string', 'max:100'],
            'provider' => ['required', 'string'],
            'config' => ['present', 'array'],
            'events' => ['required', 'array', 'min:1', 'max:300'],
            'events.*' => ['string', 'max:191', 'regex:/^(\*|[a-z][a-z0-9-]*:[a-z0-9.*_-]+)$/'],
            'enabled' => ['sometimes', 'boolean'],
        ];

        if ($owner->scope === Scope::Admin) {
            $rules['filters'] = ['sometimes', 'nullable', 'array'];
            $rules['filters.servers'] = ['sometimes', 'array', 'max:500'];
            $rules['filters.servers.*'] = ['integer'];
            $rules['filters.nodes'] = ['sometimes', 'array', 'max:200'];
            $rules['filters.nodes.*'] = ['integer'];
        }

        $secrets = array_column(array_filter($provider->fields(), fn (Field $field): bool => $field->secret), 'key');
        foreach ($provider->rules() as $key => $fieldRules) {
            $field = substr($key, strlen('config.'));
            $value = $config[$field] ?? null;
            // A secret sent back masked, or left out, keeps its stored value: nothing to check.
            if ($endpoint !== null && in_array($field, $secrets, true) && ($value === Provider::MASK || ! array_key_exists($field, $config))) {
                continue;
            }

            $rules[$key] = $fieldRules;
        }

        return $rules;
    }

    /** @return array<string, string> */
    private function attributeNames(Provider $provider): array
    {
        $names = [];
        foreach ($provider->fields() as $field) {
            $names['config.'.$field->key] = mb_strtolower($field->label);
        }

        return $names;
    }

    /**
     * The subscription, checked against what the scope can receive: catalogue keys of the
     * scope, or patterns under the scope's own prefixes.
     *
     * @param  list<string>  $events
     * @return list<string>
     */
    private function events(Owner $owner, array $events): array
    {
        $prefixes = match ($owner->scope) {
            Scope::Admin => null,
            Scope::Server => ['server:'],
            Scope::Account => ['user:', 'auth:'],
        };

        $clean = [];
        foreach (array_values(array_unique($events)) as $index => $event) {
            $allowed = $prefixes === null || (
                str_contains($event, '*')
                    ? array_filter($prefixes, fn (string $prefix): bool => str_starts_with($event, $prefix)) !== []
                    : EventCatalog::definition($event)->availableTo($owner->scope)
            );

            if (! $allowed) {
                throw ValidationException::withMessages(["events.$index" => sprintf('"%s" is not an event these webhooks can receive.', $event)]);
            }

            $clean[] = $event;
        }

        return $clean;
    }

    /** Build the request a test would send and check where it goes, so a bad target fails on save. */
    private function checkTarget(Owner $owner, Provider $provider, array $config, User $actor): void
    {
        try {
            $payload = $this->builder->test($owner->server, $actor)->payload($owner->scope, (string) Str::uuid());
            $request = $provider->request($config, $payload, Message::fromPayload($payload));
            $this->guard->check($request->url, $owner->allowsPrivateTargets());
        } catch (InvalidTarget|InvalidArgumentException $exception) {
            throw ValidationException::withMessages(['config.url' => $exception->getMessage()]);
        }
    }

    private function log(Owner $owner, string $action, Endpoint $endpoint): void
    {
        $activity = Activity::event($owner->activityPrefix().':webhook.'.$action)
            ->property(['name' => $endpoint->name, 'provider' => $endpoint->provider]);

        if ($owner->server !== null) {
            $activity->subject($owner->server);
        } elseif ($owner->user !== null) {
            $activity->subject($owner->user);
        }

        $activity->log();
    }
}
