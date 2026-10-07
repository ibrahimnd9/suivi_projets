import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    // Base « miroir » utilisée par `prisma migrate dev` pour valider les migrations.
    // En développement local (prisma dev), il s'agit du port principal + 1.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
