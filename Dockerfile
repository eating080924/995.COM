# 使用 Node.js 20 官方 alpine 版本，建立穩定的編譯環境
FROM node:20-alpine AS builder

WORKDIR /app

# 複製套件清單進行依賴安裝（利用 Docker 緩存機制加速後續建置）
COPY package*.json ./
RUN npm ci

# 複製專案其餘檔案
COPY . .

# 執行打包（產生 dist 目錄，內含前端網頁靜態檔與編譯後的 Express 伺服器程式碼 dist/server.cjs）
RUN npm run build

# --- 運行階段 (Production Runner) ---
FROM node:20-alpine AS runner

WORKDIR /app

# 設定環境變數為生產模式
ENV NODE_ENV=production
ENV PORT=8080

# 僅安裝生產環境所需的套件（如 express、firebase 等，排除開發依賴）
COPY package*.json ./
RUN npm ci --omit=dev

# 從編譯階段複製打包好的 dist 目錄到運行容器中
COPY --from=builder /app/dist ./dist

# 宣告對外 Port（Cloud Run 容器預設監聽 8080）
EXPOSE 8080

# 啟動應用程式
CMD ["node", "dist/server.cjs"]
