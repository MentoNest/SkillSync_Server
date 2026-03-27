import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SkillCategory } from './entities/skill-category.entity';
import { Skill } from './entities/skill.entity';
import { SkillPopularityDaily } from './entities/skill-popularity-daily.entity';
import { SkillCategoryService } from './providers/skill-category.service';
import { SkillService } from './providers/skill.service';
import { SkillPopularityService } from './providers/skill-popularity.service';
import { SkillCategoryController } from './skill-category.controller';
import { SkillController } from './skill.controller';
import { SkillPopularityController } from './skill-popularity.controller';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([SkillCategory, Skill, SkillPopularityDaily]),
    AuthModule,
  ],
  controllers: [SkillCategoryController, SkillController, SkillPopularityController],
  providers: [SkillCategoryService, SkillService, SkillPopularityService, RolesGuard],
  exports: [SkillCategoryService, SkillService, SkillPopularityService],
})
export class SkillsModule {}
