import "dotenv/config";
import { Client, type QueryResultRow } from "pg";
import {
  assertTestDatabaseUrl,
  parseDatabaseEnv
} from "../../src/config/database-env.js";

export function getTestDatabaseUrl(): string {
  const env = parseDatabaseEnv(process.env);

  assertTestDatabaseUrl(env);

  return env.TEST_DATABASE_URL;
}

export async function withTestClient<T>(
  callback: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client({
    connectionString: getTestDatabaseUrl()
  });

  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

export async function queryRows<T extends QueryResultRow>(
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
  return withTestClient(async (client) => {
    const result = await client.query<T>(sql, values);

    return result.rows;
  });
}
