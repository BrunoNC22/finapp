import { describe, expect, it } from 'vitest';
import { SYNTHETIC_CNPJ, SYNTHETIC_CPF, SYNTHETIC_CPF_DIGITS } from '../../../test/fixtures/synthetic-documents.js';
import { Document, InvalidDocumentError } from './document.js';

// Números sintéticos (não são documentos reais).
const CPF = SYNTHETIC_CPF;
const CNPJ = SYNTHETIC_CNPJ;

describe('Document', () => {
  it('normalizes punctuation and infers the type from the length', () => {
    expect(Document.parse(CPF).type).toBe('CPF');
    expect(Document.parse(CPF).value).toBe(SYNTHETIC_CPF_DIGITS);
    expect(Document.parse(CNPJ).type).toBe('CNPJ');
  });

  it('keeps masked digits (third-party documents often come partially hidden)', () => {
    const masked = Document.parse('***.456.789-**');
    expect(masked.isMasked).toBe(true);
    expect(masked.value).toBe('***456789**');
  });

  it('rejects values that cannot be a CPF or CNPJ', () => {
    for (const bad of ['', '123', '1234567890123', 'abc.def.ghi-jk']) {
      expect(() => Document.parse(bad), bad).toThrow(InvalidDocumentError);
    }
  });

  it('identifies the same person only when both documents are fully known', () => {
    expect(Document.parse(CPF).isSameAs(Document.parse(SYNTHETIC_CPF_DIGITS))).toBe(true);
    expect(Document.parse(CPF).isSameAs(Document.parse('***.456.789-**'))).toBe(false);
    expect(Document.parse(CPF).isSameAs(Document.parse(CNPJ))).toBe(false);
  });

  it('never prints the full number', () => {
    expect(String(Document.parse(CPF))).not.toContain(SYNTHETIC_CPF_DIGITS);
    expect(JSON.stringify({ d: Document.parse(CPF) })).not.toContain(SYNTHETIC_CPF_DIGITS);
  });
});
