# SYNAP-SUIVI — image de production
FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Dépendances
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npm ci

# Build (sert aussi d'image pour les migrations et le seed)
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

# Migrations et initialisation : image dédiée, sans l'environnement de build
FROM base AS migrator
ENV NODE_ENV=production
COPY prisma7.config.ts ./
COPY prisma ./prisma
# Dépendances strictement nécessaires aux migrations et à l'initialisation
RUN npm init -y > /dev/null  && npm install --no-audit --no-fund --omit=optional       prisma@7.10.0 @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0       pg bcryptjs dotenv tsx  && npx prisma generate  && npm cache clean --force
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

# Exécution
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
