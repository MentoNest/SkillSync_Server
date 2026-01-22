# Database Setup and Usage

This project uses TypeORM with PostgreSQL for data persistence.

## Quick Start

1. **Start PostgreSQL using Docker Compose:**
   ```bash
   docker-compose up -d
   ```

2. **Copy environment variables:**
   ```bash
   cp .env.example .env
   ```

3. **Run migrations:**
   ```bash
   npm run migration:run
   ```

4. **Seed the database:**
   ```bash
   npm run seed
   ```

## Available Scripts

### Migration Commands
- `npm run migration:generate --name CreateNewTable` - Generate a new migration
- `npm run migration:run` - Run all pending migrations
- `npm run migration:revert` - Revert the last migration

### Seed Command
- `npm run seed` - Run database seeding (idempotent, safe to run multiple times)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://skillsync_user:skillsync_password@localhost:5432/skillsync_db` |
| `DB_SSL` | Enable SSL for database connections | `false` |
| `DB_LOGGING` | Enable database query logging | `false` |

## Configuration

- **TypeORM Config**: `apps/api/src/config/data-source.ts`
- **Entities**: `apps/api/src/entities/*.entity.ts`
- **Migrations**: `apps/api/src/migrations/*.ts`
- **Seeds**: `apps/api/src/seeds/*.ts`

## Development Notes

- Auto-sync is disabled in production; use migrations for schema changes
- Migration names should be descriptive and follow the pattern `ActionTable`
- Seed scripts are idempotent and safe to run multiple times
- Entities use UUID primary keys for better scalability
