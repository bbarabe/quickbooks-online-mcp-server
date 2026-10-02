import { updateQuickbooksRefundReceipt } from "../handlers/update-quickbooks-refund-receipt.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_refund_receipt";
const toolDescription =
  "Update an existing refund receipt in QuickBooks Online (sparse update). Use patch to change any other RefundReceipt field, such as lines, addresses or classification.";

const toolSchema = z.object({
  id: z.string().min(1).describe("Refund Receipt ID"),
  sync_token: z.string().min(1).describe("Sync token for optimistic locking"),
  customer_ref: z.string().optional().describe("Customer ID"),
  private_note: z.string().optional().describe("Private note"),
  doc_number: z.string().optional().describe("Document number"),
  patch: z
    .record(z.any())
    .optional()
    .describe(
      "Any other RefundReceipt fields to change, in QuickBooks' own PascalCase shape, e.g. {\"PaymentRefNum\": \"1001\", \"ShipAddr\": {\"City\": \"Duvall\"}}. Sent as a sparse update, so fields you leave out are kept. A Line array replaces every existing line: resend each line you want to keep, with its Id. Named parameters (customer_ref, private_note, doc_number) override the same field here."
    ),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksRefundReceipt(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error updating refund receipt: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Refund receipt updated successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const UpdateRefundReceiptTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
