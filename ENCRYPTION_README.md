# Field-Level Encryption Implementation Guide

## Overview

This implementation provides transparent field-level encryption for sensitive data stored in the database using **AES-256-GCM** encryption. The system automatically encrypts data before storage and decrypts it when loaded, with minimal performance overhead (< 10ms per operation).

## Encrypted Fields

### User Entity
- **email** - Encrypted with searchable hash index for exact match lookups
- **timezone** - Encrypted (PII - can reveal location)
- **locale** - Encrypted (PII - can reveal location/language preferences)

## Architecture

### Components

1. **EncryptionService** - Core encryption/decryption operations
2. **EncryptionSubscriber** - TypeORM subscriber for transparent encryption/decryption
3. **Encrypt Decorators** - Mark entity fields for encryption
4. **EncryptedQueryService** - Helper for searching encrypted fields
5. **Database Migration** - Encrypts existing data

### Encryption Algorithm

- **Algorithm**: AES-256-GCM (Authenticated Encryption)
- **Key Derivation**: scrypt (memory-hard function)
- **IV**: Random 16-byte initialization vector per encryption
- **Auth Tag**: 16-byte authentication tag for integrity verification
- **Format**: `iv:authTag:ciphertext` (base64 encoded)

### Searchable Encryption

For fields that need exact match lookups (like email), we use **deterministic HMAC-SHA256 hashing**:
- Same input always produces same hash
- Normalized (lowercase, trimmed) for consistent matching
- Indexed for fast database queries
- Cannot be reversed to original value

## Setup

### 1. Environment Variables

Add these to your `.env` file:

```env
# Master encryption key (minimum 32 characters)
ENCRYPTION_KEY=your-super-secret-encryption-key-change-in-production-min-32-chars

# Separate key for deterministic hashing (minimum 32 characters)
ENCRYPTION_HASH_KEY=your-super-secret-hash-key-change-in-production-min-32-chars

# Salt values for key derivation
ENCRYPTION_SALT=change-this-to-random-string-in-production
ENCRYPTION_HASH_SALT=change-this-to-another-random-string
```

**⚠️ IMPORTANT SECURITY NOTES:**
- Use strong, unique keys in production (minimum 32 characters)
- Never commit actual keys to version control
- In production, use a Key Management Service (KMS) like AWS KMS, Azure Key Vault, or HashiCorp Vault
- Rotate keys periodically (requires re-encryption of all data)
- Backup keys securely - lost keys = lost data

### 2. Run Migration

Encrypt existing data:

```bash
npm run typeorm migration:run
```

This migration:
- Adds `emailHash` column to users table
- Creates index on `emailHash` for fast lookups
- Encrypts existing email, timezone, and locale fields
- Generates email hashes for searchable lookups

### 3. Verify Setup

Run unit tests:

```bash
npm test encryption.service.spec.ts
```

## Usage

### Automatic Encryption/Decryption

Once configured, encryption is **completely transparent**:

```typescript
// Creating a user - email is automatically encrypted
const user = new User();
user.email = 'john@example.com';  // Will be encrypted before INSERT
user.timezone = 'America/New_York';  // Will be encrypted before INSERT
await userRepository.save(user);

// Loading a user - fields are automatically decrypted
const loadedUser = await userRepository.findOne({ where: { id: userId } });
console.log(loadedUser.email);  // 'john@example.com' (decrypted automatically)
```

### Searching by Encrypted Email

Use the `EncryptedQueryService` for email lookups:

```typescript
import { EncryptedQueryService } from './common/services/encrypted-query.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly encryptedQueryService: EncryptedQueryService,
  ) {}

  async findByEmail(email: string) {
    // Uses hash index for fast lookup
    const user = await this.encryptedQueryService.findUserByEmail(email);
    return user; // Email field is already decrypted
  }

  async isEmailTaken(email: string): Promise<boolean> {
    return await this.encryptedQueryService.existsByEmail(email);
  }
}
```

### Adding New Encrypted Fields

1. **Mark the field in the entity:**

```typescript
import { Encrypt, EncryptAndHash } from '../../../common/decorators/encrypt.decorator';

@Entity('my_entity')
export class MyEntity {
  // For fields that need to be searchable
  @EncryptAndHash()
  @Column()
  ssn: string;
  
  @Column()  // Add hash column
  ssnHash: string;

  // For fields that don't need searching
  @Encrypt()
  @Column()
  medicalRecord: string;
}
```

2. **Add index for hash fields:**

```typescript
@Entity('my_entity')
@Index(['ssnHash'])  // Add index for fast lookups
export class MyEntity { ... }
```

3. **Create migration:**

```bash
npm run typeorm migration:generate -- -n AddEncryptionToMyEntity
```

4. **Update EncryptedQueryService** if you need search functionality for the new field.

## Performance

### Benchmarks

All operations complete in **< 10ms**:

| Operation | Time (ms) |
|-----------|-----------|
| Encrypt | ~2-5ms |
| Decrypt | ~2-5ms |
| Hash | ~1-2ms |
| 100 Encrypt Ops | < 500ms |
| 100 Decrypt Ops | < 500ms |
| 100 Hash Ops | < 200ms |

### Overhead

- **Storage**: Encrypted values are ~30-40% larger than plaintext
- **CPU**: Minimal overhead from AES-GCM (hardware accelerated on modern CPUs)
- **Memory**: Keys derived once at startup, minimal memory footprint
- **Database Queries**: Hash-based lookups use indexes, same performance as plaintext lookups

## Security Features

### 1. Authenticated Encryption (AES-GCM)
- Provides both confidentiality and integrity
- Detects tampering - throws error if ciphertext is modified
- Uses random IV for each encryption (semantic security)

### 2. Key Separation
- Encryption key: Used for encrypting/decrypting data
- Hash key: Used for creating searchable hashes
- Prevents correlation attacks

### 3. Key Derivation (scrypt)
- Memory-hard function resistant to GPU/ASIC attacks
- Configurable work factor
- Salt prevents rainbow table attacks

### 4. Deterministic Hashing
- HMAC-SHA256 with secret key
- Normalized input (lowercase, trimmed)
- Cannot be reversed without the hash key

## Key Rotation

To rotate encryption keys:

1. **Generate new keys** and add to environment:
```env
ENCRYPTION_KEY=new-encryption-key
ENCRYPTION_HASH_KEY=new-hash-key
```

2. **Create rotation migration**:
```typescript
// 1. Load all entities
// 2. Decrypt with old key (if you keep it temporarily)
// 3. Re-encrypt with new key
// 4. Save back to database
```

3. **Test thoroughly** before deploying to production

4. **Backup old keys** securely until rotation is verified

## Production Deployment

### AWS Example

```typescript
// Use AWS KMS to manage encryption keys
import { KMS } from 'aws-sdk';

const kms = new KMS();

async function getEncryptionKey() {
  const { Plaintext } = await kms.decrypt({
    CiphertextBlob: Buffer.from(process.env.ENCRYPTED_KEY, 'base64'),
  }).promise();
  
  return Plaintext.toString('utf8');
}
```

### Docker Example

```dockerfile
# Pass keys as secrets or environment variables
docker run -e ENCRYPTION_KEY=${ENCRYPTION_KEY} \
           -e ENCRYPTION_HASH_KEY=${ENCRYPTION_HASH_KEY} \
           my-app
```

### Kubernetes Example

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: encryption-keys
type: Opaque
data:
  encryption-key: <base64-encoded-key>
  encryption-hash-key: <base64-encoded-key>
```

## Troubleshooting

### "ENCRYPTION_KEY environment variable is required"

**Problem**: Missing encryption key in environment variables.

**Solution**: Add `ENCRYPTION_KEY` to your `.env` file.

### "Failed to decrypt value"

**Problem**: Data was encrypted with a different key or corrupted.

**Solution**: 
- Verify encryption keys haven't changed
- Check database for corrupted records
- Run migration to re-encrypt if keys were rotated

### Email lookup returns null

**Problem**: Email hash doesn't match.

**Solution**:
- Verify the email is being normalized the same way (lowercase, trimmed)
- Check if `emailHash` column exists and is indexed
- Ensure migration has run successfully

### Performance issues

**Problem**: Encryption/decryption taking too long.

**Solution**:
- Check server CPU (AES-NI instructions should be available)
- Verify key derivation isn't happening on every operation (should be once at startup)
- Profile database queries for hash lookups

## Testing

Run the encryption test suite:

```bash
npm test encryption.service.spec.ts
```

Tests cover:
- ✅ Encryption/decryption round-trips
- ✅ Performance benchmarks (< 10ms)
- ✅ Error handling (tampering, invalid formats)
- ✅ Edge cases (null, empty, unicode, emojis)
- ✅ Deterministic hashing
- ✅ Field-level encryption helpers

## Migration Guide

### From Unencrypted to Encrypted

1. **Backup your database** (CRITICAL!)
2. **Add environment variables** to `.env`
3. **Run migration**: `npm run typeorm migration:run`
4. **Verify data**: Check that sensitive fields are encrypted in database
5. **Test application**: Ensure all features work correctly
6. **Monitor logs**: Watch for decryption errors

### Rollback Plan

If you need to rollback:

1. **Restore from backup** (created in step 1)
2. **Remove encryption decorators** from entities
3. **Remove migration** or create rollback migration
4. **Remove environment variables**

**Note**: The migration's `down()` method only removes the `emailHash` column. It cannot decrypt data automatically.

## Best Practices

1. ✅ **Always backup** before running encryption migrations
2. ✅ **Use KMS** in production for key management
3. ✅ **Rotate keys** periodically (every 6-12 months)
4. ✅ **Monitor performance** - alert if operations exceed 10ms
5. ✅ **Test thoroughly** in staging before production deployment
6. ✅ **Never log** encrypted or decrypted sensitive data
7. ✅ **Use HTTPS** for all API endpoints (encryption at rest + in transit)
8. ✅ **Audit access** to encryption keys
9. ✅ **Document** which fields are encrypted and why
10. ✅ **Plan for key rotation** from the start

## Support

For issues or questions:
- Check the troubleshooting section above
- Review unit tests for usage examples
- Consult the NestJS and TypeORM documentation
- Contact the development team

## References

- [AES-GCM Specification](https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-38d.pdf)
- [scrypt Key Derivation](https://tools.ietf.org/html/rfc7914)
- [HMAC-SHA256](https://tools.ietf.org/html/rfc2104)
- [TypeORM Subscribers](https://typeorm.io/listeners-and-subscribers#what-is-a-subscriber)
- [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers)
