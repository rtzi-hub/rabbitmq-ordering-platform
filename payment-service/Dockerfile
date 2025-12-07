FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --only=production

FROM node:22-alpine AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=builder /usr/src/app/node_modules ./node_modules

COPY package*.json ./
COPY index.js ./
COPY lib ./lib

USER node

CMD ["node", "index.js"]
