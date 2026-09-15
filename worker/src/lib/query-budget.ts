/**
 * D1 caps queries per Worker invocation (50 on the free plan, and every statement in a batch counts).
 * Jobs that loop over many rows (retries, digests, cleanup, bulk delivery) run against a counting
 * wrapper and stop starting new work before they reach the cap. Anything left is picked up next run.
 */

/** Queries kept in reserve for bookkeeping after a loop stops (final updates, logging). */
const SAFETY_MARGIN = 5;

export interface QueryBudget {
  /** An env whose DB binding counts every query that goes through it. */
  env: Env;
  used(): number;
  /** Queries still available before the safety margin. */
  left(): number;
  /** True when at least `n` more queries fit. */
  has(n: number): boolean;
}

export function withQueryBudget(env: Env, max: number, alreadyUsed = 0): QueryBudget {
  let used = alreadyUsed;
  const count = (n: number) => {
    used += n;
  };

  const inner = new WeakMap<object, D1PreparedStatement>();
  const wrapStatement = (statement: D1PreparedStatement): D1PreparedStatement => {
    const wrapped = {
      bind: (...values: unknown[]) => wrapStatement(statement.bind(...values)),
      first: (column?: string) => {
        count(1);
        return column === undefined ? statement.first() : statement.first(column);
      },
      run: () => {
        count(1);
        return statement.run();
      },
      all: () => {
        count(1);
        return statement.all();
      },
      raw: (options?: { columnNames?: boolean }) => {
        count(1);
        return statement.raw(options as { columnNames: true });
      },
    } as unknown as D1PreparedStatement;
    inner.set(wrapped, statement);
    return wrapped;
  };

  const db = env.DB;
  const wrappedDb = {
    prepare: (query: string) => wrapStatement(db.prepare(query)),
    batch: (statements: D1PreparedStatement[]) => {
      count(statements.length);
      return db.batch(statements.map((s) => inner.get(s) ?? s));
    },
    exec: (query: string) => {
      count(1);
      return db.exec(query);
    },
    dump: () => db.dump(),
    withSession: (...args: Parameters<D1Database["withSession"]>) => db.withSession(...args),
  } as unknown as D1Database;

  const budgetEnv = Object.assign(Object.create(null) as Env, env, { DB: wrappedDb });
  const available = () => max - SAFETY_MARGIN - used;

  return {
    env: budgetEnv,
    used: () => used,
    left: () => Math.max(0, available()),
    has: (n) => available() >= n,
  };
}
