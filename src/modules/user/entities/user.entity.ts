import { UserRole } from '../../../common/enums/user-role.enum';

export class User {
  id: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
