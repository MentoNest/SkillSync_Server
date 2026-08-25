import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { AuditLog } from './entities/audit-log.entity';
import { RolesGuard } from './guards/roles.guard';
import { RolesService } from './services/roles.service';
import { RolesController } from './controllers/roles.controller';
import { AuditLogsService } from './services/audit-logs.service';
import { AuditLogsController } from './controllers/audit-logs.controller';
import { RedisService } from './services/redis.service';
import { ThrottlerGuard } from './guards/throttler.guard';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'password',
      database: 'skillsync',
      entities: [User, Role, AuditLog],
      synchronize: true, // Disable in production, use migrations
    }),
    TypeOrmModule.forFeature([User, Role, AuditLog]),
    JwtModule.register({
      secret: 'your-secret-key-change-in-production', // Use environment variables in production
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AppController, RolesController, AuditLogsController],
  providers: [AppService, RolesService, RolesGuard, AuditLogsService, RedisService, ThrottlerGuard],
  exports: [RedisService, ThrottlerGuard],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly rolesService: RolesService) {}

  async onModuleInit() {
    // Initialize default roles when the app starts
    await this.rolesService.initializeDefaultRoles();
  }
}