// C4：prod 禁用内存/易失存储。否则 prod 误用内存库 → 重启 = 她被彻底重置。
export interface GuardOpts {
  storeKind: 'memory' | 'file';
  path?: string;
  env?: string;
}

export function assertPersistenceSafeForProd(opts: GuardOpts): void {
  const env = opts.env ?? process.env.VEGA_ENV ?? process.env.NODE_ENV ?? 'development';
  const ephemeral = opts.storeKind === 'memory' || opts.path === ':memory:' || opts.path === undefined;
  if (env === 'production' && ephemeral) {
    throw new Error(
      'C4 guard: refusing to start with an in-memory/ephemeral store in production — ' +
        'she would be reset on restart. Use a durable store (file/DB).',
    );
  }
}
