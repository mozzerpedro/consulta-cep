FROM node:24-trixie-slim

ENV NODE_ENV=production

WORKDIR /app

# Manifestos antes do código: enquanto as dependências não mudam, o Docker
# reaproveita a camada do npm ci e o rebuild fica instantâneo.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# A imagem oficial já traz o usuário `node`; não há motivo para rodar como root.
USER node

EXPOSE 3000

# A slim não tem curl, então o próprio node faz a checagem. O /health fica fora
# do rate limit, então o healthcheck nunca é bloqueado.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Forma exec, sem `npm start`: o node vira PID 1 e recebe o SIGTERM direto,
# o que aciona o shutdown gracioso do server.js (fecha HTTP e Redis).
CMD ["node", "src/server.js"]
