<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Events;

/** How an event is coloured and prioritised by the providers that support it. */
enum Severity: string
{
    case Info = 'info';
    case Success = 'success';
    case Warning = 'warning';
    case Danger = 'danger';

    /** RGB colour, as Discord embeds take it. */
    public function color(): int
    {
        return match ($this) {
            self::Info => 0x3B82F6,
            self::Success => 0x22C55E,
            self::Warning => 0xF59E0B,
            self::Danger => 0xEF4444,
        };
    }

    public function hex(): string
    {
        return sprintf('#%06x', $this->color());
    }

    /** 1 (min) to 5 (max), as ntfy and Gotify-like services take it. */
    public function priority(): int
    {
        return match ($this) {
            self::Info, self::Success => 3,
            self::Warning => 4,
            self::Danger => 5,
        };
    }
}
