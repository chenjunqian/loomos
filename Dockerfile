# Use official Bun image (latest)
FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json ./
COPY bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy Prisma schema
COPY prisma ./prisma/
COPY .env.example ./

# Generate Prisma client
RUN bunx prisma generate

# Copy source code
COPY src ./src/
COPY tsconfig.json ./

# Build the application
RUN bun run build

# Expose port
EXPOSE 3000

# Start command
CMD ["sh", "-c", "bunx prisma db push --accept-data-loss && bun run start"]