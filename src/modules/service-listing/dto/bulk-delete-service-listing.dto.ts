import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class BulkDeleteServiceListingDto {
  @ApiProperty({
    description: 'Array of service listing IDs to delete',
    type: [String],
    minItems: 1,
    example: ['uuid-1', 'uuid-2'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  ids: string[];
}
