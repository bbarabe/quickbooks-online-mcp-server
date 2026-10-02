import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// The tool modules import their handlers, which import the quickbooks-client.
// Mock the client so importing the tool doesn't spin up real auth/config.
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { UpdateSalesReceiptTool } = await import('../../../src/tools/update-sales-receipt.tool');
const { UpdateRefundReceiptTool } = await import('../../../src/tools/update-refund-receipt.tool');
const { UpdateDepositTool } = await import('../../../src/tools/update-deposit.tool');
const { knownParamKeys } = await import('../../../src/helpers/register-tool');

// What QuickBooks sends back after an update: the full entity, new SyncToken.
const updatedEntity = {
  Id: '42',
  SyncToken: '5',
  Line: [{ Id: '1', Amount: 54.35 }],
  TxnTaxDetail: { TotalTax: 4.96, TaxLine: [{ Amount: 4.96, DetailType: 'TaxLineDetail' }] },
};

describe.each([
  ['update_sales_receipt', UpdateSalesReceiptTool, 'updateSalesReceipt', 'Sales receipt updated successfully:', 'Error updating sales receipt: '],
  ['update_refund_receipt', UpdateRefundReceiptTool, 'updateRefundReceipt', 'Refund receipt updated successfully:', 'Error updating refund receipt: '],
  ['update_deposit', UpdateDepositTool, 'updateDeposit', 'Deposit updated:', 'Error: '],
] as const)('%s tool', (toolName, tool, apiMethod, successText, errorPrefix) => {
  const params = { id: '42', sync_token: '4', patch: { Line: [{ Id: '1', Amount: 54.35 }] } };

  beforeEach(() => {
    resetAllMocks();
    // update_deposit reads the current record before writing.
    mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) => cb(null, { Id: '42', SyncToken: '4' }));
  });

  it('is registered under its tool name', () => {
    expect(tool.name).toBe(toolName);
  });

  it('declares patch, so it is not stripped as an unsupported parameter', () => {
    expect(knownParamKeys(tool.schema)?.has('patch')).toBe(true);
  });

  it('accepts a free-form patch and still works without one', () => {
    expect(tool.schema.safeParse(params).success).toBe(true);
    expect(tool.schema.safeParse({ id: '42', sync_token: '4' }).success).toBe(true);
  });

  it('rejects a patch that is not an object', () => {
    expect(tool.schema.safeParse({ ...params, patch: 'PrivateNote=x' }).success).toBe(false);
  });

  it('returns the full entity QuickBooks sent back', async () => {
    (mockQuickBooksInstance as any)[apiMethod].mockImplementation((_payload: any, cb: any) => cb(null, updatedEntity));

    const result: any = await tool.handler({ params } as any, {} as any);

    expect(result.content[0].text).toBe(successText);
    expect(JSON.parse(result.content[1].text)).toEqual(updatedEntity);
  });

  it('reports QuickBooks errors', async () => {
    (mockQuickBooksInstance as any)[apiMethod].mockImplementation((_payload: any, cb: any) =>
      cb(new Error('Stale object'), null)
    );

    const result: any = await tool.handler({ params } as any, {} as any);

    expect(result.content).toEqual([{ type: 'text', text: `${errorPrefix}Error: Stale object` }]);
  });
});
