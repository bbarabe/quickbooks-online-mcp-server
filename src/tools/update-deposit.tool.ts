import { updateQuickbooksDeposit } from "../handlers/update-quickbooks-deposit.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_deposit";
const toolDescription =
  "Update a deposit in QuickBooks Online. Use patch to change any other Deposit field, such as lines or the deposit account.";
const toolSchema = z.object({
  id: z.string().min(1).describe("Deposit ID"),
  sync_token: z.string().min(1).describe("Sync token"),
  private_note: z.string().optional().describe("Private note"),
  patch: z
    .record(z.any())
    .optional()
    .describe(
      "Any other Deposit fields to change, in QuickBooks' own PascalCase shape, e.g. {\"TxnDate\": \"2026-10-01\", \"DepositToAccountRef\": {\"value\": \"35\"}}. Merged over the current deposit, so fields you leave out are kept. A Line array replaces every existing line: resend each line you want to keep, with its Id. private_note overrides PrivateNote here."
    ),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksDeposit(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Deposit updated:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const UpdateDepositTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
