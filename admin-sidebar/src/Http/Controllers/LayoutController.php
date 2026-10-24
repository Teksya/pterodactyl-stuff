<?php

declare(strict_types=1);

namespace OlivierDutoit\AdminSidebar\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OlivierDutoit\AdminSidebar\LayoutDocument;
use OlivierDutoit\AdminSidebar\Models\Layout;

/** The admin area's navigation, shared by every administrator. The admin API stack lets root administrators in only. */
final class LayoutController
{
    public function show(): JsonResponse
    {
        $stored = Layout::query()->orderBy('id')->first()?->layout;

        // Null until someone arranges it: the navigation uses its defaults.
        return new JsonResponse(['data' => is_array($stored) ? LayoutDocument::normalize($stored, lenient: true) : null]);
    }

    public function update(Request $request): JsonResponse
    {
        $layout = LayoutDocument::normalize($request->json()->all());
        $row = Layout::query()->orderBy('id')->first() ?? new Layout();
        $row->layout = $layout;
        $row->save();

        return new JsonResponse(['data' => $layout]);
    }

    /** Back to the defaults. */
    public function destroy(): JsonResponse
    {
        Layout::query()->delete();

        return new JsonResponse(['data' => null]);
    }
}
