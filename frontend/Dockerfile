# Build the Next.js app from the repository root so pnpm can use the committed workspace lockfile.
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /repo

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=dependencies /repo/node_modules ./node_modules
COPY --from=dependencies /repo/frontend/node_modules ./frontend/node_modules
COPY . .
WORKDIR /repo/frontend
ARG API_UPSTREAM=http://api:8080
ENV API_UPSTREAM=${API_UPSTREAM}
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/.next/static ./frontend/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/public ./frontend/public
USER nextjs
EXPOSE 3000
CMD ["node", "frontend/server.js"]
