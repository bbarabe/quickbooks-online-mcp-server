import { describe, it, expect } from '@jest/globals';
import {
  applySalesTransactionFields,
  salesLineItemSchema,
  salesTransactionFields,
  toPhysicalAddress,
  toSalesItemLine,
} from '../../../src/helpers/sales-transaction-fields';

describe('salesLineItemSchema', () => {
  it('accepts a line with only an amount', () => {
    const result = salesLineItemSchema.safeParse({ item_ref: '1', amount: 54.35 });
    expect(result.success).toBe(true);
  });

  it('accepts a line with qty and unit_price (the original shape)', () => {
    const result = salesLineItemSchema.safeParse({ item_ref: '1', qty: 2, unit_price: 10 });
    expect(result.success).toBe(true);
  });

  it('passes negative amounts and unit prices through for QuickBooks to judge', () => {
    // A gift-card redemption or discount is booked as a negative line; whether
    // that is valid is QuickBooks' call, so the schema must not pre-empt it.
    expect(salesLineItemSchema.safeParse({ item_ref: '48', amount: -10 }).success).toBe(true);
    expect(salesLineItemSchema.safeParse({ item_ref: '48', qty: 1, unit_price: -10 }).success).toBe(true);
  });

  it('rejects a line with neither amount nor qty + unit_price', () => {
    const result = salesLineItemSchema.safeParse({ item_ref: '1', qty: 2 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Each line needs amount, or both qty and unit_price');
      expect(result.error.issues[0].path).toEqual(['amount']);
    }
  });

  it('rejects a line with only a unit_price', () => {
    expect(salesLineItemSchema.safeParse({ item_ref: '1', unit_price: 5 }).success).toBe(false);
  });
});

describe('salesTransactionFields.request_id', () => {
  it('accepts a key up to the 50-character QuickBooks limit', () => {
    expect(salesTransactionFields.request_id.safeParse('x'.repeat(50)).success).toBe(true);
  });

  it('rejects a key longer than 50 characters', () => {
    // QuickBooks caps requestid at 50 characters; failing here gives a clear
    // message instead of an opaque API error.
    expect(salesTransactionFields.request_id.safeParse('x'.repeat(51)).success).toBe(false);
  });
});

describe('toPhysicalAddress', () => {
  it('maps every snake_case field to its QuickBooks PhysicalAddress field', () => {
    expect(
      toPhysicalAddress({
        line1: '15321 Main St NE',
        line2: 'Suite 1',
        city: 'Duvall',
        country_sub_division_code: 'WA',
        postal_code: '98019',
        country: 'USA',
      })
    ).toEqual({
      Line1: '15321 Main St NE',
      Line2: 'Suite 1',
      City: 'Duvall',
      CountrySubDivisionCode: 'WA',
      PostalCode: '98019',
      Country: 'USA',
    });
  });
});

describe('toSalesItemLine', () => {
  it('sends an explicit amount as-is, with no UnitPrice or Qty', () => {
    const line = toSalesItemLine({ item_ref: '1', amount: 54.35 }, 0);

    expect(line.Amount).toBe(54.35);
    // Serialize the way the request body is sent: undefined fields disappear.
    expect(JSON.parse(JSON.stringify(line)).SalesItemLineDetail).toEqual({ ItemRef: { value: '1' } });
  });

  it('computes Amount from qty x unit_price when no amount is given', () => {
    const line = toSalesItemLine({ item_ref: '1', qty: 3, unit_price: 5 }, 1);

    expect(line).toEqual({
      Id: '2',
      LineNum: 2,
      Description: undefined,
      Amount: 15,
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: '1' },
        Qty: 3,
        UnitPrice: 5,
        TaxCodeRef: undefined,
        ClassRef: undefined,
      },
    });
  });

  it('maps description, tax code and class onto the line', () => {
    const line = toSalesItemLine(
      { item_ref: '1', amount: 10, description: 'Print', tax_code_ref: 'TAX', class_ref: 'c-1' },
      0
    );

    expect(line.Description).toBe('Print');
    expect(line.SalesItemLineDetail.TaxCodeRef).toEqual({ value: 'TAX' });
    expect(line.SalesItemLineDetail.ClassRef).toEqual({ value: 'c-1' });
  });
});

describe('applySalesTransactionFields', () => {
  it('leaves the payload untouched when no shared field is given', () => {
    const payload: Record<string, any> = { CustomerRef: { value: '1' } };

    applySalesTransactionFields(payload, {});

    expect(payload).toEqual({ CustomerRef: { value: '1' } });
  });

  it('maps every shared field onto the payload', () => {
    const payload: Record<string, any> = {};

    applySalesTransactionFields(payload, {
      bill_addr: { city: 'Seattle' },
      ship_addr: { city: 'Duvall' },
      ship_from_addr: { city: 'Redmond' },
      txn_tax_detail: { txn_tax_code_ref: '3', total_tax: 4.96 },
      department_ref: 'dept-1',
      class_ref: 'class-1',
      payment_ref_num: 'sq-123',
      request_id: 'square-payment-1',
    });

    expect(payload.BillAddr.City).toBe('Seattle');
    expect(payload.ShipAddr.City).toBe('Duvall');
    expect(payload.ShipFromAddr.City).toBe('Redmond');
    expect(payload.TxnTaxDetail).toEqual({ TxnTaxCodeRef: { value: '3' }, TotalTax: 4.96 });
    expect(payload.DepartmentRef).toEqual({ value: 'dept-1' });
    expect(payload.ClassRef).toEqual({ value: 'class-1' });
    expect(payload.PaymentRefNum).toBe('sq-123');
    // node-quickbooks turns requestId into the requestid query parameter.
    expect(payload.requestId).toBe('square-payment-1');
  });

  it('sends TotalTax without a TxnTaxCodeRef when only total_tax is given', () => {
    const payload: Record<string, any> = {};

    applySalesTransactionFields(payload, { txn_tax_detail: { total_tax: 0 } });

    expect(payload.TxnTaxDetail).toEqual({ TxnTaxCodeRef: undefined, TotalTax: 0 });
  });
});
