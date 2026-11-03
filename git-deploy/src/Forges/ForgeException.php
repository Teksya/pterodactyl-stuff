<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Forges;

use RuntimeException;

/** The forge refused a request or could not be reached. The message is safe to show: it never holds a token. */
final class ForgeException extends RuntimeException {}
