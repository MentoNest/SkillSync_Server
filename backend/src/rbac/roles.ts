export enum RoleName {
  ADMIN = 'admin',
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  [RoleName.ADMIN]: ['users:read', 'users:write', 'roles:manage', 'audit:read'],
  [RoleName.MENTOR]: ['profile:read', 'profile:write', 'sessions:manage'],
  [RoleName.MENTEE]: ['profile:read', 'profile:write', 'sessions:book'],
};
