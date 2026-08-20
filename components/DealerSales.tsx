import React, { useMemo, useState } from 'react';
import { DealerProductCategory, DealerProduct, DealerPurchase, DealerSale, UserRecord } from '../types';

interface DealerSalesProps {
  products: DealerProduct[];
  purchases: DealerPurchase[];
  sales: DealerSale[];
  users?: UserRecord[];
  onAddProduct: (product: Omit<DealerProduct, 'id' | 'createdAt'>) => void;
  onDeleteProduct: (id: string) => void;
  onAddPurchase: (purchase: Omit<DealerPurchase, 'id' | 'createdAt' | 'productName'> & { productName: string }) => void;
  onAddSale: (sale: Omit<DealerSale, 'id' | 'createdAt' | 'productName'> & { productName: string }) => void;
  onDeletePurchase: (id: string) => void;
  onDeleteSale: (id: string) => void;
}

type View = 'overview' | 'purchases' | 'sales' | 'products';

const CATEGORIES: DealerProductCategory[] = ['Device', 'ONU/ONT', 'Fiber', 'Internet Wire', 'Accessories', 'Other'];
const PAYMENT_STATUSES: DealerSale['paymentStatus'][] = ['paid', 'partial', 'credit'];

const money = (amount: number) => `Rs. ${(Number(amount) || 0).toLocaleString()}`;
const today = () => new Date().toISOString().split('T')[0];
const monthKey = (date: string) => (date || '').slice(0, 7);
const monthLabel = (value: string) => {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};
const monthOptions = () => {
  const now = new Date();
  return Array.from({ length: 14 }, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 12 + index, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: monthLabel(value) };
  });
};
const MONTH_OPTIONS = monthOptions();

const emptyProduct = (): Omit<DealerProduct, 'id' | 'createdAt'> => ({
  name: '', category: 'Device', unit: 'piece', defaultSalePrice: 0, notes: '', active: true,
});
const emptyPurchase = (productId = ''): Omit<DealerPurchase, 'id' | 'createdAt' | 'productName'> & { productName: string } => ({
  productId, productName: '', quantity: 1, unitCost: 0, totalCost: 0, supplier: '', invoiceNo: '', date: today(), notes: '',
});
const emptySale = (productId = ''): Omit<DealerSale, 'id' | 'createdAt' | 'productName'> & { productName: string } => ({
  productId, productName: '', quantity: 1, unitCost: 0, saleUnitPrice: 0, totalRevenue: 0, totalCost: 0, profit: 0,
  customerId: '', customerName: '', customerPhone: '', date: today(), paymentStatus: 'paid', notes: '',
});

const Icon: React.FC<{ name: 'plus' | 'trash' | 'box' | 'cart' | 'chart' | 'arrow' | 'close' }> = ({ name }) => {
  const paths: Record<string, React.ReactNode> = {
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    trash: <><path d="M3 6h18" /><path d="M19 6v14H5V6" /><path d="M8 6V4h8v2" /></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5" /><path d="M12 12v9" /></>,
    cart: <><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 1.9-1.4L20 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="17" cy="20" r="1" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 3-4 3 2 4-6" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
  };
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
};

const DealerSales: React.FC<DealerSalesProps> = ({
  products, purchases, sales, users = [], onAddProduct, onDeleteProduct, onAddPurchase, onAddSale, onDeletePurchase, onDeleteSale,
}) => {
  const [view, setView] = useState<View>('overview');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState('');
  const [showProductForm, setShowProductForm] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [productForm, setProductForm] = useState(emptyProduct());
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchase());
  const [saleForm, setSaleForm] = useState(emptySale());

  const productMap = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const stockByProduct = useMemo(() => {
    const map = new Map<string, { purchased: number; sold: number; purchaseCost: number }>();
    purchases.forEach(purchase => {
      const current = map.get(purchase.productId) || { purchased: 0, sold: 0, purchaseCost: 0 };
      current.purchased += Number(purchase.quantity) || 0;
      current.purchaseCost += Number(purchase.totalCost) || 0;
      map.set(purchase.productId, current);
    });
    sales.forEach(sale => {
      const current = map.get(sale.productId) || { purchased: 0, sold: 0, purchaseCost: 0 };
      current.sold += Number(sale.quantity) || 0;
      map.set(sale.productId, current);
    });
    return map;
  }, [purchases, sales]);

  const productStats = (productId: string) => {
    const row = stockByProduct.get(productId) || { purchased: 0, sold: 0, purchaseCost: 0 };
    const stock = row.purchased - row.sold;
    const averageCost = row.purchased > 0 ? row.purchaseCost / row.purchased : 0;
    return { ...row, stock, averageCost, stockValue: stock * averageCost };
  };

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter(product => !query || `${product.name} ${product.category} ${product.unit}`.toLowerCase().includes(query));
  }, [products, search]);

  const monthPurchases = useMemo(() => purchases.filter(purchase => monthKey(purchase.date) === month).sort((a, b) => b.date.localeCompare(a.date)), [purchases, month]);
  const monthSales = useMemo(() => sales.filter(sale => monthKey(sale.date) === month).sort((a, b) => b.date.localeCompare(a.date)), [sales, month]);
  const monthlyRevenue = monthSales.reduce((sum, sale) => sum + (Number(sale.totalRevenue) || 0), 0);
  const monthlyCost = monthSales.reduce((sum, sale) => sum + (Number(sale.totalCost) || 0), 0);
  const monthlyProfit = monthSales.reduce((sum, sale) => sum + (Number(sale.profit) || 0), 0);
  const stockValue = products.reduce((sum, product) => sum + productStats(product.id).stockValue, 0);
  const totalStockUnits = products.reduce((sum, product) => sum + Math.max(0, productStats(product.id).stock), 0);
  const margin = monthlyRevenue > 0 ? Math.round((monthlyProfit / monthlyRevenue) * 100) : 0;

  const openPurchase = () => {
    setPurchaseForm(emptyPurchase(products[0]?.id || ''));
    setShowPurchaseForm(true);
  };
  const openSale = () => {
    const first = products.find(product => productStats(product.id).stock > 0);
    const form = emptySale(first?.id || '');
    if (first) form.saleUnitPrice = first.defaultSalePrice || 0;
    setSaleForm(form);
    setShowSaleForm(true);
  };
  const selectPurchaseProduct = (productId: string) => {
    const product = productMap.get(productId);
    setPurchaseForm({ ...purchaseForm, productId, productName: product?.name || '' });
  };
  const selectSaleProduct = (productId: string) => {
    const product = productMap.get(productId);
    const stats = product ? productStats(product.id) : { averageCost: 0 };
    setSaleForm({ ...saleForm, productId, productName: product?.name || '', unitCost: stats.averageCost, saleUnitPrice: product?.defaultSalePrice || 0 });
  };
  const submitProduct = (event: React.FormEvent) => {
    event.preventDefault();
    if (!productForm.name.trim()) return;
    onAddProduct({ ...productForm, name: productForm.name.trim(), defaultSalePrice: Number(productForm.defaultSalePrice) || 0 });
    setProductForm(emptyProduct()); setShowProductForm(false); setView('products');
  };
  const submitPurchase = (event: React.FormEvent) => {
    event.preventDefault();
    const product = productMap.get(purchaseForm.productId);
    const quantity = Number(purchaseForm.quantity) || 0;
    const unitCost = Number(purchaseForm.unitCost) || 0;
    if (!product || quantity <= 0 || unitCost < 0) return;
    onAddPurchase({ ...purchaseForm, productName: product.name, quantity, unitCost, totalCost: quantity * unitCost });
    setPurchaseForm(emptyPurchase(product.id)); setShowPurchaseForm(false); setView('purchases'); setMonth(monthKey(purchaseForm.date));
  };
  const submitSale = (event: React.FormEvent) => {
    event.preventDefault();
    const product = productMap.get(saleForm.productId);
    const stats = product ? productStats(product.id) : { stock: 0, averageCost: 0 };
    const quantity = Number(saleForm.quantity) || 0;
    const saleUnitPrice = Number(saleForm.saleUnitPrice) || 0;
    if (!product || quantity <= 0 || quantity > stats.stock || saleUnitPrice < 0) return;
    const totalRevenue = quantity * saleUnitPrice;
    const totalCost = quantity * stats.averageCost;
    onAddSale({ ...saleForm, productName: product.name, quantity, unitCost: stats.averageCost, saleUnitPrice, totalRevenue, totalCost, profit: totalRevenue - totalCost });
    setSaleForm(emptySale(product.id)); setShowSaleForm(false); setView('sales'); setMonth(monthKey(saleForm.date));
  };

  const inputClass = 'w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500';
  const labelClass = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';
  const activeProducts = products.filter(product => product.active !== false);
  const saleProducts = activeProducts.filter(product => productStats(product.id).stock > 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-6 md:p-7 rounded-3xl shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center"><Icon name="cart" /></div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Dealer Sales &amp; Profit</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Bulk resale stock · Cost control · Margin visibility</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 max-w-2xl">A separate wholesale resale ledger for devices, ONU/ONT, fiber and internet wire. This tracks bulk stock and profitability; Equipment Tracker remains for serialised customer assignments and returns.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={openPurchase} disabled={activeProducts.length === 0} className="px-4 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><Icon name="plus" /> Purchase Stock</button>
            <button onClick={openSale} disabled={saleProducts.length === 0} className="px-4 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><Icon name="plus" /> Record Sale</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-6 border-t border-slate-100 dark:border-white/5 pt-4">
          {(['overview', 'purchases', 'sales', 'products'] as View[]).map(item => (
            <button key={item} onClick={() => setView(item)} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${view === item ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:bg-indigo-50 dark:hover:bg-white/5'}`}>
              {item === 'overview' ? 'Overview' : item === 'purchases' ? 'Purchase Ledger' : item === 'sales' ? 'Sales Ledger' : 'Product Catalog'}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <select value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-[10px] font-bold outline-none">
              {MONTH_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-indigo-600 text-white p-5 rounded-[2rem] shadow-xl shadow-indigo-600/20"><p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Sales Revenue</p><p className="text-2xl md:text-3xl font-black mt-1">{money(monthlyRevenue)}</p><p className="text-[9px] uppercase tracking-widest opacity-50 mt-2">{monthLabel(month)}</p></div>
        <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/10 p-5 rounded-[2rem]"><p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70">Cost of Goods</p><p className="text-2xl md:text-3xl font-black text-amber-500 mt-1">{money(monthlyCost)}</p><p className="text-[9px] uppercase tracking-widest text-amber-500/50 mt-2">Weighted average cost</p></div>
        <div className={`p-5 rounded-[2rem] border ${monthlyProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20'}`}><p className={`text-[10px] font-bold uppercase tracking-widest ${monthlyProfit >= 0 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>Gross Profit</p><p className={`text-2xl md:text-3xl font-black mt-1 ${monthlyProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{money(Math.abs(monthlyProfit))}</p><p className={`text-[9px] uppercase tracking-widest mt-2 ${monthlyProfit >= 0 ? 'text-emerald-500/50' : 'text-rose-500/50'}`}>{margin}% margin</p></div>
        <div className="bg-slate-950 text-white dark:bg-white dark:text-slate-900 p-5 rounded-[2rem] shadow-xl shadow-slate-950/15"><p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Stock on Hand</p><p className="text-2xl md:text-3xl font-black mt-1">{totalStockUnits.toLocaleString()} units</p><p className="text-[9px] uppercase tracking-widest opacity-50 mt-2">Value {money(stockValue)}</p></div>
      </div>

      {view === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between"><div><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Stock snapshot</p><p className="text-xs text-slate-400 mt-1">Current balance by resale item</p></div><button onClick={() => setView('products')} className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Manage catalog <Icon name="arrow" /></button></div>
            {products.length ? <div className="divide-y divide-slate-100 dark:divide-white/[0.03]">{products.slice(0, 8).map(product => { const stats = productStats(product.id); return <div key={product.id} className="px-6 py-4 flex items-center justify-between"><div className="flex items-center gap-3"><span className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 flex items-center justify-center"><Icon name="box" /></span><div><p className="text-sm font-bold text-slate-900 dark:text-white">{product.name}</p><p className="text-[10px] text-slate-400">{product.category} · Avg. cost {money(stats.averageCost)}</p></div></div><div className="text-right"><p className={`text-sm font-black ${stats.stock > 0 ? 'text-slate-900 dark:text-white' : 'text-rose-500'}`}>{stats.stock.toLocaleString()} {product.unit}</p><p className="text-[10px] text-slate-400">{money(stats.stockValue)} stock value</p></div></div>; })}</div> : <div className="py-16 text-center text-xs font-bold uppercase tracking-widest text-slate-400">Add your first resale product to begin</div>}
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm"><div className="w-11 h-11 rounded-2xl bg-violet-500/10 text-violet-500 flex items-center justify-center mb-4"><Icon name="chart" /></div><h3 className="text-lg font-bold text-slate-900 dark:text-white">How profit is calculated</h3><p className="text-xs text-slate-500 dark:text-slate-400 mt-3 leading-6">Each sale uses the product's weighted average purchase cost. This keeps your margin visible even when the wholesale dealer changes their price across multiple purchases.</p><div className="mt-5 p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] text-xs font-bold text-slate-700 dark:text-slate-300">Sale price − average cost = profit per unit</div><p className="text-[10px] text-slate-400 uppercase tracking-widest mt-5">Tip: record opening stock as a purchase with supplier “Opening Stock”.</p></div>
        </div>
      )}

      {view === 'products' && <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm"><div className="p-6 border-b border-slate-100 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Product catalog</p><p className="text-xs text-slate-400 mt-1">Bulk resale items only — no serial numbers required</p></div><div className="flex gap-2"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-xs outline-none" /><button onClick={() => { setProductForm(emptyProduct()); setShowProductForm(true); }} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><Icon name="plus" /> Add Product</button></div></div>{filteredProducts.length ? <div className="divide-y divide-slate-100 dark:divide-white/[0.03]">{filteredProducts.map(product => { const stats = productStats(product.id); const linked = purchases.some(p => p.productId === product.id) || sales.some(s => s.productId === product.id); return <div key={product.id} className="px-6 py-4 flex items-center justify-between gap-4"><div className="flex items-center gap-3 min-w-0"><span className="w-10 h-10 shrink-0 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center"><Icon name="box" /></span><div className="min-w-0"><p className="text-sm font-bold text-slate-900 dark:text-white truncate">{product.name}</p><p className="text-[10px] text-slate-400">{product.category} · Selling price {money(product.defaultSalePrice || 0)} · {product.unit}</p></div></div><div className="flex items-center gap-5"><div className="text-right"><p className={`text-sm font-black ${stats.stock > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{stats.stock.toLocaleString()}</p><p className="text-[9px] text-slate-400 uppercase tracking-widest">In stock</p></div><button title={linked ? 'Products with ledger records cannot be removed' : 'Delete product'} disabled={linked} onClick={() => onDeleteProduct(product.id)} className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 disabled:opacity-20 disabled:cursor-not-allowed"><Icon name="trash" /></button></div></div>; })}</div> : <div className="py-16 text-center text-xs font-bold uppercase tracking-widest text-slate-400">No products found</div>}</div>}

      {view === 'purchases' && <Ledger title={`Purchase ledger — ${monthLabel(month)}`} empty="No purchases recorded for this month" rows={monthPurchases} kind="purchase" onDelete={onDeletePurchase} />}
      {view === 'sales' && <Ledger title={`Sales ledger — ${monthLabel(month)}`} empty="No sales recorded for this month" rows={monthSales} kind="sale" onDelete={onDeleteSale} />}

      {showProductForm && <Modal title="Add resale product" onClose={() => setShowProductForm(false)}><form onSubmit={submitProduct} className="p-7 space-y-4"><Field label="Product name"><input required value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} placeholder="e.g. Huawei ONU HG8546M" className={inputClass} /></Field><div className="grid grid-cols-2 gap-4"><Field label="Category"><select value={productForm.category} onChange={e => setProductForm({ ...productForm, category: e.target.value as DealerProductCategory })} className={inputClass}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></Field><Field label="Unit"><input required value={productForm.unit} onChange={e => setProductForm({ ...productForm, unit: e.target.value })} placeholder="piece / meter / box" className={inputClass} /></Field></div><Field label="Default sale price (Rs.)"><input type="number" min="0" value={productForm.defaultSalePrice || ''} onChange={e => setProductForm({ ...productForm, defaultSalePrice: Number(e.target.value) || 0 })} className={inputClass} /></Field><Field label="Notes (optional)"><input value={productForm.notes || ''} onChange={e => setProductForm({ ...productForm, notes: e.target.value })} placeholder="Brand, quality, pack size..." className={inputClass} /></Field><FormButtons onCancel={() => setShowProductForm(false)} label="Save Product" /></form></Modal>}

      {showPurchaseForm && <Modal title="Purchase stock from dealer" onClose={() => setShowPurchaseForm(false)}><form onSubmit={submitPurchase} className="p-7 space-y-4"><Field label="Product"><select required value={purchaseForm.productId} onChange={e => selectPurchaseProduct(e.target.value)} className={inputClass}><option value="">Select product</option>{activeProducts.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field><div className="grid grid-cols-2 gap-4"><Field label="Quantity"><input required type="number" min="1" value={purchaseForm.quantity || ''} onChange={e => setPurchaseForm({ ...purchaseForm, quantity: Number(e.target.value) || 0 })} className={inputClass} /></Field><Field label="Unit cost (Rs.)"><input required type="number" min="0" value={purchaseForm.unitCost || ''} onChange={e => setPurchaseForm({ ...purchaseForm, unitCost: Number(e.target.value) || 0 })} className={inputClass} /></Field></div><div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 text-sm font-black text-indigo-600 dark:text-indigo-300">Total purchase cost: {money((Number(purchaseForm.quantity) || 0) * (Number(purchaseForm.unitCost) || 0))}</div><div className="grid grid-cols-2 gap-4"><Field label="Supplier"><input value={purchaseForm.supplier || ''} onChange={e => setPurchaseForm({ ...purchaseForm, supplier: e.target.value })} placeholder="Wholesale dealer" className={inputClass} /></Field><Field label="Invoice / reference"><input value={purchaseForm.invoiceNo || ''} onChange={e => setPurchaseForm({ ...purchaseForm, invoiceNo: e.target.value })} placeholder="Optional" className={inputClass} /></Field></div><Field label="Purchase date"><input required type="date" value={purchaseForm.date} onChange={e => setPurchaseForm({ ...purchaseForm, date: e.target.value })} className={inputClass} /></Field><Field label="Notes (optional)"><input value={purchaseForm.notes || ''} onChange={e => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} className={inputClass} /></Field><FormButtons onCancel={() => setShowPurchaseForm(false)} label="Save Purchase" /></form></Modal>}

      {showSaleForm && <Modal title="Record customer sale" onClose={() => setShowSaleForm(false)}><form onSubmit={submitSale} className="p-7 space-y-4"><Field label="Product"><select required value={saleForm.productId} onChange={e => selectSaleProduct(e.target.value)} className={inputClass}><option value="">Select product</option>{saleProducts.map(product => { const stats = productStats(product.id); return <option key={product.id} value={product.id}>{product.name} · {stats.stock} available</option>; })}</select></Field><div className="grid grid-cols-2 gap-4"><Field label="Quantity"><input required type="number" min="1" max={saleForm.productId ? productStats(saleForm.productId).stock : undefined} value={saleForm.quantity || ''} onChange={e => setSaleForm({ ...saleForm, quantity: Number(e.target.value) || 0 })} className={inputClass} /></Field><Field label="Sale price / unit (Rs.)"><input required type="number" min="0" value={saleForm.saleUnitPrice || ''} onChange={e => setSaleForm({ ...saleForm, saleUnitPrice: Number(e.target.value) || 0 })} className={inputClass} /></Field></div>{saleForm.productId && <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-xs font-bold text-slate-700 dark:text-slate-300">Average cost {money(productStats(saleForm.productId).averageCost)} · Estimated profit <span className="text-emerald-500">{money((Number(saleForm.quantity) || 0) * ((Number(saleForm.saleUnitPrice) || 0) - productStats(saleForm.productId).averageCost))}</span></div>}<Field label="Customer (optional)"><select value={saleForm.customerId || ''} onChange={e => { const user = users.find(item => item.id === e.target.value); setSaleForm({ ...saleForm, customerId: e.target.value, customerName: user?.name || '', customerPhone: user?.phone || '' }); }} className={inputClass}><option value="">Walk-in / not linked</option>{users.filter(user => user.status !== 'deleted').map(user => <option key={user.id} value={user.id}>{user.name} · {user.phone}</option>)}</select></Field><div className="grid grid-cols-2 gap-4"><Field label="Sale date"><input required type="date" value={saleForm.date} onChange={e => setSaleForm({ ...saleForm, date: e.target.value })} className={inputClass} /></Field><Field label="Payment status"><select value={saleForm.paymentStatus} onChange={e => setSaleForm({ ...saleForm, paymentStatus: e.target.value as DealerSale['paymentStatus'] })} className={inputClass}>{PAYMENT_STATUSES.map(status => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}</select></Field></div><Field label="Notes (optional)"><input value={saleForm.notes || ''} onChange={e => setSaleForm({ ...saleForm, notes: e.target.value })} className={inputClass} /></Field><FormButtons onCancel={() => setShowSaleForm(false)} label="Save Sale" /></form></Modal>}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <div className="space-y-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>{children}</div>;
const FormButtons: React.FC<{ onCancel: () => void; label: string }> = ({ onCancel, label }) => <div className="flex gap-3 pt-2"><button type="button" onClick={onCancel} className="flex-1 py-3.5 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 text-[10px] font-bold uppercase tracking-widest">Cancel</button><button type="submit" className="flex-[2] py-3.5 rounded-2xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-indigo-600/20">{label}</button></div>;
const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} /><div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto bg-white dark:bg-[#12162a] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/5"><div className="px-7 pt-7 pb-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between"><h3 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h3><button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"><Icon name="close" /></button></div>{children}</div></div>;

const Ledger: React.FC<{ title: string; empty: string; rows: DealerPurchase[] | DealerSale[]; kind: 'purchase' | 'sale'; onDelete: (id: string) => void }> = ({ title, empty, rows, kind, onDelete }) => <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm"><div className="px-6 py-5 border-b border-slate-100 dark:border-white/5"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</p></div>{rows.length ? <div className="divide-y divide-slate-100 dark:divide-white/[0.03]">{rows.map(row => { const purchase = kind === 'purchase' ? row as DealerPurchase : null; const sale = kind === 'sale' ? row as DealerSale : null; return <div key={row.id} className="px-6 py-4 flex items-center justify-between gap-4"><div className="min-w-0"><p className="text-sm font-bold text-slate-900 dark:text-white truncate">{row.productName}</p><p className="text-[10px] text-slate-400">{row.date} · {purchase ? `${purchase.quantity} units from ${purchase.supplier || 'dealer'}` : `${sale?.quantity} units · ${sale?.customerName || 'Walk-in sale'}`}</p></div><div className="flex items-center gap-4"><div className="text-right">{purchase ? <p className="text-sm font-black text-amber-500">− {money(purchase.totalCost)}</p> : <><p className="text-sm font-black text-emerald-500">+ {money(sale?.totalRevenue || 0)}</p><p className="text-[10px] text-slate-400">Profit {money(sale?.profit || 0)}</p></>}</div><button onClick={() => onDelete(row.id)} className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Icon name="trash" /></button></div></div>; })}</div> : <div className="py-16 text-center text-xs font-bold uppercase tracking-widest text-slate-400">{empty}</div>}</div>;

export default DealerSales;
