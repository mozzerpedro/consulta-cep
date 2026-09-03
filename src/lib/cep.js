/** Remove tudo que não for dígito: "80010-010" -> "80010010" */
export function sanitizeCep(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** CEP válido = exatamente 8 dígitos */
export function isValidCep(cep) {
  return /^\d{8}$/.test(cep);
}

/** "80010010" -> "80010-010" */
export function formatCep(cep) {
  return `${cep.slice(0, 5)}-${cep.slice(5)}`;
}
