import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { TestContext } from "vitest";
import { createDatabase } from "../src/db/database";

export const adminDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://chat_app:chat_app@127.0.0.1:5432/chat_app";

async function admin<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: adminDatabaseUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function createEmptyDatabase(t: TestContext) {
  const name = `chat_app_test_${randomUUID().replaceAll("-", "")}`;
  await admin((client) => client.query(`create database ${name}`));
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  const db = createDatabase(url.toString());
  t.onTestFinished(async () => {
    await db.destroy();
    await admin((client) => client.query(`drop database if exists ${name} with (force)`));
  });
  return { db, url: url.toString() };
}
