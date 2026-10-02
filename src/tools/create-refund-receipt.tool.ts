import { createQuickbooksRefundReceipt } from "../handlers/create-quickbooks-refund-receipt.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import { salesLineItemSchema, salesTransactionFields } from "../helpers/sales-transaction-fields.js";

const toolName = "create_refund_receipt";
const toolDescription =
  "Create a refund receipt (customer refund) in QuickBooks Online. Each line takes either an amount or qty + unit_price; amounts are not sign-checked, so QuickBooks decides whether a negative line is valid. Pass request_id to make retries idempotent.";

const toolSchema = z.object({
  customer_ref: z.string().min(1).describe("Customer ID"),
  line_items: z.array(salesLineItemSchema).min(1).describe("Line items"),
  payment_method_ref: z.string().optional().describe("Payment method ID"),
  deposit_to_account_ref: z.string().optional().describe("Account to debit from"),
  txn_date: z.string().optional().describe("Transaction date (YYYY-MM-DD)"),
  doc_number: z.string().optional().describe("Document number"),
  private_note: z.string().optional().describe("Private note"),
  global_tax_calculation: z.enum(["TaxExcluded", "TaxInclusive", "NotApplicable"]).optional().describe("Non-US companies only: whether unit prices exclude or include tax"),
  ...salesTransactionFields,
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksRefundReceipt(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error creating refund receipt: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Refund receipt created successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const CreateRefundReceiptTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
