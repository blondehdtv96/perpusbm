<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RolePermissionController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => ['roles' => Role::with('permissions:id,name')->get(), 'permissions' => Permission::orderBy('name')->get(['id', 'name'])]]);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        abort_if($role->name === 'super_admin', 422, 'Permission Super Admin tidak dapat dikurangi.');
        $data = $request->validate(['permissions' => ['required', 'array'], 'permissions.*' => ['string', Rule::exists('permissions', 'name')]]);
        $role->syncPermissions($data['permissions']);
        ActivityLogger::log($request, 'role.permissions_updated', $role, ['permissions' => $data['permissions']]);

        return response()->json(['data' => $role->load('permissions:id,name')]);
    }
}
