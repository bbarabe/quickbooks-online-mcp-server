import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateRefundReceiptInput {
  id: string;
  sync_token: string;
  customer_ref?: string;
  private_note?: string;
  doc_number?: string;
  patch?: Record<string, any>; // Extra fields in QuickBooks' PascalCase shape
}

export async function updateQuickbooksRefundReceipt(data: UpdateRefundReceiptInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    // patch carries any other fields in QuickBooks' own shape. Id, SyncToken
    // and sparse are set after it so a patch can never retarget the update or
    // turn it into a full update that blanks every field it leaves out.
    const payload: any = {
      ...data.patch,
      Id: data.id,
      SyncToken: data.sync_token,
      sparse: true,
    };

    if (data.customer_ref) {
      payload.CustomerRef = { value: data.customer_ref };
    }
    if (data.private_note) {
      payload.PrivateNote = data.private_note;
    }
    if (data.doc_number) {
      payload.DocNumber = data.doc_number;
    }

    return new Promise((resolve) => {
      (quickbooks as any).updateRefundReceipt(payload, (err: any, updated: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          resolve({ result: updated, isError: false, error: null });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

