import { Controller, Get, Post, Patch, Delete, Body, Param, Query, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionsService } from './providers/sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

@ApiTags('Sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  async createSession(@Body() createSessionDto: CreateSessionDto) {
    return await this.sessionsService.createSession(createSessionDto);
  }

  @Get()
  async getAllSessions(@Query('includeDeleted') includeDeleted: boolean) {
    return await this.sessionsService.getAllSessions(includeDeleted);
  }

  @Get(':id')
  async getSessionById(@Param('id') id: string) {
    const session = await this.sessionsService.getSessionById(+id);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  @Patch(':id')
  async updateSession(@Param('id') id: string, @Body() updateSessionDto: UpdateSessionDto) {
    return await this.sessionsService.updateSession(+id, updateSessionDto);
  }

  @Delete(':id')
  async softDeleteSession(@Param('id') id: string) {
    return await this.sessionsService.softDeleteSession(+id);
  }
}
