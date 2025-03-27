import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    HttpCode,
    HttpStatus,
  } from '@nestjs/common';
  import { SessionsService } from './sessions.service';
  import { CreateSessionDto } from './dto/create-session.dto';
  import { UpdateSessionDto } from './dto/update-session.dto';
  import { Session } from './entities/sessions.entity';
  import { SessionStatus } from './enums/session-status.enum';
  
  @Controller('sessions')
  export class SessionsController {
    constructor(private readonly sessionsService: SessionsService) {}
  
    // Create a session
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() createSessionDto: CreateSessionDto): Promise<Session> {
      return this.sessionsService.create(createSessionDto);
    }
  
    // Get all sessions (excluding soft-deleted)
    @Get()
    async findAll(): Promise<Session[]> {
      return this.sessionsService.findAll();
    }
  
    // Get a single session by ID
    @Get(':id')
    async findOne(@Param('id') id: string): Promise<Session> {
      return this.sessionsService.findOne(id);
    }
  
    // Update session details
    @Patch(':id')
    async update(
      @Param('id') id: string,
      @Body() updateSessionDto: UpdateSessionDto,
    ): Promise<Session> {
      return this.sessionsService.update(id, updateSessionDto);
    }
  
    // Update session status
    @Patch(':id/status')
    async updateStatus(
      @Param('id') id: string,
      @Query('status') status: SessionStatus,
    ): Promise<Session> {
      return this.sessionsService.updateStatus(id, status);
    }
  
    // Soft delete a session
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async softDelete(@Param('id') id: string): Promise<void> {
      return this.sessionsService.softDelete(id);
    }
  
    // Restore a soft-deleted session
    @Patch(':id/restore')
    async restore(@Param('id') id: string): Promise<Session> {
      return this.sessionsService.restore(id);
    }
  }
  