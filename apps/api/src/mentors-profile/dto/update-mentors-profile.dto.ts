import { PartialType } from '@nestjs/swagger';
import { CreateMentorProfileDto } from './create-mentors-profile.dto';

export class UpdateMentorProfileDto extends PartialType(
  CreateMentorProfileDto,
) {}
