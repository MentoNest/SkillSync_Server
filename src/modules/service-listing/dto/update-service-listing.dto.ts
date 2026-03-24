import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceListingDto } from './create-service-listing.dto';

export class UpdateServiceListingDto extends PartialType(CreateServiceListingDto) {}
