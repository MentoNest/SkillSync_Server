"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppConfigService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const zod_1 = require("zod");
let AppConfigService = class AppConfigService {
    constructor(configService) {
        this.configService = configService;
        this.envSchema = zod_1.z.object({
            NODE_ENV: zod_1.z.enum(['development', 'staging', 'production']).default('development'),
            PORT: zod_1.z.string().transform(Number).default(() => 3000),
            API_PREFIX: zod_1.z.string().default('api'),
            CORS_ORIGIN: zod_1.z.string().default('*'),
            DATABASE_HOST: zod_1.z.string().default('localhost'),
            DATABASE_PORT: zod_1.z.string().transform(Number).default(() => 5432),
            DATABASE_USERNAME: zod_1.z.string().default('postgres'),
            DATABASE_PASSWORD: zod_1.z.string().default('password'),
            DATABASE_NAME: zod_1.z.string().default('skillsync'),
            JWT_SECRET: zod_1.z.string().min(32).default('your-super-secret-jwt-key-change-in-production'),
            JWT_EXPIRES_IN: zod_1.z.string().default('24h'),
            JWT_REFRESH_SECRET: zod_1.z.string().min(32).default('your-super-secret-refresh-key'),
            JWT_REFRESH_EXPIRES_IN: zod_1.z.string().default('7d'),
            REDIS_HOST: zod_1.z.string().default('localhost'),
            REDIS_PORT: zod_1.z.string().transform(Number).default(() => 6379),
            REDIS_PASSWORD: zod_1.z.string().optional(),
            REDIS_DB: zod_1.z.string().transform(Number).default(() => 0),
            REDIS_KEY_PREFIX: zod_1.z.string().default('skillsync'),
            REDIS_CONNECT_TIMEOUT: zod_1.z.string().transform(Number).default(() => 10000),
            FEATURE_ENABLE_SWAGGER: zod_1.z.string().transform(Boolean).default(() => true),
            FEATURE_ENABLE_CACHE: zod_1.z.string().transform(Boolean).default(() => true),
            FEATURE_ENABLE_RATE_LIMITING: zod_1.z.string().transform(Boolean).default(() => true),
            FEATURE_ENABLE_LOGGING: zod_1.z.string().transform(Boolean).default(() => true),
            LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
            LOG_FORMAT: zod_1.z.enum(['json', 'simple']).default('simple'),
        });
        this.validateEnvironment();
    }
    validateEnvironment() {
        try {
            this.envSchema.parse(this.configService);
        }
        catch (error) {
            console.error('Environment validation failed:', error);
            process.exit(1);
        }
    }
    get(key) {
        return this.configService.get(key);
    }
    isDevelopment() {
        return this.get('NODE_ENV') === 'development';
    }
    isStaging() {
        return this.get('NODE_ENV') === 'staging';
    }
    isProduction() {
        return this.get('NODE_ENV') === 'production';
    }
    getDatabaseConfig() {
        return {
            host: this.get('DATABASE_HOST'),
            port: this.get('DATABASE_PORT'),
            username: this.get('DATABASE_USERNAME'),
            password: this.get('DATABASE_PASSWORD'),
            database: this.get('DATABASE_NAME'),
        };
    }
    getJwtConfig() {
        return {
            secret: this.get('JWT_SECRET'),
            expiresIn: this.get('JWT_EXPIRES_IN'),
            refreshSecret: this.get('JWT_REFRESH_SECRET'),
            refreshExpiresIn: this.get('JWT_REFRESH_EXPIRES_IN'),
        };
    }
    getRedisConfig() {
        return {
            host: this.get('REDIS_HOST'),
            port: this.get('REDIS_PORT'),
            password: this.get('REDIS_PASSWORD'),
            db: this.get('REDIS_DB'),
            keyPrefix: this.get('REDIS_KEY_PREFIX'),
            connectTimeout: this.get('REDIS_CONNECT_TIMEOUT'),
        };
    }
    isFeatureEnabled(feature) {
        const featureKey = `FEATURE_ENABLE_${feature.toUpperCase()}`;
        return this.get(featureKey) || false;
    }
};
exports.AppConfigService = AppConfigService;
exports.AppConfigService = AppConfigService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AppConfigService);
//# sourceMappingURL=app-config.service.js.map