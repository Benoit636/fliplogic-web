FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
COPY scripts ./scripts
# SQLite database and nightly backups live on a mounted volume.
ENV DATABASE_PATH=/data/dealer-social.db BACKUP_DIR=/data/backups MEDIA_DIR=/data/media PORT=3000
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
