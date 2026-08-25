import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { MentorProfile } from './entities/mentor-profile.entity';
import { MenteeProfile } from './entities/mentee-profile.entity';
import { AuditLog } from './entities/audit-log.entity';
import { RolesGuard } from './guards/roles.guard';
import { RolesService } from './services/roles.service';
import { UserService } from './services/user.service';
import { AuditLogService } from './services/audit-log.service';
import { RolesController } from './controllers/roles.controller';
import { UserController } from './controllers/user.controller';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'password',
      database: 'skillsync',
      entities: [User, Role, MentorProfile, MenteeProfile, AuditLog],
      synchronize: true, // Disable in production, use migrations
    }),
    TypeOrmModule.forFeature([User, Role, MentorProfile, MenteeProfile, AuditLog]),
    JwtModule.register({
      secret: 'your-secret-key-change-in-production', // Use environment variables in production
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AppController, RolesController, UserController],
  providers: [AppService, RolesService, UserService, AuditLogService, RolesGuard],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly rolesService: RolesService) {}

  async onModuleInit() {
    // Initialize default roles when the app starts
    await this.rolesService.initializeDefaultRoles();
  }
}