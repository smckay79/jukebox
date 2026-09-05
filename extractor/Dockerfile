# Only builds videojam-extractor itself. The PO-token provider is a
# separate, already-published image (brainicism/bgutil-ytdlp-pot-provider) —
# see docker-compose.yml / README.md — deliberately not built from source
# here, so we're never out of sync with upstream's BotGuard fixes.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.js"]
