# ======================
# Dependencies stage
# ======================
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci


# ======================
# Build stage
# ======================
FROM node:20-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build


# ======================
# Runtime stage (dev)
# ======================
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=development

COPY --from=build /app ./

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
