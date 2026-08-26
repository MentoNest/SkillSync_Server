import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './user/entities/user.entity';
import { Role } from './entities/role.entity';
import { RefreshToken } from './auth/entities/refresh-token.entity';
import { AuditLog } from './auth/entities/audit-log.entity';
import { RolesGuard } from './guards/roles.guard';
import { RolesService } from './services/roles.service';
import { UserService } from './services/user.service';
import { AuditLogService } from './services/audit-log.service';
import { RolesController } from './controllers/roles.controller';
import { UserController } from './controllers/user.controller';
import { RedisService } from './services/redis.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'skillsync',
      entities: [User, Role, RefreshToken, AuditLog],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([User, Role, RefreshToken, AuditLog]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '1d' },
    }),
    UserModule,
    AuthModule,
    HealthModule,
  ],
  controllers: [AppController, RolesController, UserController],
  providers: [AppService, RolesService, RolesGuard, AuditLogService, RedisService],
  exports: [RedisService],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly rolesService: RolesService) {}

  async onModuleInit() {
    await this.rolesService.initializeDefaultRoles();
  }
}
