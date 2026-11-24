import { ApiProperty } from '@nestjs/swagger';
import { ChangeReason, ProfileHistory } from '../profile-history.entity';

export class ProfileHistoryEntryDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37' })
  userId!: string;

  @ApiProperty({ example: 'user' })
  profileType!: string;

  @ApiProperty({ example: 'username' })
  fieldName!: string;

  @ApiProperty({
    description: 'Value before the change. Null for initial writes. Sensitive values are redacted.',
    nullable: true,
    example: null,
    oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'object' }, { type: 'array' }],
  })
  oldValue!: unknown;

  @ApiProperty({
    description: 'Value after the change. Null when the field was cleared.',
    nullable: true,
    example: 'alice_dev',
    oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'object' }, { type: 'array' }],
  })
  newValue!: unknown;

  @ApiProperty({ example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37' })
  changedBy!: string;

  @ApiProperty({ enum: ChangeReason, example: ChangeReason.USER_EDIT })
  changeReason!: ChangeReason;

  @ApiProperty({ description: 'UTC timestamp with millisecond precision.', example: '2024-06-01T12:00:00.123Z' })
  changedAt!: string;

  @ApiProperty({ description: 'Minimum retention date (changedAt + 1 year).', example: '2025-06-01T12:00:00.123Z' })
  retainUntil!: string;

  static fromEntity(e: ProfileHistory): ProfileHistoryEntryDto {
    return {
      id: e.id,
      userId: e.userId,
      profileType: e.profileType,
      fieldName: e.fieldName,
      oldValue: e.oldValue,
      newValue: e.newValue,
      changedBy: e.changedBy,
      changeReason: e.changeReason,
      changedAt: e.changedAt.toISOString(),
      retainUntil: e.retainUntil.toISOString(),
    };
  }
}

export class ProfileHistoryPageDto {
  @ApiProperty({ type: [ProfileHistoryEntryDto] })
  entries!: ProfileHistoryEntryDto[];

  @ApiProperty({ description: 'Total number of history entries for this user.', example: 7 })
  total!: number;

  @ApiProperty({ description: 'Offset used for this page.', example: 0 })
  offset!: number;

  @ApiProperty({ description: 'Limit used for this page.', example: 50 })
  limit!: number;
}
