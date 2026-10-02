import { createQuickbooksDeposit } from "../handlers/create-quickbooks-deposit.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_deposit";
const toolDescription =
  "Create a bank deposit in QuickBooks Online. Each line either deposits an existing transaction held in Undeposited Funds (txn_id + txn_type) or posts an amount straight to an account (account_ref). Amounts are not sign-checked, so QuickBooks decides whether a negative line (e.g. processor fees) is valid. Pass request_id to make retries idempotent.";

// The transaction types Intuit's Deposit reference allows in Line.LinkedTxn.
const linkedTxnTypes = ["SalesReceipt", "RefundReceipt", "JournalEntry", "Payment", "Transfer"] as const;

const lineItemSchema = z
  .object({
    amount: z.number().describe("Line amount"),
    txn_id: z.string().min(1).optional().describe("Linked line: ID of the transaction to deposit"),
    txn_type: z.enum(linkedTxnTypes).optional().describe("Linked line: type of the transaction to deposit"),
    txn_line_id: z
      .string()
      .min(1)
      .optional()
      .describe('Linked line: line of the linked transaction to deposit. Defaults to "0", the whole transaction'),
    account_ref: z.string().optional().describe("Detail line: account ID the amount posts to"),
    entity_ref: z
      .object({
        type: z.string().min(1).describe("Customer, Vendor or Employee"),
        value: z.string().min(1).describe("Customer, vendor or employee ID"),
      })
      .optional()
      .describe("Detail line: who the money was received from"),
    description: z.string().optional(),
  })
  .superRefine((l, ctx) => {
    // A line either deposits an existing transaction or posts to an account.
    // Mixing the two would silently drop half of it, so reject it here.
    const linked = l.txn_id !== undefined || l.txn_type !== undefined || l.txn_line_id !== undefined;
    if (!linked) return;
    if (l.txn_id === undefined || l.txn_type === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A linked line needs both txn_id and txn_type",
        path: [l.txn_id === undefined ? "txn_id" : "txn_type"],
      });
    }
    if (l.account_ref !== undefined || l.entity_ref !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A linked line cannot also carry account_ref or entity_ref; put those on a separate line",
        path: [l.account_ref !== undefined ? "account_ref" : "entity_ref"],
      });
    }
  });

const toolSchema = z.object({
  deposit_to_account_ref: z.string().min(1).describe("Bank account ID to deposit to"),
  line_items: z.array(lineItemSchema).min(1).describe("Deposit line items"),
  txn_date: z.string().optional().describe("Transaction date (YYYY-MM-DD)"),
  private_note: z.string().optional().describe("Private note"),
  cash_back: z
    .object({
      account_ref: z.string().min(1).describe("Account ID the cash back is recorded to"),
      amount: z.number().describe("Cash back amount, subtracted from the deposit total"),
      memo: z.string().optional().describe("Cash back memo"),
    })
    .optional()
    .describe("Cash taken back out of the deposit (CashBack)"),
  request_id: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Idempotency key, sent as QuickBooks' requestid query parameter: replaying a create with the same request_id returns the original deposit instead of creating a duplicate. Max 50 characters, and it must be unique across all requests to the company"
    ),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksDeposit(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Deposit created:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const CreateDepositTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
