import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

// Dynamic imports after mock setup
const { createQuickbooksSalesReceipt } = await import('../../../src/handlers/create-quickbooks-sales-receipt.handler');
const { getQuickbooksSalesReceipt } = await import('../../../src/handlers/get-quickbooks-sales-receipt.handler');
const { updateQuickbooksSalesReceipt } = await import('../../../src/handlers/update-quickbooks-sales-receipt.handler');
const { deleteQuickbooksSalesReceipt } = await import('../../../src/handlers/delete-quickbooks-sales-receipt.handler');
const { searchQuickbooksSalesReceipts } = await import('../../../src/handlers/search-quickbooks-sales-receipts.handler');

describe('SalesReceipt Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('createQuickbooksSalesReceipt', () => {
    it('should create a sales receipt successfully', async () => {
      const mockReceipt = { Id: '123', TotalAmt: 250 };
      mockQuickBooksInstance.createSalesReceipt.mockImplementation((payload: any, cb: any) => cb(null, mockReceipt));

      const result = await createQuickbooksSalesReceipt({
        customer_ref: 'cust-1',
        line_items: [{ item_ref: 'item-1', qty: 1, unit_price: 250 }]
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockReceipt);
      const payload = (mockQuickBooksInstance.createSalesReceipt.mock.calls[0] as any)[0];
      expect(payload).not.toHaveProperty('GlobalTaxCalculation');
    });

    it('should pass per-line TaxCodeRef and GlobalTaxCalculation to QuickBooks', async () => {
      mockQuickBooksInstance.createSalesReceipt.mockImplementation((payload: any, cb: any) => cb(null, { Id: '123' }));

      const result = await createQuickbooksSalesReceipt({
        customer_ref: 'cust-1',
        line_items: [
          { item_ref: 'item-1', qty: 2, unit_price: 50, tax_code_ref: '14' },
          { item_ref: 'item-2', qty: 1, unit_price: 75 }
        ],
        global_tax_calculation: 'TaxExcluded'
      });

      expect(result.isError).toBe(false);
      const payload = (mockQuickBooksInstance.createSalesReceipt.mock.calls[0] as any)[0];
      expect(payload.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: '14' });
      expect(payload.Line[1].SalesItemLineDetail.TaxCodeRef).toBeUndefined();
      expect(payload.GlobalTaxCalculation).toBe('TaxExcluded');
    });

    it('should pass per-line ClassRef to QuickBooks when class_ref is given', async () => {
      mockQuickBooksInstance.createSalesReceipt.mockImplementation((payload: any, cb: any) => cb(null, { Id: '123' }));

      const result = await createQuickbooksSalesReceipt({
        customer_ref: 'cust-1',
        line_items: [
          { item_ref: 'item-1', qty: 1, unit_price: 850, class_ref: 'class-1' },
          { item_ref: 'item-2', qty: 1, unit_price: 150, class_ref: 'class-2' },
          { item_ref: 'item-3', qty: 1, unit_price: 10 }
        ]
      });

      expect(result.isError).toBe(false);
      const payload = (mockQuickBooksInstance.createSalesReceipt.mock.calls[0] as any)[0];
      expect(payload.Line[0].SalesItemLineDetail.ClassRef).toEqual({ value: 'class-1' });
      expect(payload.Line[1].SalesItemLineDetail.ClassRef).toEqual({ value: 'class-2' });
      // Lines without class_ref must not send a ClassRef, so QuickBooks leaves the line unclassed
      expect(payload.Line[2].SalesItemLineDetail.ClassRef).toBeUndefined();
    });

    it('should send addresses, tax detail, classification and request_id to QuickBooks', async () => {
      mockQuickBooksInstance.createSalesReceipt.mockImplementation((payload: any, cb: any) => cb(null, { Id: '123' }));
      const venue = {
        line1: '15321 Main St NE',
        city: 'Duvall',
        country_sub_division_code: 'WA',
        postal_code: '98019',
      };

      const result = await createQuickbooksSalesReceipt({
        customer_ref: 'cust-1',
        line_items: [
          { item_ref: 'item-1', amount: 54.35, tax_code_ref: 'TAX', class_ref: 'class-1' },
          { item_ref: '48', amount: -10 },
        ],
        ship_addr: venue,
        ship_from_addr: venue,
        bill_addr: { city: 'Seattle' },
        txn_tax_detail: { txn_tax_code_ref: '3', total_tax: 4.97 },
        department_ref: 'dept-1',
        class_ref: 'class-2',
        payment_ref_num: 'R-1001',
        request_id: 'sq-payment-1',
      });

      expect(result.isError).toBe(false);
      const payload = (mockQuickBooksInstance.createSalesReceipt.mock.calls[0] as any)[0];
      // An explicit amount goes out as Line.Amount with no UnitPrice, so
      // QuickBooks can't re-derive (and re-round) it from Qty x UnitPrice.
      expect(payload.Line[0].Amount).toBe(54.35);
      expect(payload.Line[0].SalesItemLineDetail.UnitPrice).toBeUndefined();
      expect(payload.Line[0].SalesItemLineDetail.ClassRef).toEqual({ value: 'class-1' });
      // Negative lines are passed through for QuickBooks to accept or reject.
      expect(payload.Line[1].Amount).toBe(-10);
      expect(payload.Line[1].SalesItemLineDetail.ClassRef).toBeUndefined();
      expect(payload.ShipAddr).toEqual({
        Line1: '15321 Main St NE',
        City: 'Duvall',
        CountrySubDivisionCode: 'WA',
        PostalCode: '98019',
      });
      expect(payload.ShipFromAddr).toEqual(payload.ShipAddr);
      expect(payload.BillAddr).toEqual({ City: 'Seattle' });
      expect(payload.TxnTaxDetail).toEqual({ TxnTaxCodeRef: { value: '3' }, TotalTax: 4.97 });
      expect(payload.DepartmentRef).toEqual({ value: 'dept-1' });
      expect(payload.ClassRef).toEqual({ value: 'class-2' });
      expect(payload.PaymentRefNum).toBe('R-1001');
      expect(payload.requestId).toBe('sq-payment-1');
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.createSalesReceipt.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Validation error'), null)
      );

      const result = await createQuickbooksSalesReceipt({ customer_ref: 'cust-1', line_items: [] });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksSalesReceipt({ customer_ref: 'cust-1', line_items: [] });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should create with all optional fields', async () => {
      const mockReceipt = { Id: '123', TotalAmt: 500 };
      mockQuickBooksInstance.createSalesReceipt.mockImplementation((payload: any, cb: any) => cb(null, mockReceipt));

      const result = await createQuickbooksSalesReceipt({
        customer_ref: 'cust-1',
        line_items: [
          { item_ref: 'item-1', qty: 2, unit_price: 250, description: 'Test item' }
        ],
        payment_method_ref: 'pm-1',
        deposit_to_account_ref: 'acc-1',
        txn_date: '2024-01-15',
        doc_number: 'SR-001',
        private_note: 'Test sales receipt'
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockReceipt);
    });
  });

  describe('getQuickbooksSalesReceipt', () => {
    it('should get a sales receipt by ID', async () => {
      const mockReceipt = { Id: '123', TotalAmt: 250 };
      mockQuickBooksInstance.getSalesReceipt.mockImplementation((_id: any, cb: any) => cb(null, mockReceipt));

      const result = await getQuickbooksSalesReceipt('123');

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockReceipt);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.getSalesReceipt.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksSalesReceipt('999');

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksSalesReceipt('123');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('updateQuickbooksSalesReceipt', () => {
    it('should update a sales receipt', async () => {
      const mockUpdated = { Id: '123', TotalAmt: 300 };
      mockQuickBooksInstance.updateSalesReceipt.mockImplementation((payload: any, cb: any) => cb(null, mockUpdated));

      const result = await updateQuickbooksSalesReceipt({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should update with all optional fields', async () => {
      const mockUpdated = { Id: '123' };
      mockQuickBooksInstance.updateSalesReceipt.mockImplementation((payload: any, cb: any) => cb(null, mockUpdated));

      const result = await updateQuickbooksSalesReceipt({
        id: '123',
        sync_token: '0',
        customer_ref: 'cust-1',
        private_note: 'Updated note',
        doc_number: 'SR-002'
      });

      expect(result.isError).toBe(false);
    });

    it('should send patch fields as a sparse update that cannot override Id, SyncToken or sparse', async () => {
      mockQuickBooksInstance.updateSalesReceipt.mockImplementation((payload: any, cb: any) => cb(null, { Id: '123' }));
      const lines = [{ Id: '1', Amount: 54.35, DetailType: 'SalesItemLineDetail', SalesItemLineDetail: { ItemRef: { value: '1' } } }];

      const result = await updateQuickbooksSalesReceipt({
        id: '123',
        sync_token: '2',
        private_note: 'named wins',
        patch: {
          Line: lines,
          ShipAddr: { City: 'Duvall' },
          PrivateNote: 'from patch',
          Id: '999',
          SyncToken: '0',
          sparse: false,
        },
      });

      expect(result.isError).toBe(false);
      const payload = (mockQuickBooksInstance.updateSalesReceipt.mock.calls[0] as any)[0];
      expect(payload.Line).toEqual(lines);
      expect(payload.ShipAddr).toEqual({ City: 'Duvall' });
      // Named parameters override the same field in patch.
      expect(payload.PrivateNote).toBe('named wins');
      // A patch must never retarget the update, skip optimistic locking, or
      // turn it into a full update that blanks every field it leaves out.
      expect(payload.Id).toBe('123');
      expect(payload.SyncToken).toBe('2');
      expect(payload.sparse).toBe(true);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.updateSalesReceipt.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksSalesReceipt({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksSalesReceipt({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('deleteQuickbooksSalesReceipt', () => {
    it('should void a sales receipt', async () => {
      mockQuickBooksInstance.deleteSalesReceipt.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await deleteQuickbooksSalesReceipt({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.deleteSalesReceipt.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksSalesReceipt({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksSalesReceipt({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('searchQuickbooksSalesReceipts', () => {
    it('should search sales receipts', async () => {
      const mockReceipts = [{ Id: '1' }];
      mockQuickBooksInstance.findSalesReceipts.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { SalesReceipt: mockReceipts } })
      );

      const result = await searchQuickbooksSalesReceipts({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockReceipts);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.findSalesReceipts.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksSalesReceipts({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksSalesReceipts({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should search with all filter options', async () => {
      mockQuickBooksInstance.findSalesReceipts.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { SalesReceipt: [] } })
      );

      const result = await searchQuickbooksSalesReceipts({
        customer_ref: 'cust-1',
        txn_date_from: '2024-01-01',
        txn_date_to: '2024-12-31',
        limit: 50
      });

      expect(result.isError).toBe(false);
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findSalesReceipts.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksSalesReceipts({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });
  });
});


