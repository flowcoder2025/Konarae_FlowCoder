/**
 * Manual Migration Script
 * Runs manual SQL migrations for pgvector and hybrid_search
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function runMigration(filename: string) {
  const filepath = join(process.cwd(), "prisma", "migrations", "manual", filename);
  const sql = readFileSync(filepath, "utf-8");

  console.log(`\n📝 Running: ${filename}`);
  console.log("─".repeat(50));

  // Split SQL by semicolons and filter out comments and empty lines
  const statements = sql
    .split(";")
    .map((stmt) => stmt.trim())
    .filter((stmt) => {
      // Remove single-line comments and empty statements
      const cleaned = stmt
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim();
      return cleaned.length > 0;
    });

  try {
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        console.log(`  Executing statement ${i + 1}/${statements.length}...`);
        await prisma.$executeRawUnsafe(statement);
      }
    }
    console.log(`✅ Success: ${filename}`);
  } catch (error) {
    console.error(`❌ Error in ${filename}:`, error);
    throw error;
  }
}

async function main() {
  console.log("🚀 Starting manual migrations...\n");

  try {
    // 1. Create pgvector extension and document_embeddings table
    await runMigration("001_create_document_embeddings.sql");

    // 2. Create hybrid_search function
    await runMigration("002_create_hybrid_search.sql");

    console.log("\n" + "=".repeat(50));
    console.log("✨ All manual migrations completed successfully!");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n❌ Migration failed!");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
