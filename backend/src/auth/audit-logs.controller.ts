import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from './decorators/roles.decorator';
import { AuthRole } from './enums/auth-role.enum';
import { RolesGuard } from './guards/roles.guard';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
export class AuditLogsController {
  @Get()
  findAll() {
    return [];
  }
}
