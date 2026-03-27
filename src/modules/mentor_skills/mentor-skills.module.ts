import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MentorSkillsService } from './mentor-skills.service';
import { MentorSkillsController } from './mentor-skills.controller';
import { MentorSkill } from './entities/mentor-skill.entity';
import { Skill } from '../skill/entities/skill.entity';
import { MentorProfile } from '../profile/entities/mentor-profile.entity';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MentorSkill, Skill, MentorProfile]),
    SkillsModule,
  ],
  controllers: [MentorSkillsController],
  providers: [MentorSkillsService],
  exports: [MentorSkillsService],
})
export class MentorSkillsModule {}
