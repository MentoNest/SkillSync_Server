
import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profile.service';
@ApiTags('Profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  getMe(@Req() req:any) {
    return this.profilesService.getMe(req.user.id);
  }

  @Put('me')
  updateMe(
    @Req() req: any,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profilesService.updateMe(req.user.id, dto);
  }
}
