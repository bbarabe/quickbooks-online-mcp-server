import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// The tool modules import their handlers, which import the quickbooks-client.
// Mock the client so importing the tool doesn't spin up real auth/config.
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { CreateSalesReceiptTool } = await import('../../../src/tools/create-sales-receipt.tool');
const { CreateRefundReceiptTool } = await import('../../../src/tools/create-refund-receipt.tool');
const { knownParamKeys } = await import('../../../src/helpers/register-tool');

// A venue sale: one taxable line at a fixed amount, shipped to the venue.
const venueSale = {
  customer_ref: '1',
  line_items: [{ item_ref: '1', amount: 54.35, tax_code_ref: 'TAX' }],
  ship_addr: { line1: '15321 Main St NE', city: 'Duvall', country_sub_division_code: 'WA', postal_code: '98019' },
  request_id: 'sq-payment-1',
};

// What QuickBooks sends back: the full entity, including the tax it computed.
const createdEntity = {
  Id: '501',
  SyncToken: '0',
  Line: [{ Id: '1', Amount: 54.35, DetailType: 'SalesItemLineDetail' }],
  TxnTaxDetail: {
    TxnTaxCodeRef: { value: '3' },
    TotalTax: 4.96,
    TaxLine: [{ Amount: 4.96, DetailType: 'TaxLineDetail' }],
  },
};

describe.each([
  ['create_sales_receipt', CreateSalesReceiptTool, 'createSalesReceipt', 'sales receipt'],
  ['create_refund_receipt', CreateRefundReceiptTool, 'createRefundReceipt', 'refund receipt'],
] as const)('%s tool', (toolName, tool, apiMethod, label) => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('is registered under its tool name', () => {
    expect(tool.name).toBe(toolName);
  });

  it('accepts amount-only lines with addresses, tax detail and request_id', () => {
    const result = tool.schema.safeParse({
      ...venueSale,
      ship_from_addr: venueSale.ship_addr,
      txn_tax_detail: { txn_tax_code_ref: '3', total_tax: 4.97 },
      department_ref: '2',
      class_ref: '4',
      payment_ref_num: 'R-1001',
    });
    expect(result.success).toBe(true);
  });

  it('declares every new parameter, so none is reported as unsupported', () => {
    // RegisterTool strips and warns about top-level keys a schema doesn't
    // declare; each new field must be declared to reach QuickBooks at all.
    const known = knownParamKeys(tool.schema);
    for (const key of [
      'bill_addr',
      'ship_addr',
      'ship_from_addr',
      'txn_tax_detail',
      'department_ref',
      'class_ref',
      'payment_ref_num',
      'request_id',
    ]) {
      expect(known?.has(key)).toBe(true);
    }
  });

  it('rejects a line that has neither amount nor qty + unit_price', () => {
    const result = tool.schema.safeParse({ ...venueSale, line_items: [{ item_ref: '1', qty: 1 }] });
    expect(result.success).toBe(false);
  });

  it('returns the full entity QuickBooks sent back, including computed tax lines', async () => {
    (mockQuickBooksInstance as any)[apiMethod].mockImplementation((_payload: any, cb: any) => cb(null, createdEntity));

    const result: any = await tool.handler({ params: venueSale } as any, {} as any);

    expect(result.content[0].text).toContain('created successfully');
    expect(JSON.parse(result.content[1].text)).toEqual(createdEntity);
  });

  it('reports QuickBooks errors', async () => {
    (mockQuickBooksInstance as any)[apiMethod].mockImplementation((_payload: any, cb: any) =>
      cb(new Error('Invalid tax code'), null)
    );

    const result: any = await tool.handler({ params: venueSale } as any, {} as any);

    expect(result.content).toEqual([
      { type: 'text', text: `Error creating ${label}: Error: Invalid tax code` },
    ]);
  });
});
