import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Skill } from '../users/entities/skill.entity';
import { MentorSkill } from '../users/entities/mentor-skill.entity';
import { MentorProfile } from '../users/entities/mentor-profile.entity';
import { SkillService } from '../services/skill.service';
import { MentorSkillService } from '../services/mentor-skill.service';
import { SkillController } from '../controllers/skill.controller';
import {
  MentorSkillController,
  MentorController,
} from '../controllers/mentor-skill.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Skill, MentorSkill, MentorProfile])],
  controllers: [SkillController, MentorSkillController, MentorController],
  providers: [SkillService, MentorSkillService],
  exports: [SkillService, MentorSkillService],
})
export class SkillModule {}
