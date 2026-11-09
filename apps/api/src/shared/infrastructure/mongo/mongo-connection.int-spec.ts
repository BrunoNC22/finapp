import { createServer, type Server, type Socket, connect as tcpConnect } from 'node:net';
import { MongoClient } from 'mongodb';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { MongoConnection } from './mongo-connection.js';

/** Porta livre agora (ninguém escutando) para simular o banco fora do ar. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as { port: number };
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** "Liga" o banco: passa a encaminhar a porta para o MongoDB de teste. */
async function bringUp(port: number): Promise<{ close: () => Promise<void> }> {
  const target = new URL(inject('mongoUrl'));
  const sockets = new Set<Socket>();
  const proxy: Server = createServer((socket) => {
    const upstream = tcpConnect(Number(target.port), target.hostname);
    sockets.add(socket).add(upstream);
    socket.pipe(upstream).pipe(socket);
    socket.on('error', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(port, '127.0.0.1', resolve));
  return {
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        proxy.close(() => resolve());
      }),
  };
}

async function eventually(check: () => Promise<unknown>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await check();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

describe('MongoConnection', () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.splice(0)) await fn();
  });

  it('recovers when the database comes up after the API (a failed first connect does not kill the client)', async () => {
    const port = await freePort();
    const client = new MongoClient(`mongodb://127.0.0.1:${port}`, { serverSelectionTimeoutMS: 300 });
    const connection = new MongoConnection(client, { retryMs: 100 });
    connection.start();
    cleanup.push(async () => connection.stop());
    cleanup.push(() => client.close());
    const db = client.db('conexao');

    // Banco fora: uma requisição falha (no driver, isso fecharia o cliente para sempre).
    await expect(db.command({ ping: 1 })).rejects.toThrow();
    expect(connection.isConnected).toBe(false);

    const proxy = await bringUp(port);
    cleanup.push(() => proxy.close());
    await eventually(() => db.command({ ping: 1 }));
    expect(connection.isConnected).toBe(true);
  });
});
