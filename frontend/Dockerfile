# Build stage: compile TypeScript & Vite production bundle
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Serve stage: lightweight Caddy web server with SPA routing and API reverse proxy
FROM caddy:2.8-alpine

COPY --from=builder /app/dist /srv/frontend/dist
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 5173
EXPOSE 80

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
