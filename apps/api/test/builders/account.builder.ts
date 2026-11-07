import { type Account, Account as AccountEntity, type AccountKind } from '../../src/modules/ledger/domain/account.js';
import { Document } from '../../src/shared/kernel/document.js';
import { OTHER_SYNTHETIC_CPF } from '../fixtures/synthetic-documents.js';

let sequence = 0;

/** Builder de contas com dados 100% sintéticos. */
export class AccountBuilder {
  private id = `acc-${++sequence}`;
  private externalId = `ext-acc-${sequence}`;
  private institutionName = 'Banco Fictício';
  private kind: AccountKind = 'checking';
  private holderDocument = OTHER_SYNTHETIC_CPF;
  private displayName: string | undefined;

  withId(id: string): this {
    this.id = id;
    return this;
  }
  withExternalId(externalId: string): this {
    this.externalId = externalId;
    return this;
  }
  withInstitution(name: string): this {
    this.institutionName = name;
    return this;
  }
  withKind(kind: AccountKind): this {
    this.kind = kind;
    return this;
  }
  withHolderDocument(document: string): this {
    this.holderDocument = document;
    return this;
  }
  withDisplayName(name: string): this {
    this.displayName = name;
    return this;
  }

  build(): Account {
    return AccountEntity.create({
      id: this.id,
      externalId: this.externalId,
      institutionName: this.institutionName,
      kind: this.kind,
      holderDocument: Document.parse(this.holderDocument),
      ...(this.displayName ? { displayName: this.displayName } : {}),
    });
  }
}

export const anAccount = () => new AccountBuilder();
