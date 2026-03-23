import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Skill } from './entities/skill.entity';
import { Tag } from '../tag/entities/tag.entity';
import { SkillService } from './skill.service';
import { SkillController } from './skill.controller';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Skill, Tag]),
    SkillsModule,
  ],
  providers: [SkillService],
  controllers: [SkillController],
  exports: [SkillService],
})
export class SkillModule {}
