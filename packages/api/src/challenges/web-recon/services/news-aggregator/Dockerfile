FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production --no-audit --quiet

COPY server.js ./

ENV PORT=4004
ENV NODE_ENV=production

EXPOSE 4004

HEALTHCHECK --interval=5s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4004/health || exit 1

CMD ["node", "server.js"]
