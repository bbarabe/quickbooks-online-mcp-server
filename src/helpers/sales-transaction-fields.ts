import { z } from "zod";

// Fields shared by create_sales_receipt and create_refund_receipt. Both QBO
// entities carry the same addresses, transaction tax detail, classification
// and idempotency fields, so the schemas and their payload mapping live here
// once instead of drifting apart in two tool/handler pairs.

// A factory rather than one shared instance: the MCP SDK renders a reused zod
// schema as a JSON-Schema $ref, which not every MCP client resolves.
export const physicalAddressSchema = () =>
  z.object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    country_sub_division_code: z.string().optional().describe("State or province code, e.g. 'WA'"),
    postal_code: z.string().optional(),
    country: z.string().optional(),
  });

export const salesLineItemSchema = z
  .object({
    item_ref: z.string().min(1).describe("Item ID"),
    qty: z.number().optional().describe("Quantity"),
    unit_price: z.number().optional().describe("Unit price"),
    amount: z
      .number()
      .optional()
      .describe(
        "Line amount, sent as Line.Amount. Without unit_price no UnitPrice is sent, so QuickBooks keeps the amount exactly as given instead of deriving it from qty x unit_price"
      ),
    description: z.string().optional().describe("Line description"),
    tax_code_ref: z
      .string()
      .min(1)
      .optional()
      .describe("Tax code for this line: a TaxCode Id for non-US companies (use search_tax_codes), or 'TAX'/'NON' for US companies"),
    class_ref: z.string().min(1).optional().describe("Class ID for this line (use search_classes)"),
  })
  .superRefine((l, ctx) => {
    // Without an explicit amount, Line.Amount is computed as qty x unit_price.
    if (l.amount === undefined && (l.qty === undefined || l.unit_price === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each line needs amount, or both qty and unit_price",
        path: ["amount"],
      });
    }
  });

export const salesTransactionFields = {
  bill_addr: physicalAddressSchema().optional().describe("Billing address (BillAddr)"),
  ship_addr: physicalAddressSchema().optional().describe("Shipping address (ShipAddr)"),
  ship_from_addr: physicalAddressSchema().optional().describe("Ship-from address (ShipFromAddr)"),
  txn_tax_detail: z
    .object({
      txn_tax_code_ref: z.string().min(1).optional().describe("Transaction tax code ID (TxnTaxDetail.TxnTaxCodeRef)"),
      total_tax: z
        .number()
        .optional()
        .describe("Total tax (TxnTaxDetail.TotalTax), e.g. to override the tax QuickBooks calculates"),
    })
    .optional()
    .describe("Transaction-level sales tax (TxnTaxDetail)"),
  department_ref: z.string().min(1).optional().describe("Department (location) ID (use search_departments)"),
  class_ref: z.string().min(1).optional().describe("Class ID for the whole transaction (use search_classes)"),
  payment_ref_num: z
    .string()
    .optional()
    .describe("Payment reference number, e.g. a check or card transaction number (PaymentRefNum)"),
  request_id: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Idempotency key, sent as QuickBooks' requestid query parameter: replaying a create with the same request_id returns the original transaction instead of creating a duplicate. Max 50 characters, and it must be unique across all requests to the company"
    ),
};

export interface PhysicalAddressInput {
  line1?: string;
  line2?: string;
  city?: string;
  country_sub_division_code?: string;
  postal_code?: string;
  country?: string;
}

export interface SalesLineItemInput {
  item_ref: string;
  qty?: number;
  unit_price?: number;
  amount?: number;
  description?: string;
  tax_code_ref?: string; // TaxCode id (non-US) or TAX/NON (US)
  class_ref?: string;
}

export interface SalesTransactionFieldsInput {
  bill_addr?: PhysicalAddressInput;
  ship_addr?: PhysicalAddressInput;
  ship_from_addr?: PhysicalAddressInput;
  txn_tax_detail?: {
    txn_tax_code_ref?: string;
    total_tax?: number;
  };
  department_ref?: string;
  class_ref?: string;
  payment_ref_num?: string;
  request_id?: string;
}

export function toPhysicalAddress(addr: PhysicalAddressInput) {
  return {
    Line1: addr.line1,
    Line2: addr.line2,
    City: addr.city,
    CountrySubDivisionCode: addr.country_sub_division_code,
    PostalCode: addr.postal_code,
    Country: addr.country,
  };
}

export function toSalesItemLine(l: SalesLineItemInput, idx: number) {
  return {
    Id: `${idx + 1}`,
    LineNum: idx + 1,
    Description: l.description || undefined,
    // An explicit amount is sent as given. UnitPrice is only sent when the
    // caller supplied one, so QuickBooks never re-derives (and re-rounds) an
    // amount from Qty x UnitPrice behind the caller's back.
    Amount: l.amount ?? l.qty! * l.unit_price!,
    DetailType: "SalesItemLineDetail",
    SalesItemLineDetail: {
      ItemRef: { value: l.item_ref },
      Qty: l.qty,
      UnitPrice: l.unit_price,
      TaxCodeRef: l.tax_code_ref ? { value: l.tax_code_ref } : undefined,
      ClassRef: l.class_ref ? { value: l.class_ref } : undefined,
    },
  };
}

export function applySalesTransactionFields(payload: Record<string, any>, data: SalesTransactionFieldsInput): void {
  if (data.bill_addr) payload.BillAddr = toPhysicalAddress(data.bill_addr);
  if (data.ship_addr) payload.ShipAddr = toPhysicalAddress(data.ship_addr);
  if (data.ship_from_addr) payload.ShipFromAddr = toPhysicalAddress(data.ship_from_addr);
  if (data.txn_tax_detail) {
    const { txn_tax_code_ref, total_tax } = data.txn_tax_detail;
    payload.TxnTaxDetail = {
      TxnTaxCodeRef: txn_tax_code_ref ? { value: txn_tax_code_ref } : undefined,
      TotalTax: total_tax,
    };
  }
  if (data.department_ref) payload.DepartmentRef = { value: data.department_ref };
  if (data.class_ref) payload.ClassRef = { value: data.class_ref };
  if (data.payment_ref_num) payload.PaymentRefNum = data.payment_ref_num;
  // node-quickbooks moves requestId off the body and onto the requestid query
  // parameter, which is the key QuickBooks de-duplicates replayed creates on.
  if (data.request_id) payload.requestId = data.request_id;
}
