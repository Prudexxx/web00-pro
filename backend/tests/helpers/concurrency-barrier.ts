import {
  Prisma,
  type PrismaClient
} from "../../src/generated/prisma/client.js";

interface BarrierWaiter {
  reject(error: Error): void;
  resolve(): void;
}

export interface ConcurrencyBarrier {
  arriveAndWait(participant: string): Promise<void>;
  readonly arrivedParticipants: readonly string[];
  readonly released: boolean;
}

export interface UserCountGuardEvent {
  attempt: number;
  count: number;
  participant: string;
}

export interface SerializableAttemptEvent {
  attempt: number;
  isolationLevel: Prisma.TransactionIsolationLevel | undefined;
  participant: string;
}

export function createConcurrencyBarrier(
  expectedParticipants: number,
  options: {
    label: string;
    timeoutMs?: number;
  }
): ConcurrencyBarrier {
  const arrivedParticipants: string[] = [];
  const waiters: BarrierWaiter[] = [];
  let released = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function clearBarrierTimeout(): void {
    if (timeout !== undefined) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  }

  function release(): void {
    released = true;
    clearBarrierTimeout();

    for (const waiter of waiters.splice(0)) {
      waiter.resolve();
    }
  }

  function fail(error: Error): void {
    released = true;
    clearBarrierTimeout();

    for (const waiter of waiters.splice(0)) {
      waiter.reject(error);
    }
  }

  return {
    arriveAndWait(participant) {
      if (released) {
        return Promise.resolve();
      }

      arrivedParticipants.push(participant);

      if (arrivedParticipants.length === expectedParticipants) {
        release();
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        waiters.push({ reject, resolve });

        timeout ??= setTimeout(() => {
          fail(
            new Error(
              `Concurrency barrier "${options.label}" timed out waiting for ` +
                `${expectedParticipants} participants; arrived: ` +
                `${arrivedParticipants.join(", ") || "none"}`
            )
          );
        }, options.timeoutMs ?? 5000);
      });
    },
    get arrivedParticipants() {
      return [...arrivedParticipants];
    },
    get released() {
      return released;
    }
  };
}

export function createUserCountGuardedPrismaClient(options: {
  barrier: ConcurrencyBarrier;
  onAttempt?: (event: SerializableAttemptEvent) => void;
  onGuardRead?: (event: UserCountGuardEvent) => void;
  participant: string;
  prisma: PrismaClient;
  shouldPauseAfterUserCount: (input: { count: number; where: unknown }) => boolean;
}): PrismaClient {
  let attempt = 0;

  return {
    $transaction: async <T>(
      operation: (tx: Prisma.TransactionClient) => Promise<T>,
      transactionOptions?: { isolationLevel?: Prisma.TransactionIsolationLevel }
    ): Promise<T> => {
      attempt += 1;
      options.onAttempt?.({
        attempt,
        isolationLevel: transactionOptions?.isolationLevel,
        participant: options.participant
      });

      return options.prisma.$transaction(async (tx) => {
        const guardedOptions = {
          attempt,
          barrier: options.barrier,
          participant: options.participant,
          shouldPauseAfterUserCount: options.shouldPauseAfterUserCount,
          ...(options.onGuardRead === undefined ? {} : { onGuardRead: options.onGuardRead })
        };
        const guardedTransaction = createUserCountGuardedTransactionClient(tx, guardedOptions);

        return operation(guardedTransaction);
      }, transactionOptions);
    }
  } as unknown as PrismaClient;
}

function createUserCountGuardedTransactionClient(
  tx: Prisma.TransactionClient,
  options: {
    attempt: number;
    barrier: ConcurrencyBarrier;
    onGuardRead?: (event: UserCountGuardEvent) => void;
    participant: string;
    shouldPauseAfterUserCount: (input: { count: number; where: unknown }) => boolean;
  }
): Prisma.TransactionClient {
  const guardedUser = new Proxy(tx.user, {
    get(target, property, receiver) {
      if (property !== "count") {
        return Reflect.get(target, property, receiver);
      }

      return async (args?: Prisma.UserCountArgs): Promise<number> => {
        const count = await target.count(args);

        if (
          options.shouldPauseAfterUserCount({
            count,
            where: args?.where
          })
        ) {
          options.onGuardRead?.({
            attempt: options.attempt,
            count,
            participant: options.participant
          });
          await options.barrier.arriveAndWait(options.participant);
        }

        return count;
      };
    }
  });

  return new Proxy(tx, {
    get(target, property, receiver) {
      if (property === "user") {
        return guardedUser;
      }

      return Reflect.get(target, property, receiver);
    }
  }) as Prisma.TransactionClient;
}
