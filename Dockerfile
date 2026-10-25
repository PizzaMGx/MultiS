FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev && mkdir -p /app/data && chown pwuser:pwuser /app/data
USER pwuser
EXPOSE 3000
CMD ["node", "server/index.js"]
