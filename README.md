# SkillSync Server

NestJS backend API for SkillSync - A mentorship matching platform built with enterprise architecture.

[![CI/CD Pipeline](https://github.com/MentoNest/SkillSync_Server/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/MentoNest/SkillSync_Server/actions/workflows/ci-cd.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/nestjs-%5E11.0.0-e10079)](https://nestjs.com/)

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
- [Docker Setup](#-docker-setup)
- [Testing](#-testing)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [Environment Variables](#-environment-variables)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

- 🔐 **Wallet-based Authentication** - Stellar wallet signature verification
- 🎭 **Role-Based Access Control (RBAC)** - Admin, Mentor, Mentee, Moderator roles
- 💬 **Real-time Chat** - WebSocket-based messaging system
- 📅 **Availability Management** - Schedule and manage mentoring sessions
- 🔔 **Notifications** - Real-time notifications via WebSocket and email
- 💾 **Database Backups** - Automated backup system with encryption
- 🚀 **Rate Limiting** - Multi-tier rate limiting (IP, wallet, user)
- 📊 **Audit Logging** - Comprehensive audit trail for security events
- 🏥 **Health Checks** - Database, Redis, and disk health monitoring
- 🔄 **Token Rotation** - Secure refresh token rotation mechanism

## 🛠 Tech Stack

- **Framework**: [NestJS 11](https://nestjs.com/)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/)
- **Database**: [PostgreSQL 16](https://www.postgresql.org/)
- **ORM**: [TypeORM](https://typeorm.io/)
- **Cache**: [Redis 7](https://redis.io/)
- **Authentication**: JWT + Stellar SDK
- **Validation**: [class-validator](https://github.com/typestack/class-validator)
- **Testing**: [Jest](https://jestjs.io/)
- **Containerization**: Docker & Docker Compose
- **CI/CD**: GitHub Actions

## 📦 Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- PostgreSQL 16+
- Redis 7+

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/MentoNest/SkillSync_Server.git
cd SkillSync_Server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your-secure-password
DB_NAME=skillsync_db

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

JWT_SECRET=your-super-secret-jwt-key-must-be-at-least-32-characters
JWT_REFRESH_SECRET=your-refresh-secret-key-must-be-at-least-32-characters
```

### 4. Run Database Migrations

```bash
npm run migration:run
```

### 5. Seed Admin User (Optional)

```bash
npm run seed:admin
```

### 6. Start Development Server

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`

## 🐳 Docker Setup

### Quick Start with Docker Compose

**Development Mode (with hot-reload):**

```bash
docker-compose -f docker-compose.dev.yml up -d
```

**Production Mode:**

```bash
docker-compose up --build -d
```

**View Logs:**

```bash
docker-compose logs -f backend
```

**Stop Services:**

```bash
docker-compose down
```

📖 **Full Docker documentation**: [DOCKER.md](./DOCKER.md)

## 🧪 Testing

### Run Unit Tests

```bash
npm run test
```

### Run Tests with Coverage

```bash
npm run test:cov
```

### Run E2E Tests

```bash
npm run test:e2e
```

### Watch Mode

```bash
npm run test:watch
```

### Test Coverage Requirements

- Minimum **80% code coverage** across all services
- All services must have corresponding `.spec.ts` files
- No skipped or pending tests in CI

## 📚 API Documentation

### Swagger UI (Development Only)

Enable Swagger in `.env`:

```env
SWAGGER_ENABLED=true
FEATURE_ENABLE_SWAGGER=true
```

Access at: `http://localhost:3000/api/docs`

### API Prefix

All API routes are prefixed with `/api`:

```
GET    /api/health
POST   /api/auth/nonce
POST   /api/auth/login
POST   /api/auth/refresh
```

## 📁 Project Structure

```
src/
├── admin/                 # Admin panel controllers and services
├── chat/                  # Chat and messaging module
├── common/                # Shared utilities, guards, interceptors
│   ├── decorators/        # Custom decorators
│   ├── dto/               # Shared DTOs
│   ├── exceptions/        # Custom exception classes
│   ├── filters/           # Exception filters
│   ├── interceptors/      # Request/response interceptors
│   ├── middleware/        # Express middleware
│   ├── services/          # Shared services (shutdown, etc.)
│   ├── utils/             # Utility functions
│   └── validators/        # Custom validators
├── config/                # Configuration modules
├── database/              # Database configuration and migrations
│   ├── backup/            # Database backup system
│   ├── migrations/        # TypeORM migrations
│   └── seeds/             # Database seeders
├── modules/
│   ├── auth/              # Authentication module
│   │   ├── controllers/
│   │   ├── decorators/
│   │   ├── dto/
│   │   ├── entities/
│   │   ├── guards/
│   │   ├── services/
│   │   └── strategies/
│   ├── health/            # Health check module
│   └── user/              # User management module
├── notifications/         # Notification system
├── redis/                 # Redis service and configuration
└── scripts/               # Utility scripts
```

## 🔧 Environment Variables

See [.env.example](./.env.example) for all available configuration options.

### Key Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DB_HOST` | PostgreSQL host | Yes |
| `DB_PORT` | PostgreSQL port | Yes |
| `DB_USERNAME` | Database user | Yes |
| `DB_PASSWORD` | Database password | Yes |
| `DB_NAME` | Database name | Yes |
| `REDIS_HOST` | Redis host | Yes |
| `REDIS_PORT` | Redis port | Yes |
| `REDIS_PASSWORD` | Redis password | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_REFRESH_SECRET` | Refresh token secret | Yes |
| `NODE_ENV` | Environment (development/production/test) | No |
| `PORT` | Server port | No (default: 3000) |

## 🔄 CI/CD Pipeline

This project uses GitHub Actions for continuous integration and deployment.

### Pipeline Stages

1. **Lint & Format** - ESLint and Prettier checks
2. **Unit Tests** - Jest tests with coverage reporting
3. **E2E Tests** - End-to-end tests with test database
4. **Security Audit** - npm audit for vulnerabilities
5. **Build Check** - Production build verification
6. **Docker Build** - Container image build test

### Triggers

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

### Pipeline Status

[![CI/CD Pipeline](https://github.com/MentoNest/SkillSync_Server/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/MentoNest/SkillSync_Server/actions/workflows/ci-cd.yml)

📖 **Full CI/CD configuration**: [.github/workflows/ci-cd.yml](./.github/workflows/ci-cd.yml)

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow [Conventional Commits](https://www.conventionalcommits.org/)
- Write unit tests for new features (minimum 80% coverage)
- Update documentation as needed
- Ensure CI pipeline passes before requesting review

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- 📧 Email: support@skillsync.com
- 🐛 Issues: [GitHub Issues](https://github.com/MentoNest/SkillSync_Server/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/MentoNest/SkillSync_Server/discussions)

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - The progressive Node.js framework
- [Stellar](https://www.stellar.org/) - Decentralized financial infrastructure
- [TypeORM](https://typeorm.io/) - ORM for TypeScript and JavaScript

---

Built with ❤️ by the SkillSync Team
