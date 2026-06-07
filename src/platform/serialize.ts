// 每命串行：把对【同一条命】的写操作排成一队——并发用户同时找她时，回合不互相穿插。
// 单线程 Node 下乐观锁本就不会冲突（每次现读版本再同步写），这层是【顺序整齐】的健壮性保证。
export interface Serializer {
  run<T>(key: string, fn: () => Promise<T> | T): Promise<T>;
}

export function createSerializer(): Serializer {
  const tails = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
      const prev = tails.get(key) ?? Promise.resolve();
      const next = prev.then(() => fn()); // 排到队尾，等前一个完成再跑
      // 队尾即使失败也不卡住后续；但 run 的调用方仍能拿到自己这次的结果/异常。
      tails.set(key, next.then(() => undefined, () => undefined));
      return next;
    },
  };
}
