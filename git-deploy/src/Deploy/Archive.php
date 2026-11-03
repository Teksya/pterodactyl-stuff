<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Deploy;

use FilesystemIterator;
use OlivierDutoit\GitDeploy\Forges\ForgeException;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ZipArchive;

/** The zip sent to the server: a commit's files, without .git and without the paths the server keeps. */
final class Archive
{
    /**
     * @param  list<string>  $excluded  paths relative to the root, such as .env or storage/
     * @return int the number of files
     */
    public static function build(string $source, string $zip, array $excluded): int
    {
        $archive = new ZipArchive();
        if ($archive->open($zip, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new ForgeException('The panel cannot write the archive.');
        }

        $count = 0;
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
        foreach ($files as $file) {
            $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($source) + 1));
            if (self::excluded($relative, $excluded)) {
                continue;
            }
            if ($file->isLink()) {
                continue;
            }
            if ($file->isDir()) {
                $archive->addEmptyDir($relative);
                continue;
            }
            $archive->addFile($file->getPathname(), $relative);
            // Keeps executable scripts executable.
            $archive->setExternalAttributesName($relative, ZipArchive::OPSYS_UNIX, (fileperms($file->getPathname()) & 0777 | 0100000) << 16);
            $count++;
        }

        $archive->close();

        return $count;
    }

    /** @param  list<string>  $excluded */
    public static function excluded(string $relative, array $excluded): bool
    {
        if ($relative === '.git' || str_starts_with($relative, '.git/') || $relative === '.deploy' || str_starts_with($relative, '.deploy/')) {
            return true;
        }
        foreach ($excluded as $path) {
            $path = trim($path, '/');
            if ($path !== '' && ($relative === $path || str_starts_with($relative, $path.'/'))) {
                return true;
            }
        }

        return false;
    }

    /** Removes a folder and everything in it. */
    public static function remove(string $directory): void
    {
        if (! is_dir($directory)) {
            return;
        }
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($files as $file) {
            $file->isDir() && ! $file->isLink() ? @rmdir($file->getPathname()) : @unlink($file->getPathname());
        }
        @rmdir($directory);
    }
}
