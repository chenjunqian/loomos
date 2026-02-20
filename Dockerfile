# Use official Bun image (latest)
FROM oven/bun:1

# Install system dependencies for Playwright/Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxtst6 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

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
RUN npx prisma generate

# Copy source code
COPY src ./src/
COPY tsconfig.json ./

# Install Playwright Chromium
RUN npx -y playwright install chromium

# Build the application
RUN bun run build

# Expose port
EXPOSE 3000

# Start command
CMD ["bun", "run", "start"]
