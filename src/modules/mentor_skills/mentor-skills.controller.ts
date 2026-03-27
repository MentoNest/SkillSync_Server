import { Controller, Post, Body, Delete, Param } from '@nestjs/common';
import { MentorSkillsService } from './mentor-skills.service';
import { AttachSkillsDto, DetachSkillsDto } from './dto/mentor-skills.dto';

@Controller('mentor-skills')
export class MentorSkillsController {
  constructor(private readonly mentorSkillsService: MentorSkillsService) {}

  @Post('attach')
  attachSkills(@Body() dto: AttachSkillsDto) {
    return this.mentorSkillsService.attachSkills(dto.mentorId, dto.skillIds);
  }

  @Delete('detach')
  detachSkills(@Body() dto: DetachSkillsDto) {
    return this.mentorSkillsService.detachSkills(dto.mentorId, dto.skillIds);
  }
}
