# Build context: PROJECT ROOT (not the server/ directory) — required because
# server/src imports from ../../../shared/office-world. Deploy with:
#
#   flyctl deploy --config server/fly.toml
#
# from the project root, so the build context contains both server/ and shared/.

FROM node:20-alpine AS builder
WORKDIR /app/server
COPY server/package.json server/package-lock.json server/tsconfig.json ./
RUN npm ci
COPY server/src/ ./src/
# Mirror the on-disk layout so ../shared resolves correctly during tsc.
COPY shared/ /app/shared/
RUN npx tsc

FROM node:20-alpine
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/server/dist ./dist
EXPOSE 2567
# tsc with rootDir=".." emits dist/server/src/index.js + dist/shared/...
CMD ["node", "dist/server/src/index.js"]
