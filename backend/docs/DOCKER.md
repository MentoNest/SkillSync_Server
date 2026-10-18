# Docker setup (#1467)

## Development (hot reload)

```bash
cp .env.example .env
docker compose up --build
```

- API: http://localhost:3000  
- Health: http://localhost:3000/health  
- Postgres: `localhost:5432` / Redis: `localhost:6379`  
- `./src` is bind-mounted for `nest start --watch`

## Production image

```bash
docker compose --profile prod up --build backend-prod
# or
docker build --target production -t skillsync-api .
docker run --env-file .env -p 3000:3000 skillsync-api
```

Final image runs `node dist/main.js` as non-root on Alpine Node 20.
