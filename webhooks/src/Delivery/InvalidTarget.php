<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Delivery;

use RuntimeException;

/** A target that cannot be sent to: its message is shown to whoever manages the endpoint. */
final class InvalidTarget extends RuntimeException {}
