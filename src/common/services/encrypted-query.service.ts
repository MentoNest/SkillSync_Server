import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/auth/entities/user.entity';
import { EncryptionService } from '../../common/services/encryption.service';

/**
 * Service for handling encrypted field queries
 * Provides methods to search for entities using encrypted field hashes
 */
@Injectable()
export class EncryptedQueryService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Find a user by email using the encrypted hash index
   * This allows exact match lookups on encrypted email fields
   * @param email The plaintext email to search for
   * @returns User entity with decrypted fields (auto-decrypted by subscriber)
   */
  async findUserByEmail(email: string): Promise<User | null> {
    const emailHash = this.encryptionService.createSearchHash(email);
    
    if (!emailHash) {
      return null;
    }

    return await this.userRepository.findOne({
      where: { emailHash },
      relations: ['roles'],
    });
  }

  /**
   * Check if a user with the given email already exists
   * @param email The plaintext email to check
   * @returns true if user exists, false otherwise
   */
  async existsByEmail(email: string): Promise<boolean> {
    const emailHash = this.encryptionService.createSearchHash(email);
    
    if (!emailHash) {
      return false;
    }

    const count = await this.userRepository.count({
      where: { emailHash },
    });

    return count > 0;
  }

  /**
   * Find users by multiple emails using hash index
   * @param emails Array of plaintext emails to search for
   * @returns Array of User entities
   */
  async findUsersByEmails(emails: string[]): Promise<User[]> {
    const emailHashes = emails
      .map(email => this.encryptionService.createSearchHash(email))
      .filter(hash => hash !== null);

    if (emailHashes.length === 0) {
      return [];
    }

    return await this.userRepository.find({
      where: emailHashes.map(hash => ({ emailHash: hash })),
      relations: ['roles'],
    });
  }
}
