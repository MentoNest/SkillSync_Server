import { PartialType } from '@nestjs/mapped-types';
import { CreatePaginationDto } from './create-pagination.dto';

export class UpdatePaginationDto extends PartialType(CreatePaginationDto) {}
