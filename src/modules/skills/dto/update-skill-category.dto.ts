import { PartialType } from '@nestjs/swagger';
import { CreateSkillCategoryDto } from './create-skill-category.dto';

export class UpdateSkillCategoryDto extends PartialType(CreateSkillCategoryDto) {}
