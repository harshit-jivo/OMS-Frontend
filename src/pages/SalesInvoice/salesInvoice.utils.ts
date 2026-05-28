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
  DocEntry: number;
  DocNum: number;
  DocDate?: string;
  DocDueDate?: string;
  SlpCode?: number;
  ShipToCode?: string;
  PayToCode?: string;
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
  OcrCode?: string;
  invoiceQty: number;
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
};

export type Party = {
  CardCode: string;
  CardName: string;
  State1?: string | null;
  U_Chain?: string | null;
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
    .filter((row) => row.expenseCode && toNumber(row.lineTotal) > 0)
    .map((row) => ({
      ExpenseCode: toNumber(row.expenseCode),
      LineTotal: toNumber(row.lineTotal),
      Remarks: "",
    }));

  return {
    CardCode: party?.CardCode || "",
    DocDate: form.postingDate,
    DocDueDate: form.dueDate,
    TaxDate: form.documentDate,
    NumAtCard: form.billNumber,
    SalesPersonCode: firstLine?.SlpCode ?? null,
    Comments: "",
    U_Driver_Name: form.driverName,
    U_Vehicle_No: form.vehicleNumber,
    U_Driver_Mobile: form.driverMobile,
    U_LR_No: form.lrGrNumber,
    U_EWay_Bill: form.ewayBillNo,
    ShipToCode: form.shipTo,
    PayToCode: form.payTo,
    DocumentLines: lines.map((line) => ({
      BaseType: 17,
      BaseEntry: line.DocEntry,
      BaseLine: line.LineNum,
      Quantity: toNumber(line.invoiceQty),
      UnitPrice: toNumber(line.Price),
      DiscountPercent: toNumber(line.DiscPrcnt),
      WarehouseCode: line.WhsCode,
      TaxCode: line.TaxCode,
    })),
    DocumentAdditionalExpenses: additionalExpenses,
  };
};
