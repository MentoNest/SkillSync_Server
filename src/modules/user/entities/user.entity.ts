import { UserRole } from '../../../common/enums/user-role.enum';

export interface Wallet {
  address: string;
  isPrimary: boolean;
  linkedAt: Date;
}

export class User {
  id: string;
  
  /** 
   * @deprecated Use wallets array instead. 
   * For backward compatibility, this returns the primary wallet address if available.
   */
  get publicKey(): string | undefined {
    return this.wallets?.find(w => w.isPrimary)?.address;
  }

  wallets: Wallet[] = [];
  
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

