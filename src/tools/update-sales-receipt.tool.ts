import { updateQuickbooksSalesReceipt } from "../handlers/update-quickbooks-sales-receipt.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_sales_receipt";
const toolDescription =
  "Update an existing sales receipt in QuickBooks Online (sparse update). Use patch to change any other SalesReceipt field, such as lines, addresses or classification.";

const toolSchema = z.object({
  id: z.string().min(1).describe("Sales Receipt ID"),
  sync_token: z.string().min(1).describe("Sync token for optimistic locking"),
  customer_ref: z.string().optional().describe("Customer ID"),
  private_note: z.string().optional().describe("Private note"),
  doc_number: z.string().optional().describe("Document number"),
  patch: z
    .record(z.any())
    .optional()
    .describe(
      "Any other SalesReceipt fields to change, in QuickBooks' own PascalCase shape, e.g. {\"PaymentRefNum\": \"1001\", \"ShipAddr\": {\"City\": \"Duvall\"}}. Sent as a sparse update, so fields you leave out are kept. A Line array replaces every existing line: resend each line you want to keep, with its Id. Named parameters (customer_ref, private_note, doc_number) override the same field here."
    ),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksSalesReceipt(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error updating sales receipt: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Sales receipt updated successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const UpdateSalesReceiptTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
