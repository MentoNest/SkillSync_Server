import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateServiceListingDto } from './create-service-listing.dto';

export class BulkCreateServiceListingDto {
  @ApiProperty({
    description: 'Array of service listings to create',
    type: [CreateServiceListingDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateServiceListingDto)
  listings: CreateServiceListingDto[];
}
