# Docker Setup Guide for SkillSync Server

This guide explains how to use Docker for development and production deployment of the SkillSync backend API.

## 📋 Prerequisites

- Docker Desktop (v20.10+)
- Docker Compose (v2.0+)

## 🚀 Quick Start

### Development Mode (with Hot-Reload)

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Update `.env` with your configuration** (optional, defaults provided)

3. **Start all services:**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

4. **View logs:**
   ```bash
   docker-compose -f docker-compose.dev.yml logs -f backend
   ```

5. **Stop services:**
   ```bash
   docker-compose -f docker-compose.dev.yml down
   ```

### Production Mode

1. **Build and start:**
   ```bash
   docker-compose up --build -d
   ```

2. **View logs:**
   ```bash
   docker-compose logs -f backend
   ```

3. **Stop services:**
   ```bash
   docker-compose down
   ```

## 🐳 Services

| Service | Port | Description |
|---------|------|-------------|
| Backend API | 3000 | NestJS application |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache & session storage |

## 🔧 Common Commands

### Development

```bash
# Start with hot-reload
docker-compose -f docker-compose.dev.yml up -d

# Rebuild after package.json changes
docker-compose -f docker-compose.dev.yml up --build -d

# Watch logs
docker-compose -f docker-compose.dev.yml logs -f backend

# Access backend container shell
docker exec -it skillsync-backend-dev sh

# Run tests inside container
docker exec skillsync-backend-dev npm test

# Run migrations
docker exec skillsync-backend-dev npm run migration:run
```

### Production

```bash
# Build and start
docker-compose up --build -d

# View logs
docker-compose logs -f backend

# Restart backend only
docker-compose restart backend

# Scale (if needed in future)
docker-compose up -d --scale backend=3
```

### Cleanup

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v

# Remove all unused images
docker image prune -a
```

## 📊 Health Checks

All services have health checks configured:

```bash
# Check service health
docker inspect --format='{{.State.Health.Status}}' skillsync-backend
docker inspect --format='{{.State.Health.Status}}' skillsync-postgres
docker inspect --format='{{.State.Health.Status}}' skillsync-redis
```

## 🔐 Security Notes

- The production Dockerfile runs as a non-root user
- Environment variables should be managed securely
- Never commit `.env` files to version control
- Use strong passwords for PostgreSQL and Redis
- Enable SSL for PostgreSQL in production

## 📁 File Structure

```
├── Dockerfile              # Multi-stage production build
├── docker-compose.yml      # Production compose file
├── docker-compose.dev.yml  # Development compose file
├── .dockerignore          # Files excluded from Docker build
└── DOCKER.md              # This file
```

## 🐛 Troubleshooting

### Port Already in Use

If ports 3000, 5432, or 6379 are already in use:

1. Update the port mappings in `.env`:
   ```env
   PORT=3001
   DB_PORT=5433
   REDIS_PORT=6380
   ```

2. Restart services:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Database Connection Issues

```bash
# Check if PostgreSQL is healthy
docker inspect --format='{{.State.Health.Status}}' skillsync-postgres

# View PostgreSQL logs
docker logs skillsync-postgres

# Access PostgreSQL shell
docker exec -it skillsync-postgres psql -U postgres -d skillsync_db
```

### Redis Connection Issues

```bash
# Check Redis health
docker inspect --format='{{.State.Health.Status}}' skillsync-redis

# Test Redis connection
docker exec skillsync-redis redis-cli -a redis_password ping
```

### Rebuild from Scratch

```bash
# Remove everything and rebuild
docker-compose down -v
docker system prune -af
docker-compose up --build -d
```

## 📝 Environment Variables

Key environment variables for Docker:

```env
# Database
DB_HOST=postgres          # Use service name in Docker
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=skillsync_db

# Redis
REDIS_HOST=redis          # Use service name in Docker
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# Application
NODE_ENV=production
PORT=3000
```

## 🔄 CI/CD Integration

For CI/CD pipelines, you can use:

```bash
# Build only (no start)
docker-compose build

# Run tests in container
docker-compose -f docker-compose.dev.yml run --rm backend npm test

# Run linting
docker-compose -f docker-compose.dev.yml run --rm backend npm run lint
```

## 📦 Image Size Optimization

The production image is optimized using multi-stage builds:

- **Builder stage**: Installs all dependencies and builds the app
- **Production stage**: Only includes production dependencies and built files
- **Target size**: < 500MB

## 🎯 Best Practices

1. Always use `.env` files for configuration
2. Never store secrets in Dockerfiles
3. Use health checks for service dependencies
4. Regularly update base images for security patches
5. Use `docker-compose down -v` only when you want to reset data
6. Monitor container resource usage with `docker stats`
