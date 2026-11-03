<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Forges;

/** Where a repository lives. Every method throws ForgeException when the forge refuses. */
interface Forge
{
    /** The last commit of the branch. */
    public function head(string $branch): Commit;

    /**
     * The branch's last commits, newest first; empty when the forge cannot list them.
     *
     * @return list<Commit>
     */
    public function commits(string $branch, int $limit = 20): array;

    /**
     * Puts the commit's files in $directory, an empty folder, and returns the folder that holds
     * them: $directory itself or the one folder an archive wraps them in.
     */
    public function fetch(string $sha, string $directory): string;
}
