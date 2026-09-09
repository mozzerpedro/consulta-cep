// Carrega o .env sem dependência externa (Node >= 20.12).
//
// Precisa ser importado ANTES de qualquer módulo que leia `process.env` no topo:
// em ESM os imports são avaliados antes do corpo do módulo, então fazer isso
// dentro do server.js chegaria tarde demais.
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // Sem .env: seguimos com os padrões e as variáveis já no ambiente.
  }
}
