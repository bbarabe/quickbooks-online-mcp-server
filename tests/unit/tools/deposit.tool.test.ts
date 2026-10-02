import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// The tool module imports its handler, which imports the quickbooks-client.
// Mock the client so importing the tool doesn't spin up real auth/config.
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { CreateDepositTool } = await import('../../../src/tools/create-deposit.tool');

const parse = (line_items: any[], extra: Record<string, any> = {}) =>
  CreateDepositTool.schema.safeParse({ deposit_to_account_ref: '35', line_items, ...extra });

describe('create_deposit schema', () => {
  it('accepts linked lines for every transaction type a deposit can link', () => {
    for (const txn_type of ['SalesReceipt', 'RefundReceipt', 'JournalEntry', 'Payment', 'Transfer']) {
      expect(parse([{ txn_id: '1', txn_type, amount: 10 }]).success).toBe(true);
    }
  });

  it('rejects a linked line of a type a deposit cannot link', () => {
    expect(parse([{ txn_id: '1', txn_type: 'Invoice', amount: 10 }]).success).toBe(false);
  });

  it('accepts detail lines with negative amounts, cash back and request_id', () => {
    const result = parse(
      [
        { txn_id: '501', txn_type: 'SalesReceipt', amount: 59.31 },
        { account_ref: '61', amount: -1.86, description: 'Fees', entity_ref: { type: 'Vendor', value: '12' } },
      ],
      { cash_back: { account_ref: '40', amount: 5 }, request_id: 'sq-payout-1' }
    );
    expect(result.success).toBe(true);
  });

  it('still accepts the original detail-only line shape', () => {
    expect(parse([{ amount: 1000, account_ref: '79', description: 'Payment' }]).success).toBe(true);
  });

  it('rejects a linked line missing txn_type', () => {
    const result = parse([{ txn_id: '501', amount: 10 }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('A linked line needs both txn_id and txn_type');
      expect(result.error.issues[0].path).toEqual(['line_items', 0, 'txn_type']);
    }
  });

  it('rejects a linked line missing txn_id', () => {
    const result = parse([{ txn_type: 'SalesReceipt', txn_line_id: '0', amount: 10 }]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(['line_items', 0, 'txn_id']);
  });

  it('rejects a line that is both linked and posted to an account', () => {
    // Either half would be silently dropped, so the mix must not get through.
    const withAccount = parse([{ txn_id: '501', txn_type: 'SalesReceipt', account_ref: '61', amount: 10 }]);
    expect(withAccount.success).toBe(false);
    if (!withAccount.success) {
      expect(withAccount.error.issues[0].path).toEqual(['line_items', 0, 'account_ref']);
    }

    const withEntity = parse([
      { txn_id: '501', txn_type: 'SalesReceipt', entity_ref: { type: 'Customer', value: '1' }, amount: 10 },
    ]);
    expect(withEntity.success).toBe(false);
    if (!withEntity.success) {
      expect(withEntity.error.issues[0].path).toEqual(['line_items', 0, 'entity_ref']);
    }
  });

  it('rejects a request_id longer than the 50 characters QuickBooks allows', () => {
    expect(parse([{ amount: 1, account_ref: '1' }], { request_id: 'x'.repeat(51) }).success).toBe(false);
  });
});

describe('create_deposit tool handler', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('returns the full deposit QuickBooks sent back', async () => {
    const created = {
      Id: '9',
      SyncToken: '0',
      TotalAmt: 37.95,
      Line: [{ Id: '1', Amount: 59.31, LinkedTxn: [{ TxnId: '501', TxnType: 'SalesReceipt', TxnLineId: '0' }] }],
    };
    mockQuickBooksInstance.createDeposit.mockImplementation((_payload: any, cb: any) => cb(null, created));

    const result: any = await CreateDepositTool.handler(
      { params: { deposit_to_account_ref: '35', line_items: [{ txn_id: '501', txn_type: 'SalesReceipt', amount: 59.31 }] } } as any,
      {} as any
    );

    expect(CreateDepositTool.name).toBe('create_deposit');
    expect(result.content[0].text).toBe('Deposit created:');
    expect(JSON.parse(result.content[1].text)).toEqual(created);
  });

  it('reports QuickBooks errors', async () => {
    mockQuickBooksInstance.createDeposit.mockImplementation((_payload: any, cb: any) =>
      cb(new Error('Transaction already deposited'), null)
    );

    const result: any = await CreateDepositTool.handler(
      { params: { deposit_to_account_ref: '35', line_items: [{ amount: 1, account_ref: '1' }] } } as any,
      {} as any
    );

    expect(result.content).toEqual([{ type: 'text', text: 'Error: Error: Transaction already deposited' }]);
  });
});
