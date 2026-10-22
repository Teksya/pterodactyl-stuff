<?php

declare(strict_types=1);

namespace OlivierDutoit\SecurityKeys\WebAuthn;

use RuntimeException;

/** A registration or sign-in with a security key that cannot be accepted. */
final class InvalidCeremony extends RuntimeException {}
