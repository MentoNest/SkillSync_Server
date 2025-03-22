import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
} from '@nestjs/common';
import { MentorService } from './providers/mentor.service';
import { CreateMentorDto } from './dto/createMentor.dto';
import { UpdateMentorDto } from './dto/update-Mentor.dto';
import { CacheInterceptor } from 'src/common/interceptor/cache.interceptor';

@Controller('mentors')
@UseInterceptors(CacheInterceptor)
export class MentorController {
  constructor(private readonly mentorService: MentorService) {}

  @Post()
  create(@Body() createMentorDto: CreateMentorDto) {
    return this.mentorService.create(createMentorDto);
  }

  @Get()
  findAll() {
    return this.mentorService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.mentorService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMentorDto: UpdateMentorDto) {
    return this.mentorService.update(+id, updateMentorDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.mentorService.remove(+id);
  }
}
