import './lib/env.js'; // precisa vir primeiro: popula process.env para os demais módulos
import { createApp } from './app.js';
import { closeRedis, getRedis } from './lib/redis.js';

const PORT = Number(process.env.PORT ?? 3000);

const server = createApp().listen(PORT, '0.0.0.0', () => {
  console.log(`API de CEP rodando em http://localhost:${PORT}`);
});

// Aquece a conexão no boot para a primeira request não pagar o handshake.
// Falha aqui não impede o servidor de subir: o cache é opcional.
getRedis();

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => {
    server.close(async () => {
      await closeRedis();
      process.exit(0);
    });
  });
}
