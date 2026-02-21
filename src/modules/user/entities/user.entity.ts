import { UserRole } from '../../../common/enums/user-role.enum';

export class User {
  id: string;
  /** Stellar G… public key — set for wallet-authenticated users */
  publicKey?: string;
  
  /** Undefined for wallet-only users */
  email?: string;

  password?: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
