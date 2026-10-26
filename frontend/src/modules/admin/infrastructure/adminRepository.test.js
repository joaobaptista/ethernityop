import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminRepository } from './adminRepository.js';
import httpClient from '../../../core/api/httpClient.js';

describe('adminRepository Infrastructure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('batchDeleteUsers sends POST /admin/users/batch-delete with userIds payload and token', async () => {
    const postSpy = vi.spyOn(httpClient, 'post').mockResolvedValue({
      success: true,
      deletedCount: 3,
      message: '3 usuário(s) excluído(s) com sucesso.',
    });

    const userIds = ['user-1', 'user-2', 'user-3'];
    const res = await adminRepository.batchDeleteUsers('admin-token-xyz', userIds);

    expect(postSpy).toHaveBeenCalledWith(
      '/admin/users/batch-delete',
      { userIds },
      'admin-token-xyz'
    );
    expect(res.deletedCount).toBe(3);
    expect(res.success).toBe(true);
  });

  it('deleteUser sends DELETE /admin/users/:id with token', async () => {
    const delSpy = vi.spyOn(httpClient, 'delete').mockResolvedValue({
      success: true,
      message: 'Usuário excluído com sucesso.',
    });

    const res = await adminRepository.deleteUser('admin-token-xyz', 'user-target-99');

    expect(delSpy).toHaveBeenCalledWith(
      '/admin/users/user-target-99',
      'admin-token-xyz'
    );
    expect(res.success).toBe(true);
  });

  it('setUserAdminRole sends PATCH /admin/users/:id/role with boolean is_admin', async () => {
    const patchSpy = vi.spyOn(httpClient, 'patch').mockResolvedValue({
      success: true,
      is_admin: 1,
    });

    const res = await adminRepository.setUserAdminRole('admin-token-xyz', 'user-10', true);

    expect(patchSpy).toHaveBeenCalledWith(
      '/admin/users/user-10/role',
      { is_admin: true },
      'admin-token-xyz'
    );
    expect(res.is_admin).toBe(1);
  });
});
