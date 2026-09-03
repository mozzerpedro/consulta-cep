export class AppError extends Error {
  /**
   * @param {number} status  status HTTP a ser devolvido
   * @param {string} code    código estável para o cliente tratar
   * @param {string} message mensagem legível
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}
