import { PartialType } from '@nestjs/mapped-types';
import { CreateMenteeProfileDto } from './create-mentee-profile.dto';

export class UpdateMenteeProfileDto extends PartialType(CreateMenteeProfileDto) {}
