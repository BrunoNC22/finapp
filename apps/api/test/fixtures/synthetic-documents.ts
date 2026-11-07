/**
 * Documentos SINTÉTICOS para testes. São os únicos liberados pelo gitleaks (.gitleaks.toml).
 * Nunca use documentos reais em testes, fixtures ou exemplos.
 */
export const SYNTHETIC_CPF = '123.456.789-09';
export const SYNTHETIC_CPF_DIGITS = '12345678909';
export const OTHER_SYNTHETIC_CPF = '111.444.777-35';
/** O mesmo CPF sintético com os dígitos verificadores trocados (alguns bancos mandam assim). */
export const SYNTHETIC_CPF_WRONG_CHECK_DIGITS = `${SYNTHETIC_CPF_DIGITS.slice(0, 9)}19`;
export const SYNTHETIC_CNPJ = '12.345.678/0001-95';
export const SYNTHETIC_CNPJ_DIGITS = '12345678000195';
/** CNPJ de um terceiro (ex.: o banco emissor do cartão), montado a partir do sintético. */
export const OTHER_SYNTHETIC_CNPJ = `${SYNTHETIC_CNPJ_DIGITS.slice(0, 8)}000276`;
