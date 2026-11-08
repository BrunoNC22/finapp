import { Inject, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Db } from 'mongodb';
import { Clock } from '../../shared/application/clock.js';
import { IdGenerator } from '../../shared/application/id-generator.js';
import { AppConfig } from '../../shared/config/app-config.js';
import { SystemClock } from '../../shared/infrastructure/system-clock.js';
import { UuidIdGenerator } from '../../shared/infrastructure/uuid-id-generator.js';
import {
  ChallengeStore,
  McpTokenStore,
  OwnerRepository,
  PasskeyService,
  PasswordHasher,
  SecretTokens,
  SessionRepository,
  SetupTokenStore,
} from './application/ports/identity-ports.js';
import { AuthService } from './application/use-cases/auth.js';
import { McpAccess } from './application/use-cases/mcp-access.js';
import {
  CryptoSecretTokens,
  ensureIdentityIndexes,
  MemoryChallengeStore,
  MongoMcpTokenStore,
  MongoOwnerRepository,
  MongoSessionRepository,
  MongoSetupTokenStore,
  ScryptPasswordHasher,
  SimpleWebAuthnPasskeyService,
} from './infrastructure/identity-adapters.js';
import { AuthController } from './presentation/auth.controller.js';
import { AuthGuard } from './presentation/auth.guard.js';

/** Login do dono da instância (senha ou digital) e guarda global de autenticação. */
@Module({
  controllers: [AuthController],
  providers: [
    { provide: Clock, useFactory: () => new SystemClock() },
    { provide: IdGenerator, useFactory: () => new UuidIdGenerator() },
    { provide: OwnerRepository, useFactory: (db: Db) => new MongoOwnerRepository(db), inject: [Db] },
    { provide: SessionRepository, useFactory: (db: Db) => new MongoSessionRepository(db), inject: [Db] },
    { provide: SetupTokenStore, useFactory: (db: Db) => new MongoSetupTokenStore(db), inject: [Db] },
    { provide: PasswordHasher, useFactory: () => new ScryptPasswordHasher() },
    { provide: SecretTokens, useFactory: () => new CryptoSecretTokens() },
    { provide: ChallengeStore, useFactory: () => new MemoryChallengeStore() },
    {
      provide: PasskeyService,
      useFactory: (config: AppConfig) => new SimpleWebAuthnPasskeyService({ ...config.webauthn, rpName: 'finapp' }),
      inject: [AppConfig],
    },
    {
      provide: AuthService,
      useFactory: (
        owners: OwnerRepository,
        sessions: SessionRepository,
        setupTokens: SetupTokenStore,
        hasher: PasswordHasher,
        tokens: SecretTokens,
        passkeys: PasskeyService,
        challenges: ChallengeStore,
        clock: Clock,
        ids: IdGenerator,
        config: AppConfig,
      ) =>
        new AuthService({
          owners,
          sessions,
          setupTokens,
          hasher,
          tokens,
          passkeys,
          challenges,
          clock,
          ids,
          policy: config.session,
        }),
      inject: [
        OwnerRepository,
        SessionRepository,
        SetupTokenStore,
        PasswordHasher,
        SecretTokens,
        PasskeyService,
        ChallengeStore,
        Clock,
        IdGenerator,
        AppConfig,
      ],
    },
    { provide: McpTokenStore, useFactory: (db: Db) => new MongoMcpTokenStore(db), inject: [Db] },
    {
      provide: McpAccess,
      useFactory: (store: McpTokenStore, tokens: SecretTokens, clock: Clock) => new McpAccess(store, tokens, clock),
      inject: [McpTokenStore, SecretTokens, Clock],
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, McpAccess],
})
export class IdentityModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(IdentityModule.name);
  constructor(@Inject(Db) private readonly db: Db) {}

  onApplicationBootstrap(): void {
    ensureIdentityIndexes(this.db).catch((error: Error) =>
      this.logger.warn(`índices de identidade pendentes (banco indisponível): ${error.message}`),
    );
  }
}
