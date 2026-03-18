FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production --no-audit --quiet

COPY server.js ./

ENV PORT=4001
ENV NODE_ENV=production

EXPOSE 4001

HEALTHCHECK --interval=5s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4001/health || exit 1

CMD ["node", "server.js"]
