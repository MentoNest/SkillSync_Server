import { RolesGuard as RbacRolesGuard } from '../../rbac/roles.guard';
import { RolesGuard } from './roles.guard';

describe('auth RolesGuard re-export', () => {
  it('is the rbac RolesGuard implementation', () => {
    expect(RolesGuard).toBe(RbacRolesGuard);
  });
});
