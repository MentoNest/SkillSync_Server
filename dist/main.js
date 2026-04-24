"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const helmet_1 = require("helmet");
const compression = require("compression");
const global_exception_filter_1 = require("./common/filters/global-exception.filter");
const request_logger_middleware_1 = require("./common/middleware/request-logger.middleware");
const typeorm_1 = require("typeorm");
const admin_seed_service_1 = require("./database/seeds/admin-seed.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log', 'debug'],
    });
    const configService = app.get(config_1.ConfigService);
    app.use((0, helmet_1.default)());
    app.use(compression());
    app.use(new request_logger_middleware_1.RequestLoggerMiddleware().use);
    app.enableCors({
        origin: configService.get('CORS_ORIGIN') || '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
    });
    app.useGlobalFilters(new global_exception_filter_1.GlobalExceptionFilter());
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
        exceptionFactory: (errors) => {
            const messages = errors.map((error) => {
                const constraints = error.constraints
                    ? Object.values(error.constraints)
                    : [];
                return `${error.property} ${constraints.join(', ')}`;
            });
            return new Error(messages.join(', '));
        },
    }));
    app.setGlobalPrefix(configService.get('API_PREFIX') || 'api');
    if (configService.get('NODE_ENV') !== 'production') {
        const config = new swagger_1.DocumentBuilder()
            .setTitle('SkillSync API')
            .setDescription('Enterprise-level API for SkillSync platform')
            .setVersion('1.0')
            .addTag('Authentication')
            .addTag('Wallet')
            .addTag('Session Management')
            .addTag('Users')
            .addBearerAuth()
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        swagger_1.SwaggerModule.setup('api/docs', app, document);
    }
    try {
        const dataSource = app.get(typeorm_1.DataSource);
        if (dataSource.isInitialized) {
            console.log('Database connection verified successfully');
        }
    }
    catch (error) {
        console.error('Failed to verify database connection:', error.message);
        process.exit(1);
    }
    try {
        const adminSeedService = app.get(admin_seed_service_1.AdminSeedService);
        const seedResult = await adminSeedService.seed();
        console.log(`[Seed] ${seedResult.message}`);
    }
    catch (error) {
        const logger = new common_1.Logger('Seed');
        logger.error(`Failed to run admin seed: ${error.message}`, error.stack);
    }
    const port = configService.get('PORT') || 3000;
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
    console.log(`API documentation available at: http://localhost:${port}/api/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map