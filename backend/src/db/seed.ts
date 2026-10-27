import type { Database } from "./database";

export const defaultWorkspaceSlug = "default";
export const environmentKeys = ["development", "staging", "production"] as const;

export async function seed(db: Database): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("workspaces")
      .values({ slug: defaultWorkspaceSlug, name: "Default workspace" })
      .onConflict((conflict) => conflict.column("slug").doNothing())
      .execute();
    const workspace = await trx
      .selectFrom("workspaces")
      .select("id")
      .where("slug", "=", defaultWorkspaceSlug)
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("environments")
      .values(environmentKeys.map((key) => ({ workspace_id: workspace.id, key })))
      .onConflict((conflict) => conflict.columns(["workspace_id", "key"]).doNothing())
      .execute();
  });
}
