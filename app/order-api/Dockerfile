FROM node:22-trixie-slim AS deps
WORKDIR /usr/src/app

# Install only production dependencies in a clean, repeatable way
COPY package*.json ./
RUN npm ci --omit=dev

# ===== runtime stage (small, production image) =====
FROM node:22-trixie-slim AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

# Copy deps from deps stage
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy app source
COPY package*.json ./
COPY index.js ./
COPY lib ./lib

# Run as non-root (node user exists in the official image)
USER node
CMD ["node", "index.js"]
