# Approval Bridge Sidecar (LAT-62)
# Syncs Paperclip board-approvals with the CoS Telegram bridge.

FROM node:20-alpine

ENV NODE_ENV=production

RUN addgroup -S approval && adduser -S approval -G approval

WORKDIR /app

COPY --chown=approval:approval package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY --chown=approval:approval src ./src

USER approval

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3201/health || exit 1

EXPOSE 3201
CMD ["node", "src/index.js"]
