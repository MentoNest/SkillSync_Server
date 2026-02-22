import { PartialType } from '@nestjs/mapped-types';
import { AuditQueryDto } from './create-audit.dto';

// Update DTO for audit logs (typically not used as audit logs are immutable)
export class UpdateAuditDto extends PartialType(AuditQueryDto) {}
