import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { RolesService } from '../services/roles.service';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from '../guards/roles.guard';
import type { Request } from 'express';

interface CreateRoleDto {
  name: string;
  description: string;
}

interface AssignRoleDto {
  roleName: string;
}

@Controller('roles')
@UseGuards(RolesGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Roles('admin')
  async getAllRoles() {
    return this.rolesService.getAllRoles();
  }

  @Post()
  @Roles('admin')
  async createRole(@Body() createRoleDto: CreateRoleDto, @Req() req: Request) {
    return this.rolesService.createRole(createRoleDto.name, createRoleDto.description, (req as any).user);
  }

  @Post(':userId/assign')
  @Roles('admin')
  async assignRole(
    @Param('userId') userId: string,
    @Body() assignRoleDto: AssignRoleDto,
    @Req() req: Request,
  ) {
    return this.rolesService.assignRoleToUser(userId, assignRoleDto.roleName, (req as any).user);
  }

  @Post(':userId/revoke')
  @Roles('admin')
  async revokeRole(
    @Param('userId') userId: string,
    @Body() assignRoleDto: AssignRoleDto,
    @Req() req: Request,
  ) {
    return this.rolesService.revokeRoleFromUser(userId, assignRoleDto.roleName, (req as any).user);
  }
}