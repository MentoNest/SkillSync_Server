import { PartialType } from '@nestjs/mapped-types';
import { CreateMentorProfileDto } from './create-mentor-profile.dto.js';

export class UpdateMentorProfileDto extends PartialType(
  CreateMentorProfileDto,
) {}
