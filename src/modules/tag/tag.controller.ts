import { Controller, Post, Body, Param } from '@nestjs/common';
import { TagService } from './tag.service';
import { AssignTagsDto, CreateTagDto } from './dto/tag.dto';

@Controller('tags')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post('create')
  create(@Body() dto: CreateTagDto) {
    return this.tagService.createTag(dto.name, dto.slug);
  }

  @Post('assign/:skillId')
  assignTags(
    @Param('skillId') skillId: number,
    @Body() dto: AssignTagsDto,
  ) {
    return this.tagService.assignTagsToSkill(skillId, dto.tagSlugs);
  }
}
