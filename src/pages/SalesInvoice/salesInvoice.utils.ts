export const todayInput = () => new Date().toISOString().slice(0, 10);

export const lineKey = (docEntry: number | string, lineNum: number | string) => `${docEntry}-${lineNum}`;

export const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatMoney = (value: number) => `₹${toNumber(value).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export const formatDateDisplay = (value?: string) => {
  if (!value) return "-";
  const dateOnly = value.split("T")[0]?.split(" ")[0] || value;
  const [year, month, day] = dateOnly.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
};

export const normalizeDateInput = (value?: string) => {
  if (!value) return todayInput();
  return value.split("T")[0]?.split(" ")[0] || todayInput();
};

export type SelectedLine = {
  SourceType?: "sales-order" | "items";
  DocEntry: number;
  DocNum: number;
  DocDate?: string;
  DocDueDate?: string;
  SlpCode?: number;
  ShipToCode?: string;
  PayToCode?: string;
  BPL_Id?: number;
  LineNum: number;
  ItemCode: string;
  Dscription: string;
  OpenQty: number;
  Price: number;
  PriceBefDi: number;
  DiscPrcnt: number;
  VatPrcnt: number;
  TaxCode: string;
  WhsCode: string;
  SalesOrderWhsCode?: string;
  OcrCode?: string;
  ShipDate?: string;
  invoiceQty: number;
  BatchNumbers?: Array<{
    BatchNumber?: string;
    SystemSerialNumber?: number;
    Quantity: number;
  }>;
};

export type InvoiceForm = {
  postingDate: string;
  dueDate: string;
  documentDate: string;
  driverName: string;
  vehicleNumber: string;
  billNumber: string;
  billDate: string;
  driverMobile: string;
  discountPercent: number;
  shipTo: string;
  payTo: string;
  shippingType: string;
  ewayBillNo: string;
  lrGrNumber: string;
  shippingPriority: string;
};

export type FreightRow = {
  expenseCode: string;
  expenseName: string;
  lineTotal: number;
  taxCode: string;
};

export type Party = {
  CardCode: string;
  CardName: string;
  State1?: string | null;
  U_Main_Group?: string | null;
  U_Chain?: string | null;
  ListNum?: number | string | null;
  OpenOrders?: number;
  Num_of_Open_SalesOrder?: number;
};

export type CustomerDetails = {
  CardCode: string;
  CardName: string;
  State1?: string;
  U_Chain?: string;
  BillToDef?: string;
  ShipToDef?: string;
};

export type PartyAddress = {
  Address: string;
  AdresType: "B" | "S" | string;
  CardCode: string;
  City?: string | null;
  State?: string | null;
  Country?: string | null;
  GSTRegnNo?: string | null;
  GSTType?: number | null;
};

export type SalespersonDetails = {
  SlpCode: number;
  SlpName: string;
};

export const emptyForm = (): InvoiceForm => ({
  postingDate: todayInput(),
  dueDate: todayInput(),
  documentDate: todayInput(),
  driverName: "",
  vehicleNumber: "",
  billNumber: "",
  billDate: todayInput(),
  driverMobile: "",
  discountPercent: 0,
  shipTo: "",
  payTo: "",
  shippingType: "Road",
  ewayBillNo: "",
  lrGrNumber: "",
  shippingPriority: "Normal",
});

export const calculateTotals = (lines: SelectedLine[], discountPercent = 0, freightRows: FreightRow[] = []) => {
  const totalQty = lines.reduce((sum, line) => sum + toNumber(line.invoiceQty), 0);
  const totalBeforeDiscount = lines.reduce(
    (sum, line) => sum + toNumber(line.invoiceQty) * toNumber(line.Price),
    0,
  );
  const discountAmount = totalBeforeDiscount * (Math.max(toNumber(discountPercent), 0) / 100);
  const taxable = Math.max(totalBeforeDiscount - discountAmount, 0);
  const tax = lines.reduce((sum, line) => {
    const lineTotal = toNumber(line.invoiceQty) * toNumber(line.Price);
    const lineDiscount = lineTotal * (Math.max(toNumber(discountPercent), 0) / 100);
    return sum + Math.max(lineTotal - lineDiscount, 0) * (toNumber(line.VatPrcnt) / 100);
  }, 0);
  const freight = freightRows.reduce((sum, row) => sum + Math.max(toNumber(row.lineTotal), 0), 0);
  const totalBeforeRoundOff = taxable + tax + freight;
  const grandTotal = Math.floor(totalBeforeRoundOff + 0.5);

  return {
    totalQty,
    totalBeforeDiscount,
    discountAmount,
    taxable,
    tax,
    freight,
    totalBeforeRoundOff,
    roundOff: grandTotal - totalBeforeRoundOff,
    grandTotal,
  };
};

export const buildInvoicePayload = (
  party: Party | null,
  selectedLines: Record<string, SelectedLine>,
  form: InvoiceForm,
  freightRows: FreightRow[] = [],
) => {
  const lines = Object.values(selectedLines);
  const firstLine = lines[0];

  const additionalExpenses = freightRows
    .filter((row) => toNumber(row.expenseCode) > 0 && toNumber(row.lineTotal) > 0)
    .map((row) => ({
      ExpenseCode: toNumber(row.expenseCode),
      LineTotal: toNumber(row.lineTotal),
      ...(row.taxCode ? { VatGroup: row.taxCode } : {}),
    }));

  return {
    CardCode: party?.CardCode || "",
    DocDate: form.postingDate,
    DocDueDate: form.dueDate,
    TaxDate: form.documentDate,
    NumAtCard: form.billNumber,
    SalesPersonCode: firstLine?.SlpCode ?? null,
    ShipToCode: form.shipTo,
    PayToCode: form.payTo,
    ...(firstLine?.BPL_Id ? { BPL_IDAssignedToInvoice: firstLine.BPL_Id } : {}),
    DocumentLines: lines.map((line) => {
      const batchNumbers = (line.BatchNumbers || [])
        .map((batch) => ({
          ...(batch.BatchNumber ? { BatchNumber: batch.BatchNumber } : {}),
          Quantity: toNumber(batch.Quantity),
        }))
        .filter((batch) => batch.BatchNumber && batch.Quantity > 0);
      const batchQuantity = batchNumbers.reduce((sum, batch) => sum + toNumber(batch.Quantity), 0);
      const invoiceQuantity = toNumber(line.invoiceQty) || batchQuantity;

      if (line.SourceType === "items") {
        return {
          ...(line.ShipDate ? { ShipDate: normalizeDateInput(line.ShipDate) } : {}),
          ItemCode: line.ItemCode,
          WarehouseCode: line.WhsCode,
          Quantity: invoiceQuantity,
          ...(line.Price ? { UnitPrice: toNumber(line.Price) } : {}),
          ...(line.TaxCode ? { TaxCode: line.TaxCode } : {}),
          ...(batchNumbers.length ? { BatchNumbers: batchNumbers } : {}),
        };
      }

      return {
        LineNum: line.LineNum,
        BaseType: 17,
        BaseEntry: line.DocEntry,
        BaseLine: line.LineNum,
        ItemCode: line.ItemCode,
        Quantity: invoiceQuantity,
        WarehouseCode: line.WhsCode,
        ...(line.TaxCode ? { TaxCode: line.TaxCode } : {}),
        ...(line.ShipDate ? { ShipDate: normalizeDateInput(line.ShipDate) } : {}),
        BatchNumbers: batchNumbers,
      };
    }),
    ...(additionalExpenses.length ? { DocumentAdditionalExpenses: additionalExpenses } : {}),
  };
};
