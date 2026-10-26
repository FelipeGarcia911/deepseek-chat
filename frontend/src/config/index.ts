import { parseFrontendConfig } from "./schema";

export const config = parseFrontendConfig(import.meta.env);
