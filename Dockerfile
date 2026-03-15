# Use official Bun image (Debian-based for package management)
FROM oven/bun:1-debian

WORKDIR /app

# Install system dependencies for headless Chrome
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./
COPY bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Install agent-browser CLI and download Chrome
RUN bun install -g agent-browser && agent-browser install

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