# ====== Builder stage ======
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --only=production

# ====== Runtime stage ======
FROM node:18-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY index.js ./

# Use the existing node user
USER node

EXPOSE 8080

CMD ["npm", "start"]
