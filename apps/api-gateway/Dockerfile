
FROM node:20 AS builder
WORKDIR /app

COPY . .

RUN npm install

RUN npm run build

RUN npm prune --omit=dev



FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json ./

COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/apps/api-gateway/package.json ./apps/api-gateway/
COPY --from=builder /app/apps/api-gateway/dist ./apps/api-gateway/dist

COPY --from=builder /app/packages ./packages

EXPOSE 3000

CMD ["node", "apps/api-gateway/dist/index.js"]