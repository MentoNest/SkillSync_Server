import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesService } from '../services/roles.service.js';
import { Roles } from '../decorators/roles.decorator.js';
import { RolesGuard } from '../guards/roles.guard.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { CurrentUser } from '../user/decorators/current-user.decorator';
import { User } from '../entities/user.entity.js';
import { AssignRoleDto, CreateRoleDto, SetRolesDto, UpdateRoleDto } from '../rbac/dto/role.dto';

/**
 * #1318: role administration API.
 *
 * Reads require an authenticated caller; every mutation is restricted to the
 * `admin` role. Each mutation bumps the target user's token version, so tokens
 * issued before the change stop working immediately.
 */
@ApiTags('Roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('Bearer Auth')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all roles with their permissions',
    description: 'Returns the role catalogue, including dynamically created roles.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Role catalogue' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required' })
  async getAllRoles() {
    const roles = await this.rolesService.getAllRoles();
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
    }));
  }

  @Get('users/:userId')
  @Roles('admin')
  @ApiOperation({
    summary: 'Inspect the roles and effective permissions of a user',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Roles and resolved permissions' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin role required' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  async getUserRoles(@Param('userId') userId: string) {
    const [roles, permissions] = await Promise.all([
      this.rolesService.getUserRoles(userId),
      this.rolesService.getUserPermissions(userId),
    ]);
    return { userId, roles, permissions };
  }

  @Post()
  @Roles('admin')
  @ApiOperation({
    summary: 'Create a new role',
    description: 'Additional roles can be added dynamically on top of admin/mentor/mentee.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Role created' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or duplicate role name' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin role required' })
  async createRole(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.createRole(
      createRoleDto.name,
      createRoleDto.description,
      createRoleDto.permissions,
    );
  }

  @Put(':name')
  @Roles('admin')
  @ApiOperation({ summary: 'Update the description or permissions of a role' })
  @ApiParam({ name: 'name', description: 'Role name' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Role updated' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin role required' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Role not found' })
  async updateRole(@Param('name') name: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.updateRole(name, updateRoleDto);
  }

  @Post(':userId/assign')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Grant a role to a user',
    description:
      'Increments the user token version, invalidating every access token issued before the grant.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Role granted' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin role required' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User or role not found' })
  async assignRole(
    @Param('userId') userId: string,
    @Body() assignRoleDto: AssignRoleDto,
    @CurrentUser() admin: User,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.rolesService.assignRoleToUser(userId, assignRoleDto.roleName, {
      userId: admin?.id,
      ipAddress: ip,
      userAgent,
    });
  }

  @Post(':userId/revoke')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke a role from a user',
    description:
      'Increments the user token version so the revoked role cannot be used with a still valid token. The last remaining admin cannot be demoted.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Role revoked' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Role not held / last admin' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin role required' })
  async revokeRole(
    @Param('userId') userId: string,
    @Body() assignRoleDto: AssignRoleDto,
    @CurrentUser() admin: User,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.rolesService.revokeRoleFromUser(userId, assignRoleDto.roleName, {
      userId: admin?.id,
      ipAddress: ip,
      userAgent,
    });
  }

  @Put(':userId/roles')
  @Roles('admin')
  @ApiOperation({
    summary: 'Replace the full role set of a user',
    description: 'Applies the whole set atomically and audits every added/removed role.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Role set replaced' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin role required' })
  async setRoles(
    @Param('userId') userId: string,
    @Body() setRolesDto: SetRolesDto,
    @CurrentUser() admin: User,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.rolesService.setRolesForUser(userId, setRolesDto.roles, {
      userId: admin?.id,
      ipAddress: ip,
      userAgent,
    });
  }
}
