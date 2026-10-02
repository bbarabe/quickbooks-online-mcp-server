import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import {
  applySalesTransactionFields,
  SalesLineItemInput,
  SalesTransactionFieldsInput,
  toSalesItemLine,
} from "../helpers/sales-transaction-fields.js";

export interface CreateRefundReceiptInput extends SalesTransactionFieldsInput {
  customer_ref: string;
  line_items: SalesLineItemInput[];
  payment_method_ref?: string;
  deposit_to_account_ref?: string;
  txn_date?: string;
  doc_number?: string;
  private_note?: string;
  global_tax_calculation?: "TaxExcluded" | "TaxInclusive" | "NotApplicable";
}

export async function createQuickbooksRefundReceipt(data: CreateRefundReceiptInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    const refundReceiptPayload: any = {
      CustomerRef: { value: data.customer_ref },
      Line: data.line_items.map(toSalesItemLine),
    };

    if (data.payment_method_ref) {
      refundReceiptPayload.PaymentMethodRef = { value: data.payment_method_ref };
    }
    if (data.deposit_to_account_ref) {
      refundReceiptPayload.DepositToAccountRef = { value: data.deposit_to_account_ref };
    }
    if (data.txn_date) {
      refundReceiptPayload.TxnDate = data.txn_date;
    }
    if (data.doc_number) {
      refundReceiptPayload.DocNumber = data.doc_number;
    }
    if (data.private_note) {
      refundReceiptPayload.PrivateNote = data.private_note;
    }
    if (data.global_tax_calculation) {
      refundReceiptPayload.GlobalTaxCalculation = data.global_tax_calculation;
    }
    applySalesTransactionFields(refundReceiptPayload, data);

    return new Promise((resolve) => {
      (quickbooks as any).createRefundReceipt(refundReceiptPayload, (err: any, created: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          resolve({ result: created, isError: false, error: null });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

