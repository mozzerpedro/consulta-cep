import net from 'node:net';

// Servidor RESP2 mínimo (GET / SET com EX / DEL / TTL), só o suficiente para
// exercitar o client de verdade nos testes — sem depender de um Redis instalado.

function parse(buf) {
  const comandos = [];
  let off = 0;

  outer: while (off < buf.length) {
    if (buf[off] !== 0x2a) break; // '*' = array
    const nl = buf.indexOf('\r\n', off);
    if (nl === -1) break;

    const n = Number(buf.slice(off + 1, nl).toString());
    let p = nl + 2;
    const partes = [];

    for (let i = 0; i < n; i++) {
      if (buf[p] !== 0x24) break outer; // '$' = bulk string
      const nl2 = buf.indexOf('\r\n', p);
      if (nl2 === -1) break outer;

      const len = Number(buf.slice(p + 1, nl2).toString());
      const inicio = nl2 + 2;
      if (buf.length < inicio + len + 2) break outer; // comando ainda incompleto

      partes.push(buf.slice(inicio, inicio + len).toString());
      p = inicio + len + 2;
    }

    if (partes.length !== n) break;
    comandos.push(partes);
    off = p;
  }

  return [comandos, buf.slice(off)];
}

const bulk = (s) => (s === null ? '$-1\r\n' : `$${Buffer.byteLength(s)}\r\n${s}\r\n`);

export async function startFakeRedis() {
  const store = new Map(); // chave -> { valor, expiraEm|null }
  const comandos = [];

  function ler(chave) {
    const item = store.get(chave);
    if (!item) return null;
    if (item.expiraEm !== null && item.expiraEm <= Date.now()) {
      store.delete(chave);
      return null;
    }
    return item.valor;
  }

  const sockets = new Set();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));

    let buf = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const [recebidos, resto] = parse(buf);
      buf = resto;

      for (const partes of recebidos) {
        const cmd = partes[0].toUpperCase();
        comandos.push(partes);

        if (cmd === 'SET') {
          const ex = partes.findIndex((a) => a.toUpperCase() === 'EX');
          const expiraEm = ex !== -1 ? Date.now() + Number(partes[ex + 1]) * 1000 : null;
          store.set(partes[1], { valor: partes[2], expiraEm });
          socket.write('+OK\r\n');
        } else if (cmd === 'GET') {
          socket.write(bulk(ler(partes[1])));
        } else if (cmd === 'DEL') {
          socket.write(`:${store.delete(partes[1]) ? 1 : 0}\r\n`);
        } else if (cmd === 'PING') {
          socket.write('+PONG\r\n');
        } else if (cmd === 'QUIT') {
          socket.write('+OK\r\n');
          socket.end();
        } else {
          socket.write('+OK\r\n'); // HELLO, CLIENT SETINFO e afins
        }
      }
    });

    socket.on('error', () => {});
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `redis://127.0.0.1:${server.address().port}`,
    store,
    /** Segundos de TTL da chave, ou `null` se ela não expira / não existe. */
    ttl(chave) {
      const item = store.get(chave);
      if (!item || item.expiraEm === null) return null;
      return Math.ceil((item.expiraEm - Date.now()) / 1000);
    },
    /** Argumentos do último comando com esse nome, ou `undefined`. */
    ultimoComando(nome) {
      return comandos.filter((c) => c[0].toUpperCase() === nome.toUpperCase()).at(-1);
    },
    async close() {
      // net.Server não tem closeAllConnections (isso é do http.Server), e sem
      // derrubar os sockets o close() fica esperando o client do Redis.
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
