import { Controller, Get, Post, Patch, Param, Delete } from '@nestjs/common';
import { ProfileService } from './providers/profile.service';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post()
  create() {
    return this.profileService.create();
  }

  @Get()
  findAll() {
    return this.profileService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.profileService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string) {
    return this.profileService.update(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.profileService.remove(+id);
  }
}
