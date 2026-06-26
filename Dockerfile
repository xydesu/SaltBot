# 第一階段：編譯環境 (Builder)
FROM node:20-slim AS builder

# 安裝 canvas 和 better-sqlite3 需要的編譯依賴
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./

# 執行 npm install，會編譯原生模組 (如 canvas, better-sqlite3)
RUN npm install

# 第二階段：執行環境 (Runner)
FROM node:20-slim

# 只需要安裝執行期需要的函式庫 (不需要 -dev 版本和編譯工具)
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# 複製 package.json (不含 package-lock.json，因為不需要再安裝了)
COPY package.json ./

# 從 builder 階段複製已經編譯好的 node_modules
COPY --from=builder /usr/src/app/node_modules ./node_modules

# 複製原始碼
COPY . .

CMD ["npm", "start"]
