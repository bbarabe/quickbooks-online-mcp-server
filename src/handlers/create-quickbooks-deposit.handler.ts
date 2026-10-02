import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface CreateDepositInput {
  deposit_to_account_ref: string;
  line_items: Array<{
    amount: number;
    // Linked line: deposits a transaction held in Undeposited Funds.
    txn_id?: string;
    txn_type?: string;
    txn_line_id?: string;
    // Detail line: posts the amount straight to an account.
    account_ref?: string;
    entity_ref?: { type: string; value: string };
    description?: string;
  }>;
  txn_date?: string;
  private_note?: string;
  cash_back?: { account_ref: string; amount: number; memo?: string };
  request_id?: string;
}

export async function createQuickbooksDeposit(data: CreateDepositInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    const payload: any = {
      DepositToAccountRef: { value: data.deposit_to_account_ref },
      Line: data.line_items.map((l, idx) =>
        l.txn_id
          ? {
              Id: `${idx + 1}`,
              Amount: l.amount,
              Description: l.description,
              // TxnLineId "0" deposits the linked transaction as a whole.
              LinkedTxn: [{ TxnId: l.txn_id, TxnType: l.txn_type, TxnLineId: l.txn_line_id ?? "0" }],
            }
          : {
              Id: `${idx + 1}`,
              Amount: l.amount,
              Description: l.description,
              DetailType: "DepositLineDetail",
              DepositLineDetail: {
                AccountRef: l.account_ref ? { value: l.account_ref } : undefined,
                // QBO's actual Deposit.Line[].DepositLineDetail.Entity shape is
                // flat ({value, type}), confirmed against a live GET response —
                // not the nested {Type, EntityRef} shape this used to send.
                Entity: l.entity_ref ? { value: l.entity_ref.value, type: l.entity_ref.type } : undefined,
              },
            }
      ),
    };

    if (data.txn_date) payload.TxnDate = data.txn_date;
    if (data.private_note) payload.PrivateNote = data.private_note;
    if (data.cash_back) {
      payload.CashBack = {
        AccountRef: { value: data.cash_back.account_ref },
        Amount: data.cash_back.amount,
        Memo: data.cash_back.memo,
      };
    }
    // node-quickbooks moves requestId off the body and onto the requestid query
    // parameter, which is the key QuickBooks de-duplicates replayed creates on.
    if (data.request_id) payload.requestId = data.request_id;

    return new Promise((resolve) => {
      (quickbooks as any).createDeposit(payload, (err: any, created: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: created, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

