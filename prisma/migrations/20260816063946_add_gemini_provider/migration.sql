-- AlterEnum
ALTER TYPE "LlmProvider" ADD VALUE 'GEMINI';

-- DropIndex
DROP INDEX "workflows_enabled_idx";
