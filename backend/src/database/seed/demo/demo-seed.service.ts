import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createHmac, randomBytes } from 'crypto';
import { User } from '../../../entities/user.entity';

// ---------------------------------------------------------------------------
// Deterministic 56-char wallet addresses (idempotent across seed runs)
// ---------------------------------------------------------------------------
const DEMO_WALLETS = {
  mentors: [
    'GDEMO1MENTORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'GDEMO2MENTORBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    'GDEMO3MENTORCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    'GDEMO4MENTORDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
    'GDEMO5MENTOREEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
  ],
  mentees: [
    'GDEMO1MENTEEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'GDEMO2MENTEEBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    'GDEMO3MENTEECCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    'GDEMO4MENTEEDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
    'GDEMO5MENTEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
  ],
};

// ---------------------------------------------------------------------------
// Crypto helpers (intentionally inlined — do NOT import EncryptionService so
// this seed can run without the full DI graph being set up).
// ---------------------------------------------------------------------------
function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: 16,
  } as Parameters<typeof createCipheriv>[3]);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return `${iv.toString('hex')}:${(cipher as any).getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

function hmacHash(value: string, hmacKey: Buffer): string {
  return createHmac('sha256', hmacKey).update(value, 'utf8').digest('hex');
}

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async seed(): Promise<void> {
    this.logger.log('Seeding demo accounts...');

    const encKeyHex = this.configService.get<string>('ENCRYPTION_KEY');
    const hmacKeyHex = this.configService.get<string>('ENCRYPTION_HMAC_KEY');

    if (!encKeyHex || !hmacKeyHex) {
      this.logger.warn(
        'ENCRYPTION_KEY or ENCRYPTION_HMAC_KEY is not set — skipping demo seed.',
      );
      return;
    }

    const encKey = Buffer.from(encKeyHex, 'hex');
    const hmacKey = Buffer.from(hmacKeyHex, 'hex');

    let created = 0;
    let skipped = 0;

    const entries: Array<{ wallet: string; role: 'mentor' | 'mentee' }> = [
      ...DEMO_WALLETS.mentors.map((w) => ({ wallet: w, role: 'mentor' as const })),
      ...DEMO_WALLETS.mentees.map((w) => ({ wallet: w, role: 'mentee' as const })),
    ];

    for (const { wallet, role } of entries) {
      const walletHash = hmacHash(wallet, hmacKey);

      const existing = await this.userRepo.findOne({ where: { walletHash } });
      if (existing) {
        this.logger.log(`Demo ${role} already exists, skipping: ${wallet.slice(0, 12)}...`);
        skipped++;
        continue;
      }

      const encryptedWallet = encrypt(wallet, encKey);

      const user = this.userRepo.create({
        wallet: encryptedWallet,
        walletHash,
        roles: [role],
        permissions: [],
      });

      await this.userRepo.save(user);
      this.logger.log(`Created demo ${role}: ${wallet}`);
      created++;
    }

    this.logger.log(
      `Demo seed complete: ${created} created, ${skipped} skipped`,
    );
  }
}
