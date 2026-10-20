
import {
  BadRequestException,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
  Body,
  Post,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2, EventEmitterModule, OnEvent } from '@nestjs/event-emitter';
import {
  DataSource,
  EntityManager,
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  Repository,
} from 'typeorm';
import {
  IsBase64,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  createPublicKey,
  verify as cryptoVerify,
} from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';

// ============================================================
// CONSTANTS
// ============================================================

export const OFFCHAIN_APPROVAL_EXECUTED =
  'OffchainApprovalExecuted';

const ED25519_SPKI_PREFIX = Buffer.from(
  '302a300506032b6570032100',
  'hex',
);

export const APPROVAL_SESSION_REPOSITORY =
  'APPROVAL_SESSION_REPOSITORY';

// ============================================================
// DTO
// ============================================================

export class ApproveWithSignatureDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  session_id: string;

  @IsString()
  @IsNotEmpty()
  @IsBase64()
  buyer_sig: string;

  @IsString()
  @IsNotEmpty()
  @IsBase64()
  seller_sig: string;
}

// ============================================================
// NONCE ENTITY
// ============================================================

@Entity('offchain_approval_nonces')
export class ApprovalNonce {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  address: string;

  @Column({ type: 'bigint', default: 0 })
  nonce: string;

  @UpdateDateColumn()
  updatedAt: Date;
}

// ============================================================
// SESSION INTERFACES
// Adapt these to your existing session entity.
// ============================================================

export interface ApprovalSession {
  id: string;
  buyerAddress: string;
  sellerAddress: string;
  status: string;
}

export interface ApprovalSessionRepository {
  findForApproval(
    sessionId: string,
    manager: EntityManager,
  ): Promise<ApprovalSession | null>;

  markApproved(
    session: ApprovalSession,
    manager: EntityManager,
  ): Promise<void>;
}

export interface ApprovalExecutedEvent {
  session_id: string;
  buyer_address: string;
  seller_address: string;
  buyer_nonce: string;
  seller_nonce: string;
}

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class OffchainApprovalService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,

    @InjectRepository(ApprovalNonce)
    private readonly nonceRepository: Repository<ApprovalNonce>,

    @Inject(APPROVAL_SESSION_REPOSITORY)
    private readonly sessions: ApprovalSessionRepository,
  ) {}

  /**
   * Register an address during wallet/session onboarding.
   */
  async registerAddress(address: string): Promise<void> {
    this.decodePublicKey(address);

    await this.nonceRepository
      .createQueryBuilder()
      .insert()
      .into(ApprovalNonce)
      .values({ address, nonce: '0' })
      .orIgnore()
      .execute();
  }

  /**
   * Deterministic message format shared with the signing client.
   * The client must sign these exact UTF-8 bytes.
   */
  private buildMessage(
    contractId: string,
    sessionId: string,
    address: string,
    nonce: string,
  ): Buffer {
    return Buffer.from(
      [
        'SkillSyncOffchainApproval',
        'v1',
        contractId,
        sessionId,
        address,
        nonce,
      ].join('\n'),
      'utf8',
    );
  }

  private decodePublicKey(address: string): Buffer {
    try {
      return Buffer.from(
        StrKey.decodeEd25519PublicKey(address),
      );
    } catch {
      throw new BadRequestException(
        'Invalid Stellar Ed25519 public key',
      );
    }
  }

  /**
   * Verify a Base64-encoded 64-byte Ed25519 signature.
   */
  private verifySignature(
    address: string,
    message: Buffer,
    signatureBase64: string,
  ): boolean {
    try {
      const signature = Buffer.from(
        signatureBase64,
        'base64',
      );

      if (
        signature.length !== 64 ||
        signature.toString('base64') !== signatureBase64
      ) {
        return false;
      }

      const publicKeyBytes = this.decodePublicKey(address);

      const publicKey = createPublicKey({
        key: Buffer.concat([
          ED25519_SPKI_PREFIX,
          publicKeyBytes,
        ]),
        format: 'der',
        type: 'spki',
      });

      return cryptoVerify(
        null,
        message,
        publicKey,
        signature,
      );
    } catch {
      return false;
    }
  }

  /**
   * Acquire a PostgreSQL row lock for the signer's nonce.
   */
  private async getNonceForUpdate(
    address: string,
    manager: EntityManager,
  ): Promise<ApprovalNonce> {
    const nonce = await manager
      .getRepository(ApprovalNonce)
      .createQueryBuilder('approvalNonce')
      .setLock('pessimistic_write')
      .where('approvalNonce.address = :address', {
        address,
      })
      .getOne();

    if (!nonce) {
      throw new BadRequestException(
        `Address ${address} is not registered for approvals`,
      );
    }

    return nonce;
  }

  /**
   * Verify buyer and seller signatures and approve atomically.
   */
  async approve_with_signature(
    session_id: string,
    buyer_sig: string,
    seller_sig: string,
  ): Promise<{
    success: true;
    session_id: string;
  }> {
    if (!session_id || !buyer_sig || !seller_sig) {
      throw new BadRequestException(
        'Session ID and both signatures are required',
      );
    }

    const contractId = process.env.SOROBAN_CONTRACT_ID;

    if (!contractId) {
      throw new Error(
        'SOROBAN_CONTRACT_ID is not configured',
      );
    }

    const event = await this.dataSource.transaction(
      async (manager): Promise<ApprovalExecutedEvent> => {
        // This adapter must lock the session row using manager.
        const session = await this.sessions.findForApproval(
          session_id,
          manager,
        );

        if (!session) {
          throw new NotFoundException('Session not found');
        }

        if (
          session.buyerAddress === session.sellerAddress
        ) {
          throw new BadRequestException(
            'Buyer and seller must be different addresses',
          );
        }

        if (session.status === 'approved') {
          throw new ConflictException(
            'Session has already been approved',
          );
        }

        // Lock nonce records in a consistent order to reduce
        // deadlock risk when multiple approvals run concurrently.
        const addresses = [
          session.buyerAddress,
          session.sellerAddress,
        ].sort();

        const lockedNonces = new Map<
          string,
          ApprovalNonce
        >();

        for (const address of addresses) {
          lockedNonces.set(
            address,
            await this.getNonceForUpdate(
              address,
              manager,
            ),
          );
        }

        const buyerNonce = lockedNonces.get(
          session.buyerAddress,
        )!;

        const sellerNonce = lockedNonces.get(
          session.sellerAddress,
        )!;

        // Preserve the nonce values actually signed.
        const signedBuyerNonce = buyerNonce.nonce;
        const signedSellerNonce = sellerNonce.nonce;

        const buyerMessage = this.buildMessage(
          contractId,
          session_id,
          session.buyerAddress,
          signedBuyerNonce,
        );

        const sellerMessage = this.buildMessage(
          contractId,
          session_id,
          session.sellerAddress,
          signedSellerNonce,
        );

        if (
          !this.verifySignature(
            session.buyerAddress,
            buyerMessage,
            buyer_sig,
          )
        ) {
          throw new UnauthorizedException(
            'Invalid buyer signature',
          );
        }

        if (
          !this.verifySignature(
            session.sellerAddress,
            sellerMessage,
            seller_sig,
          )
        ) {
          throw new UnauthorizedException(
            'Invalid seller signature',
          );
        }

        // Consume both nonces only after both signatures pass.
        buyerNonce.nonce = (
          BigInt(signedBuyerNonce) + 1n
        ).toString();

        sellerNonce.nonce = (
          BigInt(signedSellerNonce) + 1n
        ).toString();

        await manager.save(ApprovalNonce, [
          buyerNonce,
          sellerNonce,
        ]);

        await this.sessions.markApproved(
          session,
          manager,
        );

        return {
          session_id,
          buyer_address: session.buyerAddress,
          seller_address: session.sellerAddress,
          buyer_nonce: signedBuyerNonce,
          seller_nonce: signedSellerNonce,
        };
      },
    );

    // Emit only after the transaction commits.
    this.eventEmitter.emit(
      OFFCHAIN_APPROVAL_EXECUTED,
      event,
    );

    return {
      success: true,
      session_id,
    };
  }
}

// ============================================================
// CONTROLLER
// ============================================================

@Controller('offchain-approvals')
export class OffchainApprovalController {
  constructor(
    private readonly approvalService: OffchainApprovalService,
  ) {}

  @Post('approve-with-signature')
  @HttpCode(HttpStatus.OK)
  approveWithSignature(
    @Body() dto: ApproveWithSignatureDto,
  ) {
    return this.approvalService.approve_with_signature(
      dto.session_id,
      dto.buyer_sig,
      dto.seller_sig,
    );
  }
}

// ============================================================
// EVENT LISTENER
// ============================================================

@Injectable()
export class OffchainApprovalListener {
  private readonly logger = new Logger(
    OffchainApprovalListener.name,
  );

  @OnEvent(OFFCHAIN_APPROVAL_EXECUTED)
  handleApproval(event: ApprovalExecutedEvent): void {
    this.logger.log(
      `OffchainApprovalExecuted: session=${event.session_id}`,
    );

    // Add notifications, analytics, or a transactional outbox
    // integration here if required.
  }
}

// ============================================================
// MODULE
// ============================================================

@Module({
  imports: [
    TypeOrmModule.forFeature([ApprovalNonce]),
    EventEmitterModule.forRoot(),
  ],
  controllers: [OffchainApprovalController],
  providers: [
    OffchainApprovalService,
    OffchainApprovalListener,

    // IMPORTANT:
    // Replace this with the actual provider exported by your
    // existing session module before using this module.
    {
      provide: APPROVAL_SESSION_REPOSITORY,
      useExisting: 'YOUR_SESSION_APPROVAL_ADAPTER',
    },
  ],
  exports: [OffchainApprovalService],
})
export class OffchainApprovalModule {}
