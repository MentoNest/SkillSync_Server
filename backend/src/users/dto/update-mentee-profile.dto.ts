import { PartialType } from '@nestjs/mapped-types';
import { CreateMenteeProfileDto } from './create-mentee-profile.dto.js';

export class UpdateMenteeProfileDto extends PartialType(
  CreateMenteeProfileDto,
) {}
