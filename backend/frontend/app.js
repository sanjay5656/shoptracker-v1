const fmt = n => '₹' + (parseFloat(n)||0).toLocaleString('en-IN');
const get = id => document.getElementById(id);
const TAB_HASH = { home:'#home', buy:'#buy', sell:'#sell', see:'#dashboard', history:'#history' };
const HASH_TAB = { '#home':'home', '#buy':'buy', '#sell':'sell', '#dashboard':'see', '#history':'history' };



// ─────────────────────────────────────────
// AUTO-DETECT API URL — works on any device on the network
// If served from FastAPI (:8000), API is on same host. Otherwise use stored URL.
function safeGetStorage(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function safeSetStorage(k,v){try{localStorage.setItem(k,v);}catch(e){}}
let API_URL = safeGetStorage('api_url') || window.location.origin;
let cart = [], cartTotal = 0;
let histData = { sales: [], purchases: [] };
let histMode = 'all';
let _confirmCallback = null;
let _editCartIndex = -1;
let _categoryCache = []; // FIX #3: cache categories for name lookup
function addClass(id,c){ const el=get(id); if(el) el.classList.add(c); }
function removeClass(id,c){ const el=get(id); if(el) el.classList.remove(c); }

// ─────────────────────────────────────────
//  FIX #1: URL HASH — persist current tab on refresh
// ─────────────────────────────────────────

function getTabFromHash() {
  return HASH_TAB[location.hash] || 'home';
}

window.addEventListener('popstate', () => {
  switchTabInternal('home');
});

// ─────────────────────────────────────────
//  OFFLINE DETECTION
// ─────────────────────────────────────────
async function checkOnline() {
  try {
    const r = await fetch(`${API_URL}/categories/`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) { get('offlineBanner').classList.remove('show'); return true; }
  } catch(e) {}
  get('offlineBanner').classList.add('show');
  return false;
}

// ─────────────────────────────────────────
//  SETTINGS — FIX #7
// ─────────────────────────────────────────







// ─────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Date display
  const now = new Date();
  get('todayDate').textContent = now.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
  get('heroDay').textContent   = now.getDate();
  get('heroMon').textContent   = now.toLocaleDateString('en-IN',{month:'short'}).toUpperCase() + ' ' + now.getFullYear();

  // FIX #1: restore tab from hash
  // Restore tab from URL hash on refresh
  const _hash = window.location.hash.replace('#','');
  const _valid = ['home','buy','sell','see','history'];
  switchTabInternal(_valid.includes(_hash) ? _hash : 'home');

  checkOnline();
  loadHomeData();
  loadCategories();
});

// ─────────────────────────────────────────
//  NAVIGATION — FIX #1
// ─────────────────────────────────────────
function switchTab(tab) {
  // Update URL hash (triggers popstate for back button)
  history.replaceState(null, '', '#' + tab);
  switchTabInternal(tab);
}

function switchTabInternal(tab) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const map = { home:'homeScreen', buy:'buyScreen', sell:'sellScreen', see:'seeScreen', history:'historyScreen' };
  const screen = get(map[tab] || 'homeScreen');
  if (screen) screen.classList.add('active');

  const navEl = get('nav-'+tab);
  if (navEl) navEl.classList.add('active');

  window.scrollTo(0,0);

  if (tab==='home')    loadHomeData();
  if (tab==='sell')    { resetSellScreen(); loadCategoriesForSell(); }
  if (tab==='buy')     { loadCategories(); }
  if (tab==='history') initHistoryTab();
  if (tab==='see')  {
    document.querySelectorAll('#seeScreen .tab-content').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('#seeScreen .tab-btn').forEach(b=>b.classList.remove('active'));
    get('dashToday').classList.add('active');
    document.querySelector('#seeScreen .tab-btn').classList.add('active');
    loadDashToday();
    loadDashStock();
  }
}

// ─────────────────────────────────────────
//  HOME DATA
// ─────────────────────────────────────────
async function loadHomeData() {
  try {
    const res  = await fetch(`${API_URL}/dashboard/today`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const s    = data.sales_summary;
    get('topbarProfit').textContent  = fmt(s.total_profit);
    get('homeProfitAmt').textContent = (s.total_profit||0).toLocaleString('en-IN');
    get('heroRevenue').textContent   = fmt(s.total_revenue);
    get('heroItems').textContent     = s.total_items_sold||0;
    get('heroBargain').textContent   = fmt(s.total_bargain_loss);
    get('homeSubtitle').textContent  = s.total_items_sold>0 ? `${s.total_items_sold} items sold today` : 'No sales yet today';
    get('tcRevenue').textContent     = fmt(s.total_revenue);
    get('tcProfit').textContent      = fmt(s.total_profit);
    get('tcBargain').textContent     = fmt(s.total_bargain_loss);
    get('tcItems').textContent       = s.total_items_sold||0;
    get('offlineBanner').classList.remove('show');
    checkAlerts();
  } catch(e) {
    get('topbarProfit').textContent = '📴';
    get('offlineBanner').classList.add('show');
  }
}

async function checkAlerts() {
  try {
    const res  = await fetch(`${API_URL}/dashboard/stock-alerts`);
    const data = await res.json();
    const out  = data.alerts.out_of_stock.count;
    const low  = data.alerts.low_stock.count;
    const b    = get('alertBanner');
    if (out>0) { b.style.display='flex'; get('alertMsg').textContent=`${out} categories OUT of stock`; }
    else if (low>0) { b.style.display='flex'; get('alertMsg').textContent=`${low} categories running low`; }
    else b.style.display='none';
  } catch(e){}
}

// ─────────────────────────────────────────
//  CATEGORIES — FIX #3: cache for name lookup
// ─────────────────────────────────────────
async function loadCategories() {
  try {
    const res  = await fetch(`${API_URL}/categories/`);
    const data = await res.json();
    _categoryCache = data.categories || [];
    const sel  = get('buyCategory');
    sel.innerHTML = '<option value="">— Select Category —</option>';
    _categoryCache.forEach(cat => {
      const o = document.createElement('option');
      o.value = cat.id; o.textContent = `${cat.name} (Stock: ${cat.current_stock})`;
      o.dataset.sellingPrice = cat.selling_price||0;
      o.dataset.stock        = cat.current_stock;
      o.dataset.avgCost      = cat.avg_cost||0;
      o.dataset.name         = cat.name;
      sel.appendChild(o);
    });
  } catch(e){}
}

async function loadCategoriesForSell() {
  try {
    const res  = await fetch(`${API_URL}/categories/`);
    const data = await res.json();
    _categoryCache = data.categories || [];
    const sel  = get('sellCategory');
    sel.innerHTML = '<option value="">— Select Category —</option>';
    const qmap = {};
    cart.forEach(i => { qmap[String(i.category_id)] = (qmap[String(i.category_id)]||0) + i.quantity; });

    let allExhausted = _categoryCache.length > 0; // only true if there are categories
    _categoryCache.forEach(cat => {
      const avail = (cat.current_stock||0) - (qmap[String(cat.id)]||0);
      if (avail > 0) allExhausted = false;
      const o = document.createElement('option');
      o.value = cat.id;
      o.dataset.stock        = avail;
      o.dataset.avgCost      = cat.avg_cost||0;
      o.dataset.sellingPrice = cat.selling_price||0;
      o.dataset.name         = cat.name;
      o.textContent = avail<=0 ? `${cat.name} — OUT OF STOCK` : `${cat.name} (${avail} left)`;
      if (avail<=0) o.disabled = true;
      sel.appendChild(o);
    });

    // FIX #5: if all categories have zero available and cart has items, hide add form
    if (cart.length > 0 && allExhausted) {
      get('sellFormArea').style.display = 'none';
      get('sellDoneOnlyArea').style.display = 'block';
      get('cartCompleteBanner').classList.add('show');
    } else {
      get('sellFormArea').style.display = 'block';
      get('sellDoneOnlyArea').style.display = 'none';
      get('cartCompleteBanner').classList.remove('show');
    }
  } catch(e){}
}





// ─────────────────────────────────────────
//  BUY SCREEN
// ─────────────────────────────────────────
function onBuyCategorySelect() {
  const sel = get('buyCategory');
  const opt = sel.options[sel.selectedIndex];
  if (!sel.value) { get('buyCatInfoStrip').style.display='none'; return; }
  const sp    = parseFloat(opt.dataset.sellingPrice)||0;
  const stock = opt.dataset.stock || 0;
  const cost  = parseFloat(opt.dataset.avgCost)||0;
  get('buyCatStockVal').textContent = stock;
  get('buyCatSellVal').textContent  = fmt(sp);
  get('buyCatCostVal').textContent  = cost > 0 ? fmt(cost) : '—';
  get('buyCatInfoStrip').style.display = 'block';
  if (sp > 0) get('buySellingPrice').value = sp;
  calcBuy();
}

function calcBuy() {
  const qty   = parseFloat(get('buyQty').value)||0;
  const total = parseFloat(get('buyTotal').value)||0;
  const sp    = parseFloat(get('buySellingPrice').value)||0;
  const disp  = get('costPerPieceDisplay');
  if (qty > 0 && total > 0) {
    const cost = total / qty;
    disp.textContent = fmt(cost.toFixed(2));
    disp.style.color = 'var(--text)';
    if (sp > 0) {
      const m = sp - cost;
      get('expectedMargin').textContent = fmt(m.toFixed(2)) + (m >= 0 ? ' profit/pc' : ' loss/pc');
      get('expectedMargin').className   = 'cr-val' + (m < 0 ? ' warn' : '');
      get('marginRow').style.display    = 'flex';
      addClass('calcBox','show');
    } else {
      get('marginRow').style.display = 'none'; removeClass('calcBox','show');
    }
  } else {
    disp.textContent = '—'; disp.style.color = 'var(--text3)';
    get('marginRow').style.display = 'none'; removeClass('calcBox','show');
  }
}

async function recordPurchase() {
  // If NEW tab is active → use createNewCategory
  const activeBtn = document.querySelector('.buy-tab-btn.active');
  if (activeBtn && activeBtn.id === 'btab-new') {
    await createNewCategory();
    return;
  }
  const catId = get('buyCategory').value;
  const qty   = get('buyQty').value;
  const total = get('buyTotal').value;
  const sp    = parseFloat(get('buySellingPrice').value)||0;
  const supp  = get('buySupplier').value;
  if (!catId)              { alert('Select a category'); return; }
  if (!qty || qty <= 0)    { alert('Enter quantity'); return; }
  if (!total || total <= 0){ alert('Enter wholesale amount'); return; }
  try {
    const res=await fetch(`${API_URL}/purchases/`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({category_id:parseInt(catId),quantity_bought:parseInt(qty),total_paid:parseFloat(total),supplier_name:supp||null})});
    const data=await res.json();
    if (res.ok) {
      if (sp>0) await fetch(`${API_URL}/categories/${catId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({selling_price:sp})});
      const box=get('buySuccessBox');
      box.innerHTML=`✅ ${qty} pcs added! Cost/pc: ${fmt(data.purchase.cost_per_piece)} · New stock: ${data.stock_update.new_quantity}`;
      box.style.display='block';
      ['buyCategory','buyQty','buyTotal','buySellingPrice','buySupplier'].forEach(id=>get(id).value='');
      get('buyCatInfoStrip').style.display='none';
      get('costPerPieceDisplay').textContent='—';
      removeClass('calcBox','show');
      loadCategories(); showToast(`✅ ${qty} pieces added!`);
      setTimeout(()=>{box.style.display='none';},5000);
    } else alert('Error: '+data.detail);
  } catch(e){ alert('Cannot connect'); }
}

// ─────────────────────────────────────────
//  SELL SCREEN — FIX #5
// ─────────────────────────────────────────
function onSellCategorySelect() {
  const sel=get('sellCategory'); const opt=sel.options[sel.selectedIndex];
  if (!sel.value) {
    get('stockPillRow').style.display='none';
    get('sellPriceSection').style.display='none';
    get('sellQtySection').style.display='none';
    get('clearCatBtn').style.display='none';
    removeClass('itemTotalBox','show'); removeClass('cartButtons','show'); return;
  }
  // Show clear button once a category is selected
  get('clearCatBtn').style.display='block';
  const stock=parseInt(opt.dataset.stock)||0;
  const pill=get('stockPill');
  pill.textContent=stock<=0?'Out of stock':`📦 ${stock} left`;
  pill.className='pill '+(stock===0?'pill-red':stock<=10?'pill-gold':'pill-green');
  get('stockPillRow').style.display='flex';
  const sp=parseFloat(opt.dataset.sellingPrice)||0;
  get('priceDisplayVal').textContent=fmt(sp);
  get('sellPrice').value=sp;
  get('priceDisplay').style.display='flex';
  get('sellPrice').style.display='none';
  get('sellPriceSection').style.display='block';
  get('sellQtySection').style.display='block';
  calcSellTotal();
}

// Fix #4: clear category selection cleanly
function clearCategorySelection() {
  get('sellCategory').value='';
  get('sellQty').value='';
  get('sellPrice').value='';
  get('stockPillRow').style.display='none';
  get('sellPriceSection').style.display='none';
  get('sellQtySection').style.display='none';
  get('clearCatBtn').style.display='none';
  removeClass('itemTotalBox','show');
  removeClass('cartButtons','show');
}
function enablePriceEdit() {
  get('priceDisplay').style.display='none';
  const inp=get('sellPrice'); inp.style.display='block'; inp.focus(); inp.select();
}
function showPriceDisplay() {
  const val=parseFloat(get('sellPrice').value)||0;
  get('priceDisplayVal').textContent=fmt(val);
  get('priceDisplay').style.display='flex';
  get('sellPrice').style.display='none';
  calcSellTotal();
}
function calcSellTotal() {
  const qty=parseFloat(get('sellQty').value)||0;
  const price=parseFloat(get('sellPrice').value)||0;
  if (qty>0&&price>0) {
    get('itemTotalVal').textContent=fmt((qty*price).toFixed(2));
    addClass('itemTotalBox','show'); addClass('cartButtons','show');
  } else { removeClass('itemTotalBox','show'); removeClass('cartButtons','show'); }
}

function addToCart(action) {
  const sel=get('sellCategory'); const opt=sel.options[sel.selectedIndex];
  const qty=parseFloat(get('sellQty').value);
  const price=parseFloat(get('sellPrice').value);
  if (!sel.value){alert('Select category');return;}
  if (!qty||qty<=0){alert('Enter quantity');return;}
  if (!price||price<=0){alert('Enter price');return;}
  if (qty>parseInt(opt.dataset.stock)){alert(`Only ${opt.dataset.stock} in stock!`);return;}
  const existing=cart.find(c=>c.category_id===parseInt(sel.value));
  if (existing) {
    const newTotal = existing.item_total + (qty * price);
    existing.quantity += qty;
    existing.price_per_piece = newTotal / existing.quantity;
    existing.item_total = newTotal;
    cartTotal += qty * price;
  } else {
    const item={category_id:parseInt(sel.value),category_name:opt.dataset.name,quantity:qty,price_per_piece:price,item_total:qty*price,avg_cost:parseFloat(opt.dataset.avgCost)||0};
    cart.push(item); cartTotal+=item.item_total;
  }
  renderCart();
  ['sellCategory','sellQty','sellPrice'].forEach(id=>get(id).value='');
  get('stockPillRow').style.display='none';
  get('sellPriceSection').style.display='none';
  get('sellQtySection').style.display='none';
  get('clearCatBtn').style.display='none';
  removeClass('itemTotalBox','show'); removeClass('cartButtons','show');
  loadCategoriesForSell(); // This will check if all exhausted
  if (action==='done') showFinalSection();
}

// FIX #5: confirm before remove from cart
function removeFromCart(i) {
  const item = cart[i];
  showConfirm(
    'Remove Item?',
    `Remove "${item.category_name}" (${item.quantity} pcs × ${fmt(item.price_per_piece)}) from cart?`,
    () => {
      cartTotal-=cart[i].item_total; cart.splice(i,1); renderCart(); loadCategoriesForSell();
      if (cart.length===0) {
        removeClass('finalSection','show');
        get('sellFormArea').style.display='block';
        get('sellDoneOnlyArea').style.display='none';
        get('cartCompleteBanner').classList.remove('show');
      } else {
        get('fchCartTotal').textContent=fmt(cartTotal.toFixed(2));
        get('finalActualAmt').value=cartTotal.toFixed(2);
        calcFinalProfit();
      }
    }
  );
}

// FIX #5: EDIT cart item (no need to delete and re-add)
function editCartItem(i) {
  _editCartIndex = i;
  const item = cart[i];
  get('editCartTitle').textContent = `✏️ Edit: ${item.category_name}`;
  get('editCartQty').value   = item.quantity;
  get('editCartPrice').value = item.price_per_piece;
  get('editCartOverlay').classList.add('show');
}
function closeEditCart() {
  get('editCartOverlay').classList.remove('show');
  _editCartIndex = -1;
}
function saveEditCart() {
  if (_editCartIndex < 0) return;
  const newQty   = parseFloat(get('editCartQty').value)||0;
  const newPrice = parseFloat(get('editCartPrice').value)||0;
  if (newQty <= 0)   { alert('Quantity must be more than 0'); return; }
  if (newPrice <= 0) { alert('Price must be more than 0'); return; }

  // Check stock availability
  const item = cart[_editCartIndex];
  const cat  = _categoryCache.find(c => c.id === item.category_id);
  if (cat) {
    const otherInCart = cart
      .filter((_,idx) => idx !== _editCartIndex && _.category_id === item.category_id)
      .reduce((s,c)=>s+c.quantity,0);
    const maxAvail = (cat.current_stock||0) - otherInCart;
    if (newQty > maxAvail) { alert(`Only ${maxAvail} in stock for ${item.category_name}`); return; }
  }

  // Recalculate cart total
  cartTotal -= item.item_total;
  item.quantity        = newQty;
  item.price_per_piece = newPrice;
  item.item_total      = newQty * newPrice;
  cartTotal += item.item_total;

  renderCart();
  loadCategoriesForSell();

  // If final section is open, update it
  if (get('finalSection').classList.contains('show')) {
    get('fchCartTotal').textContent = fmt(cartTotal.toFixed(2));
    get('finalActualAmt').value     = cartTotal.toFixed(2);
    calcFinalProfit();
  }

  closeEditCart();
  showToast('✅ Item updated!');
}

function renderCart() {
  const s=get('cartSection');
  if (cart.length===0){s.classList.remove('show');return;}
  s.classList.add('show');
  get('cartTotalDisplay').textContent=fmt(cartTotal.toFixed(2));
  get('cartItems').innerHTML=cart.map((item,i)=>`
    <div class="cart-item">
      <div style="flex:1">
        <div class="ci-name">${item.category_name}</div>
        <div class="ci-sub">${item.quantity} × ${fmt(item.price_per_piece)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:2px">
        <span class="ci-total">${fmt(item.item_total.toFixed(2))}</span>
        <button class="ci-edit" onclick="editCartItem(${i})" title="Edit">✏️</button>
        <button class="ci-remove" onclick="removeFromCart(${i})" title="Remove">✕</button>
      </div>
    </div>`).join('');
}
function showFinalSection() {
  const fs=get('finalSection'); fs.classList.add('show');
  get('fchCartTotal').textContent=fmt(cartTotal.toFixed(2));
  get('finalActualAmt').value=cartTotal.toFixed(2);
  calcFinalProfit(); fs.scrollIntoView({behavior:'smooth'});
}
function addMoreItems() {
  removeClass('finalSection','show');
  // Also re-show form if categories available
  loadCategoriesForSell();
}
function calcFinalProfit() {
  const actual=parseFloat(get('finalActualAmt').value)||0;
  if (actual<=0) return;
  let totalCost=0; cart.forEach(i=>{totalCost+=i.avg_cost*i.quantity;});
  const profit=actual-totalCost; const bargain=cartTotal-actual;
  addClass('profitPreview','show');
  get('ppProfit').textContent=fmt(profit.toFixed(2));
  get('ppProfit').className='pp-val '+(profit<0?'red':'green');
  get('ppBargain').textContent=bargain>0?fmt(bargain.toFixed(2)):'₹0 (no bargain)';
}
async function saveSale() {
  if (cart.length===0){alert('No items in cart');return;}
  const actual=parseFloat(get('finalActualAmt').value);
  if (!actual||actual<=0){alert('Enter amount received');return;}
  const ratio=actual/cartTotal;
  try {
    let tp=0,tb=0;
    for (const item of cart) {
      const ia=item.price_per_piece*ratio;
      const res=await fetch(`${API_URL}/sales/`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({category_id:item.category_id,quantity_sold:item.quantity,original_price:item.price_per_piece,actual_price:parseFloat(ia.toFixed(2))})});
      const data=await res.json();
      if (res.ok){tp+=data.profit_summary.profit_made; tb+=data.profit_summary.bargain_loss;}
    }
    get('sellSuccessBox').innerHTML=`✅ Sale saved! Profit: ${fmt(tp.toFixed(2))} | Bargain: ${fmt(tb.toFixed(2))}`;
    get('sellSuccessBox').style.display='block';
    showToast(`✅ Sale saved! Profit: ${fmt(tp.toFixed(2))}`);
    resetSellScreen(); loadHomeData();
    setTimeout(()=>{get('sellSuccessBox').style.display='none';},5000);
  } catch(e){ alert('Cannot connect'); }
}
function resetSellScreen() {
  cart=[]; cartTotal=0;
  ['sellCategory','sellQty','sellPrice','finalActualAmt'].forEach(id=>{get(id).value='';});
  get('cartItems').innerHTML=''; get('cartSection').classList.remove('show');
  get('stockPillRow').style.display='none';
  get('sellPriceSection').style.display='none';
  get('sellQtySection').style.display='none';
  get('sellFormArea').style.display='block';
  get('sellDoneOnlyArea').style.display='none';
  get('cartCompleteBanner').classList.remove('show');
  if(get('clearCatBtn')) get('clearCatBtn').style.display='none';
  ['itemTotalBox','cartButtons','finalSection','profitPreview'].forEach(id=>removeClass(id,'show'));
  get('sellInfoBox').style.display='none'; get('sellSuccessBox').style.display='none';
}

// ─────────────────────────────────────────
//  CONFIRM DIALOG
// ─────────────────────────────────────────
function showConfirm(title, msg, callback) {
  get('confirmTitle').textContent = title;
  get('confirmMsg').textContent   = msg;
  _confirmCallback = callback;
  get('confirmOverlay').classList.add('show');
}
function confirmOk() {
  get('confirmOverlay').classList.remove('show');
  if (_confirmCallback) { _confirmCallback(); _confirmCallback=null; }
}
function confirmCancel() {
  get('confirmOverlay').classList.remove('show');
  _confirmCallback = null;
}

// ─────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────
function showDashTab(tab, btn) {
  document.querySelectorAll('#seeScreen .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#seeScreen .tab-btn').forEach(b=>b.classList.remove('active'));
  const map={today:'dashToday',month:'dashMonth',stock:'dashStock',top:'dashTop'};
  get(map[tab]).classList.add('active');
  btn.classList.add('active');
  if (tab==='today')   loadDashToday();
  if (tab==='month')   loadDashMonth();
  if (tab==='stock')   loadDashStock();
  if (tab==='top')     loadDashTop();
}

async function loadDashToday() {
  try {
    const res=await fetch(`${API_URL}/dashboard/today`);
    const data=await res.json(); const s=data.sales_summary;
    get('dRevenue').textContent=fmt(s.total_revenue);
    get('dProfit').textContent=fmt(s.total_profit);
    get('dBargain').textContent=fmt(s.total_bargain_loss);
    get('dItems').textContent=s.total_items_sold||0;
  } catch(e){}
}

// FIX #4: Month tab — use same date-range approach as history (reliable)
async function loadDashMonth() {
  try {
    const res=await fetch(`${API_URL}/dashboard/month`);
    const data=await res.json(); const s=data.summary;
    get('mRevenue').textContent=fmt(s.total_revenue);
    get('mProfit').textContent=fmt(s.total_profit);
    get('mBargain').textContent=fmt(s.total_bargain_loss);
    get('mBestDay').textContent=data.best_day?.date||'—';
  } catch(e){}
  loadMonthSoldItems();
}

// FIX #4: Use /sales/history with explicit date range for THIS month
// FIX #2 #3 #4: Month sold items — bulletproof name resolution + profit display
async function loadMonthSoldItems() {
  const c = get('monthSoldList');
  if (!c) return;
  c.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">Loading...</div>';
  try {
    const now  = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const to   = now.toISOString().split('T')[0];

    // Fetch history + today + categories all in parallel
    const [salesRes, catRes, todayRes] = await Promise.all([
      fetch(`${API_URL}/sales/history?from_date=${from}&to_date=${to}`),
      fetch(`${API_URL}/categories/`),
      fetch(`${API_URL}/sales/?date=${to}`)
    ]);
    const salesData = await salesRes.json();
    const catData   = await catRes.json();
    const todayData = await todayRes.json();

    // FIX #2: bulletproof name map
    const catNameMap = buildCatNameMap(catData.categories);

    const histSales = (salesData.sales||[]).map(s=>({
      ...s, category_name: resolveCatName(s, catNameMap)
    }));
    // Merge today (avoid duplicates)
    const seenIds = new Set(histSales.map(s=>s.id));
    const todaySales = (todayData.sales||[])
      .filter(s => !seenIds.has(s.id))
      .map(s=>({ ...s, category_name: resolveCatName(s, catNameMap) }));

    const merged = [...histSales, ...todaySales];

    if (!merged.length) {
      c.innerHTML = '<div class="empty-state" style="padding:20px"><div class="es-icon" style="font-size:30px">📦</div><div class="es-title">No sales this month yet</div></div>';
      return;
    }

    // Group by category — use getSaleProfit helper
    const catMap = {};
    merged.forEach(s => {
      const name = s.category_name;
      if (!catMap[name]) catMap[name] = { qty:0, revenue:0, profit:0, bargain:0 };
      catMap[name].qty     += s.quantity_sold || 0;
      catMap[name].revenue += (s.actual_price||0) * (s.quantity_sold||0);
      catMap[name].profit  += getSaleProfit(s);
      catMap[name].bargain += s.bargain_loss || 0;
    });

    const sorted = Object.entries(catMap).sort((a,b) => b[1].revenue - a[1].revenue);
    const medals = ['🥇','🥈','🥉'];
    let html = '<div class="hist-items-list">';
    sorted.forEach(([name, d], i) => {
      html += `
        <div class="hist-sale-row">
          <div class="hsr-left">
            <div class="hsr-name">${medals[i]||'▪️'} ${name}</div>
            <div class="hsr-meta">${d.qty} pcs sold${d.bargain>0?` · bargain ${fmt(d.bargain)}`:''}</div>
          </div>
          <div class="hsr-right">
            <div class="hsr-total">${fmt(d.revenue)}</div>
            <div class="hsr-profit" style="color:${d.profit>0?'var(--green)':d.profit<0?'var(--danger)':'var(--text3)'}">
              ${d.profit>=0?'+':''}${fmt(d.profit)} profit
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
    c.innerHTML = html;
    window._monthSales   = merged;
    window._monthCatMap  = catMap;
  } catch(e) {
    c.innerHTML = `<div style="padding:16px;color:var(--danger);font-size:13px">Could not load month data: ${e.message}</div>`;
  }
}

async function loadDashStock() {
  try {
    const res=await fetch(`${API_URL}/dashboard/stock-alerts`);
    const data=await res.json(); const c=get('stockList');
    c.innerHTML='';
    const all=[
      ...data.alerts.out_of_stock.categories.map(i=>({...i,level:'danger'})),
      ...data.alerts.low_stock.categories.map(i=>({...i,level:'warning'})),
      ...data.alerts.healthy.categories.map(i=>({...i,level:'good'}))
    ];
    if (!all.length){ c.innerHTML='<div class="empty-state"><div class="es-icon">📦</div><div class="es-title">No stock data yet</div></div>'; return; }
    all.forEach(item=>{
      const e=item.level==='danger'?'🔴':item.level==='warning'?'🟡':'🟢';
      c.innerHTML+=`<div class="stock-row ${item.level}"><div><div class="sk-name">${item.category}</div><div class="sk-meta">Avg cost: ${fmt(item.avg_cost)}</div></div><div class="sk-qty ${item.level}">${e} ${item.current_stock}</div></div>`;
    });
  } catch(e){}
}
async function loadDashTop() {
  try {
    const res=await fetch(`${API_URL}/dashboard/top-categories`);
    const data=await res.json(); const c=get('topList'); c.innerHTML='';
    const cats=data.top_categories||[];
    if (!cats.length){ c.innerHTML='<div class="empty-state"><div class="es-icon">🏆</div><div class="es-title">No sales data yet</div></div>'; return; }
    const medals=['🥇','🥈','🥉'];
    cats.forEach((cat,i)=>{
      c.innerHTML+=`<div class="top-row"><div class="top-row-header"><span class="top-row-name">${medals[i]||'▪️'} ${cat.category}</span><span class="top-row-profit">${fmt(cat.total_profit)}</span></div><div class="top-row-stats"><span class="top-stat">Revenue: <strong>${fmt(cat.total_revenue)}</strong></span><span class="top-stat">Bargain: <strong>${fmt(cat.total_bargain_loss)}</strong></span><span class="top-stat">Stock: <strong>${cat.current_stock}</strong></span></div></div>`;
    });
  } catch(e){}
}

// ─────────────────────────────────────────
//  DEBUG HELPER — tap topbar logo 5× to open
//  Shows raw API responses so you can diagnose name/profit issues
// ─────────────────────────────────────────
let _logoTapCount = 0, _logoTapTimer = null;
document.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('.topbar-logo');
  if (logo) logo.addEventListener('click', () => {
    _logoTapCount++;
    clearTimeout(_logoTapTimer);
    _logoTapTimer = setTimeout(() => { _logoTapCount = 0; }, 1500);
    if (_logoTapCount >= 5) { _logoTapCount = 0; openDebugPanel(); }
  });
});

async function openDebugPanel() {
  const today = new Date().toISOString().split('T')[0];
  let info = `📡 API: ${API_URL}\n📅 Today: ${today}\n\n`;
  try {
    const r = await fetch(`${API_URL}/sales/?date=${today}`);
    const d = await r.json();
    const s = (d.sales||[])[0];
    info += `--- /sales/?date=today (first record) ---\n${JSON.stringify(s, null, 2)}\n\n`;
  } catch(e) { info += `sales error: ${e.message}\n\n`; }
  try {
    const r = await fetch(`${API_URL}/categories/`);
    const d = await r.json();
    const c = (d.categories||[])[0];
    info += `--- /categories/ (first record) ---\n${JSON.stringify(c, null, 2)}\n\n`;
  } catch(e) { info += `categories error: ${e.message}\n\n`; }
  try {
    const from = new Date(new Date().setDate(new Date().getDate()-7)).toISOString().split('T')[0];
    const r = await fetch(`${API_URL}/sales/history?from_date=${from}&to_date=${today}`);
    const d = await r.json();
    const s = (d.sales||[])[0];
    info += `--- /sales/history (first record) ---\n${JSON.stringify(s, null, 2)}\n`;
  } catch(e) { info += `history error: ${e.message}\n`; }
  alert(info); // Simple alert — enough for debug
}
//  (handles string vs int id mismatch from API)
// ─────────────────────────────────────────
function buildCatNameMap(categories) {
  const m = {};
  (categories||[]).forEach(c => {
    m[c.id]         = c.name;  // integer key
    m[String(c.id)] = c.name;  // string key fallback
  });
  return m;
}

// Resolve category name from a sale/purchase record using all available data
function resolveCatName(record, catNameMap) {
  if (record.category_name && record.category_name !== 'Unknown' && record.category_name !== 'Unknown Item') {
    return record.category_name;
  }
  const id = record.category_id;
  return catNameMap[id] || catNameMap[String(id)] || catNameMap[parseInt(id)] || '⚠️ Unknown';
}
// ─────────────────────────────────────────
//  HISTORY TAB
// ─────────────────────────────────────────
function initHistoryTab() {
  const now = new Date();
  // FIX #1: to = tomorrow so today is INCLUDED in the range
  const toDate = new Date(now); toDate.setDate(now.getDate() + 1);
  const toStr   = toDate.toISOString().split('T')[0];
  const fromDate = new Date(now); fromDate.setDate(now.getDate() - 29);
  const fromStr  = fromDate.toISOString().split('T')[0];
  get('histFrom').value = fromStr;
  get('histTo').value   = now.toISOString().split('T')[0]; // show today in UI
  loadHistory();
}
async function loadHistory() {
  const from = get('histFrom').value;
  const to   = get('histTo').value;
  if (!from||!to) return;
  const c = get('histList');
  c.innerHTML = '<div class="hist-loading">Loading...</div>';
  try {
    // FIX #1 #2 #3: fetch categories + history + today's sales in parallel
    const todayStr = new Date().toISOString().split('T')[0];
    const [histRes, catRes, todayRes] = await Promise.all([
      fetch(`${API_URL}/sales/history?from_date=${from}&to_date=${to}`),
      fetch(`${API_URL}/categories/`),
      fetch(`${API_URL}/sales/?date=${todayStr}`)
    ]);
    const data      = await histRes.json();
    const catData   = await catRes.json();
    const todayData = await todayRes.json();

    // FIX #2: bulletproof name map — handles int/string id mismatch
    const catNameMap = buildCatNameMap(catData.categories);

    const histSales = (data.sales||[]).map(s=>({
      ...s, category_name: resolveCatName(s, catNameMap)
    }));
    // Merge today's sales not already in history
    const seenIds = new Set(histSales.map(s=>s.id));
    const todaySales = (todayData.sales||[])
      .filter(s => !seenIds.has(s.id))
      .map(s=>({ ...s, category_name: resolveCatName(s, catNameMap) }));

    const allSales = [...histSales, ...todaySales];

    const purchases = (data.purchases||[]).map(p=>({
      ...p, category_name: resolveCatName(p, catNameMap)
    }));
    histData = { sales: allSales, purchases };
    renderHistoryDays();
  } catch(e) {
    c.innerHTML = '<div class="hist-empty"><div class="es-icon">📋</div><div class="es-title">Could not load history</div></div>';
  }
}
function showHistType(mode, btn) {
  histMode = mode;
  document.querySelectorAll('.htype-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderHistoryDays();
}
// ── safe helper: extract YYYY-MM-DD from any date string or object
function safeDateKey(raw) {
  if (!raw) return null;
  if (typeof raw === 'string' && raw.length >= 10) return raw.substring(0, 10);
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

// ── safe helper: format time from any raw date string
function safeTimeStr(raw) {
  if (!raw) return '';
  // Handle "2026-03-15 05:20:55.573662" format (space not T)
  const normalized = raw.replace(' ', 'T');
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
}

// ── safe helper: get the best date string from a sale record
function getSaleDate(s) {
  return s.sale_datetime || s.sale_date || s.created_at || null;
}

// ── safe helper: get profit from a sale record (handles both field names)
function getSaleProfit(s) {
  if (s.profit_made != null) return s.profit_made;
  if (s.profit      != null) return s.profit;
  return 0;
}

function renderHistoryDays() {
  const c = get('histList');
  c.innerHTML = '';
  const dayMap = {};

  if (histMode !== 'purchases') {
    histData.sales.forEach(s => {
      const d = safeDateKey(getSaleDate(s));
      if (!d) return;
      if (!dayMap[d]) dayMap[d] = { sales:[], purchases:[] };
      dayMap[d].sales.push(s);
    });
  }
  if (histMode !== 'sales') {
    histData.purchases.forEach(p => {
      const d = safeDateKey(p.purchase_date || p.created_at);
      if (!d) return;
      if (!dayMap[d]) dayMap[d] = { sales:[], purchases:[] };
      dayMap[d].purchases.push(p);
    });
  }

  const dates = Object.keys(dayMap).sort((a,b)=>b.localeCompare(a));
  if (!dates.length) {
    c.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text3)"><div style="font-size:40px;margin-bottom:8px">📋</div><div style="font-size:14px;font-weight:600;color:var(--text2)">No records found</div><div style="font-size:12px;margin-top:4px">Try a different date range or tap Go</div></div>';
    return;
  }

  dates.forEach(date => {
    const day     = dayMap[date];
    const revenue = day.sales.reduce((s,x)=>s+((x.actual_price||0)*(x.quantity_sold||0)),0);
    const profit  = day.sales.reduce((s,x)=>s+getSaleProfit(x),0);
    const bargain = day.sales.reduce((s,x)=>s+(x.bargain_loss||0),0);
    const items   = day.sales.reduce((s,x)=>s+(x.quantity_sold||0),0);
    const spent   = day.purchases.reduce((s,x)=>s+(x.total_paid||0),0);
    const dt   = new Date(date+'T00:00:00');
    const dow  = dt.toLocaleDateString('en-IN',{weekday:'long'});
    const nice = dt.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
    const id   = 'hday-'+date.replace(/-/g,'');
    const hasSales = day.sales.length > 0;
    const hasBuys  = day.purchases.length > 0;
    const profitColor = profit > 0 ? 'var(--green)' : profit < 0 ? 'var(--danger)' : 'var(--text3)';

    // Sale rows — with safe time, dynamic profit colour
    const soldRows = day.sales.map(s => {
      const total        = (s.actual_price||0) * (s.quantity_sold||0);
      const perPiece     = s.actual_price||0;
      const orig         = s.original_price||0;
      const wasBargained = orig > 0 && perPiece < orig;
      const saleTime     = safeTimeStr(getSaleDate(s));
      const p            = getSaleProfit(s);
      const pColor       = p > 0 ? 'var(--green-mid)' : p < 0 ? 'var(--danger)' : 'var(--text3)';
      return `
        <div class="hist-sale-row">
          <div class="hsr-left">
            <div class="hsr-name">${s.category_name || '⚠️ Unknown'}</div>
            <div class="hsr-meta">
              <span>${s.quantity_sold} pc × ${fmt(perPiece)}</span>
              ${wasBargained ? `<span class="hsr-bargain">orig ${fmt(orig)}</span>` : ''}
              ${saleTime     ? `<span>🕐 ${saleTime}</span>` : ''}
            </div>
          </div>
          <div class="hsr-right">
            <div class="hsr-total">${fmt(total)}</div>
            ${p != null ? `<div class="hsr-profit" style="color:${pColor}">${p>=0?'+':''}${fmt(p)} profit</div>` : ''}
          </div>
        </div>`;
    }).join('');

    const buyRows = day.purchases.map(p => `
      <div class="hist-buy-row">
        <div>
          <div class="hbr-name">🛒 ${p.category_name||'Stock'}</div>
          <div class="hbr-meta">${p.quantity_bought} pcs bought · ₹${(p.total_paid/p.quantity_bought).toFixed(2)}/pc</div>
        </div>
        <div class="hbr-total">${fmt(p.total_paid)}</div>
      </div>`).join('');

    c.innerHTML += `
      <div class="hist-day-row">
        <div class="hdr-head" onclick="toggleDayDetail('${id}')">
          <div class="hdr-left">
            <div class="hdr-date">${nice}</div>
            <div class="hdr-dow">${dow}</div>
          </div>
          <div class="hdr-right">
            ${hasSales ? `<div class="hdr-summary"><div class="hdr-profit" style="color:${profitColor}">${fmt(profit)}</div><div class="hdr-items">${items} item${items!==1?'s':''} sold</div></div>` : ''}
            ${hasBuys && !hasSales ? `<span class="pill pill-orange" style="font-size:10px">Stock bought</span>` : ''}
            ${hasBuys && hasSales  ? `<span class="pill pill-orange" style="font-size:10px;margin-right:4px">+stock</span>` : ''}
            <span class="hdr-chevron" id="chev-${id}">▼</span>
          </div>
        </div>
        <div class="hdr-detail" id="${id}">
          ${hasSales ? `
          <div class="hdr-detail-grid">
            <div class="hd-cell"><div class="hd-lbl">Revenue</div><div class="hd-val green">${fmt(revenue)}</div></div>
            <div class="hd-cell"><div class="hd-lbl">Profit</div><div class="hd-val" style="color:${profitColor}">${fmt(profit)}</div></div>
            <div class="hd-cell"><div class="hd-lbl">Bargain Loss</div><div class="hd-val orange">${fmt(bargain)}</div></div>
            <div class="hd-cell"><div class="hd-lbl">Items Sold</div><div class="hd-val">${items}</div></div>
          </div>
          <div class="hist-section-label" style="display:flex;align-items:center;justify-content:space-between">
            <span>💰 Items Sold</span>
            <button onclick="event.stopPropagation();showTodaySoldItems('${date}')" style="font-size:11px;font-weight:700;color:var(--green);background:var(--green-lite);border:1px solid rgba(26,107,60,0.2);border-radius:6px;padding:3px 10px;cursor:pointer;font-family:'Poppins',sans-serif">View All ↗</button>
          </div>
          <div class="hist-items-list">${soldRows}</div>
          ` : ''}
          ${hasBuys ? `
          <div class="hist-section-label" style="margin-top:${hasSales?'10px':'0'}">🛒 Stock Purchased · Total: ${fmt(spent)}</div>
          <div class="hist-items-list">${buyRows}</div>
          ` : ''}
        </div>
      </div>`;
  });
}
function toggleDayDetail(id) {
  const el=get(id); const chev=get('chev-'+id);
  el.classList.toggle('show'); chev.classList.toggle('open');
}




// FIX #2: save name + price + stock


// ─────────────────────────────────────────
//  HISTORY NAV SHORTCUT
// ─────────────────────────────────────────
function goToHistory() {
  switchTab('history');
}



function toggleCatEdit(id) {
  const row = get(`cmgmt-row-${id}`);
  row.classList.toggle('show');
  if (row.classList.contains('show')) get(`cmgmt-name-${id}`).focus();
}

async function saveCatMgmt(id) {
  const newName   = get(`cmgmt-name-${id}`).value.trim();
  const sellPrice = parseFloat(get(`cmgmt-sell-${id}`).value);
  const addQty    = parseInt(get(`cmgmt-qty-${id}`).value)||0;
  const wholesale = parseFloat(get(`cmgmt-ws-${id}`).value)||0;

  if (!newName)                     { alert('Category name cannot be empty'); return; }
  if (isNaN(sellPrice)||sellPrice<0){ alert('Enter valid selling price'); return; }
  if (addQty > 0 && wholesale <= 0) { alert('Enter wholesale amount for the added quantity'); return; }

  try {
    // Update name + price
    await fetch(`${API_URL}/categories/${id}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name: newName, selling_price: sellPrice })
    });

    // Add stock if qty given
    if (addQty > 0 && wholesale > 0) {
      const r2 = await fetch(`${API_URL}/purchases/`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ category_id:id, quantity_bought:addQty, total_paid:wholesale })
      });
      if (r2.ok) {
        const d2 = await r2.json();
        const stockEl = get(`cmgmt-stock-${id}`);
        if (stockEl) stockEl.textContent = d2.stock_update?.new_quantity || '—';
      }
    }

    // Update displayed price
    const priceEl = get(`cmgmt-price-${id}`);
    if (priceEl) priceEl.textContent = fmt(sellPrice);

    // Update name display
    const nameEl = get(`cmgmt-row-${id}`)?.parentElement?.querySelector('.eci-name');
    if (nameEl) nameEl.textContent = newName;

    get(`cmgmt-row-${id}`).classList.remove('show');
    get(`cmgmt-qty-${id}`).value = '';
    get(`cmgmt-ws-${id}`).value  = '';

    loadCategories();
    showToast('✅ Category updated!');
  } catch(e) { alert('Cannot connect'); }
}

// ─────────────────────────────────────────
//  TODAY SOLD ITEMS MODAL — FIX #3
// ─────────────────────────────────────────
async function showTodaySoldItems(dateStr) {
  const modal = get('soldModal');
  const body  = get('soldModalBody');
  const lbl   = get('soldModalDate');
  const title = get('soldModalTitle');

  const date    = dateStr || new Date().toISOString().split('T')[0];
  const dt      = new Date(date + 'T00:00:00');
  const isToday = date === new Date().toISOString().split('T')[0];

  title.textContent = isToday ? '📦 Items Sold Today' : '📦 Items Sold';
  lbl.textContent   = dt.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  body.innerHTML    = '<div style="text-align:center;padding:30px;color:var(--text3)">Loading...</div>';
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';

  try {
    // FIX #3: fetch categories alongside sales — bulletproof name resolution
    const [salesRes, catRes] = await Promise.all([
      fetch(`${API_URL}/sales/?date=${date}`),
      fetch(`${API_URL}/categories/`)
    ]);
    const salesData = await salesRes.json();
    const catData   = await catRes.json();

    // Also try history endpoint in parallel to catch any sales the date endpoint misses
    let histSales = [];
    try {
      const histRes  = await fetch(`${API_URL}/sales/history?from_date=${date}&to_date=${date}`);
      const histData = await histRes.json();
      histSales = histData.sales || [];
    } catch(e2) {}

    // FIX #2: bulletproof name map (int + string keys)
    const catNameMap = buildCatNameMap(catData.categories);

    const primarySales = (salesData.sales||[]).map(s => ({
      ...s, category_name: resolveCatName(s, catNameMap)
    }));
    // Merge any from history not in primary
    const seenIds = new Set(primarySales.map(s=>s.id));
    const extra = histSales
      .filter(s => !seenIds.has(s.id))
      .map(s => ({ ...s, category_name: resolveCatName(s, catNameMap) }));

    const sales = [...primarySales, ...extra].sort((a, b) => {
      const dA = new Date((getSaleDate(a)||'').replace(' ','T'));
      const dB = new Date((getSaleDate(b)||'').replace(' ','T'));
      return dB - dA;
    });

    if (!sales.length) {
      body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)"><div style="font-size:40px;margin-bottom:10px">📦</div><div style="font-size:14px;font-weight:600;color:var(--text2)">${isToday ? 'No sales yet today' : 'No sales on this day'}</div></div>`;
      return;
    }

    const totalRev    = sales.reduce((s,x)=>s+((x.actual_price||0)*(x.quantity_sold||0)),0);
    const totalProfit = sales.reduce((s,x)=>s+getSaleProfit(x),0);
    const totalBargain= sales.reduce((s,x)=>s+(x.bargain_loss||0),0);
    const totalItems  = sales.reduce((s,x)=>s+(x.quantity_sold||0),0);

    let html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <div class="hd-cell"><div class="hd-lbl">Revenue</div><div class="hd-val green">${fmt(totalRev)}</div></div>
        <div class="hd-cell"><div class="hd-lbl">Profit</div><div class="hd-val" style="color:${totalProfit>0?'var(--green)':totalProfit<0?'var(--danger)':'var(--text)'}">${fmt(totalProfit)}</div></div>
        <div class="hd-cell"><div class="hd-lbl">Bargain Loss</div><div class="hd-val orange">${fmt(totalBargain)}</div></div>
        <div class="hd-cell"><div class="hd-lbl">Items Sold</div><div class="hd-val">${totalItems}</div></div>
      </div>
      <div class="hist-section-label" style="border-top:none;padding-top:0;margin-bottom:8px">All Sales · ${sales.length} transaction${sales.length!==1?'s':''}</div>
      <div class="hist-items-list">`;

    // FIX #3: show sale time; show profit per transaction
    sales.forEach(s => {
      const total     = (s.actual_price||0) * (s.quantity_sold||0);
      const orig      = s.original_price||0;
      const actual    = s.actual_price||0;
      const bargained = orig > 0 && actual < orig;
      // Parse time from ISO string — handles both date-only and datetime
      const rawDate   = getSaleDate(s) || '';
      let saleTime = '';
      if (rawDate) {
        saleTime = safeTimeStr(rawDate);
      }
      const profit = getSaleProfit(s);
      html += `
        <div class="hist-sale-row">
          <div class="hsr-left">
            <div class="hsr-name">${s.category_name}</div>
            <div class="hsr-meta">
              <span>${s.quantity_sold} pc × ${fmt(actual)}</span>
              ${bargained ? `<span class="hsr-bargain">${fmt(orig)}</span>` : ''}
              ${saleTime ? `<span>🕐 ${saleTime}</span>` : ''}
            </div>
          </div>
          <div class="hsr-right">
            <div class="hsr-total">${fmt(total)}</div>
            <div class="hsr-profit" style="color:${profit>0?'var(--green-mid)':profit<0?'var(--danger)':'var(--text3)'}">
              ${profit!=null ? `${profit>=0?'+':''}${fmt(profit)} profit` : ''}
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = `<div style="text-align:center;padding:30px;color:var(--danger)">Could not load sales data<br><small>${e.message}</small></div>`;
  }
}

function closeSoldModal() {
  get('soldModal').classList.remove('show');
  document.body.style.overflow = '';
}

// Modal listeners moved to DOMContentLoaded

// ─────────────────────────────────────────
// BUY SCREEN TABS
// ─────────────────────────────────────────
function setBuyTab(tab, btn) {
  ['buyTabSelect','buyTabNew','buyTabEdit'].forEach(id => {
    const el = get(id); if (el) el.style.display = 'none';
  });
  document.querySelectorAll('.buy-tab-btn').forEach(b => b.classList.remove('active'));
  const map = { select:'buyTabSelect', new:'buyTabNew', edit:'buyTabEdit' };
  const el = get(map[tab]);
  if (el) el.style.display = 'block';
  if (btn) btn.classList.add('active');
  const pd = get('buyPurchaseDetails');
  const sb = get('buySaveBtn');
  if (tab === 'edit') {
    if (pd) pd.style.display = 'none';
    if (sb) sb.style.display = 'none';
    loadBuyEditList();
  } else {
    if (pd) pd.style.display = 'block';
    if (sb) sb.style.display = 'block';
  }
  if (tab === 'new') {
    setTimeout(() => { const inp = get('newCatName'); if (inp) inp.focus(); }, 100);
  }
}

async function createNewCategory() {
  const name  = get('newCatName').value.trim();
  const price = parseFloat(get('buySellingPrice').value) || 0;
  const qty   = get('buyQty').value;
  const total = get('buyTotal').value;
  if (!name)                { alert('Enter a category name'); return; }
  if (!qty   || qty <= 0)   { alert('Enter quantity'); return; }
  if (!total || total <= 0) { alert('Enter wholesale amount'); return; }
  try {
    const catRes = await fetch(`${API_URL}/categories/`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, selling_price: price })
    });
    const catData = await catRes.json();
    if (!catRes.ok) { alert('Error: ' + catData.detail); return; }
    const purRes = await fetch(`${API_URL}/purchases/`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        category_id: catData.category.id,
        quantity_bought: parseInt(qty),
        total_paid: parseFloat(total),
        supplier_name: get('buySupplier').value || null
      })
    });
    const purData = await purRes.json();
    if (purRes.ok) {
      get('newCatName').value = '';
      ['buyQty','buyTotal','buySellingPrice','buySupplier'].forEach(id => { if(get(id)) get(id).value=''; });
      get('costPerPieceDisplay').textContent = '—';
      removeClass('calcBox','show');
      const box = get('buySuccessBox');
      box.innerHTML = `✅ "${name}" created! ${qty} pcs · Cost/pc: ${fmt(purData.purchase.cost_per_piece)}`;
      box.style.display = 'block';
      setBuyTab('select', get('btab-select'));
      loadCategories();
      showToast(`✅ "${name}" created!`);
      setTimeout(() => { box.style.display = 'none'; }, 5000);
    } else { alert('Error: ' + purData.detail); }
  } catch(e) { alert('Cannot connect to server'); }
}

async function loadBuyEditList() {
  const c = get('buyEditCatList');
  if (!c) return;
  c.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3)">Loading...</div>';
  try {
    const res  = await fetch(`${API_URL}/categories/`);
    const data = await res.json();
    const cats = data.categories || [];
    if (!cats.length) {
      c.innerHTML = '<div class="empty-state" style="padding:16px"><div class="es-icon">🏷️</div><div class="es-title">No categories yet</div></div>';
      return;
    }
    let html = '<div class="card" style="overflow:hidden">';
    cats.forEach(cat => {
      html += `
        <div>
          <div class="price-row" onclick="toggleBuyEditRow(${cat.id})">
            <div style="flex:1">
              <div class="eci-name">${cat.name}</div>
              <div style="display:flex;gap:8px;margin-top:3px;flex-wrap:wrap">
                <span style="font-size:11px;color:var(--text3)">Stock: <strong style="color:var(--text2)" id="bedit-stock-${cat.id}">${cat.current_stock||0}</strong></span>
                <span style="font-size:11px;color:var(--text3)">Sell: <strong style="color:var(--green)" id="bedit-price-${cat.id}">₹${cat.selling_price||0}</strong></span>
                <span style="font-size:11px;color:var(--text3)">Avg: <strong>₹${cat.avg_cost||0}</strong></span>
              </div>
            </div>
            <button class="eci-edit-btn">✏️</button>
          </div>
          <div class="eci-edit-row" id="bedit-row-${cat.id}" style="flex-direction:column;gap:10px;padding:14px">
            <div>
              <div class="form-label">Category Name</div>
              <input type="text" class="form-input" id="bedit-name-${cat.id}" value="${cat.name}">
            </div>
            <div>
              <div class="form-label">Selling Price ₹</div>
              <input type="number" class="form-input" id="bedit-sell-${cat.id}" value="${cat.selling_price||0}" inputmode="numeric">
            </div>
            <div style="background:var(--surface2);border-radius:8px;padding:10px;border:1px solid var(--border)">
              <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px">📦 Add More Stock (optional)</div>
              <div style="margin-bottom:8px">
                <div class="form-label">Add Qty</div>
                <input type="number" class="form-input" id="bedit-qty-${cat.id}" placeholder="e.g. 20" inputmode="numeric">
              </div>
              <div>
                <div class="form-label">Wholesale ₹ (total paid)</div>
                <input type="number" class="form-input" id="bedit-ws-${cat.id}" placeholder="e.g. 400" inputmode="numeric">
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-green btn-sm" style="flex:1" onclick="saveBuyEdit(${cat.id})">✅ Save</button>
              <button class="btn btn-outline btn-sm" onclick="toggleBuyEditRow(${cat.id})">Cancel</button>
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
    c.innerHTML = html;
  } catch(e) {
    c.innerHTML = '<div class="empty-state"><div class="es-icon">⚠️</div><div class="es-title">Could not load</div></div>';
  }
}

function toggleBuyEditRow(id) {
  const row = get(`bedit-row-${id}`);
  if (!row) return;
  const isOpen = row.classList.contains('show');
  // Close ALL open rows first
  document.querySelectorAll('.eci-edit-row').forEach(r => r.classList.remove('show'));
  // If it was closed, open it. If it was open, leave it closed.
  if (!isOpen) {
    row.classList.add('show');
    setTimeout(() => { const inp = get(`bedit-name-${id}`); if (inp) inp.focus(); }, 100);
  }
}

async function saveBuyEdit(id) {
  const newName   = get(`bedit-name-${id}`).value.trim();
  const sellPrice = parseFloat(get(`bedit-sell-${id}`).value);
  const addQty    = parseInt(get(`bedit-qty-${id}`).value)  || 0;
  const wholesale = parseFloat(get(`bedit-ws-${id}`).value) || 0;
  if (!newName)                          { alert('Name cannot be empty'); return; }
  if (isNaN(sellPrice) || sellPrice < 0) { alert('Enter valid selling price'); return; }
  if (addQty > 0 && wholesale <= 0)      { alert('Enter wholesale amount for added stock'); return; }
  try {
    const res = await fetch(`${API_URL}/categories/${id}`, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name: newName, selling_price: sellPrice })
    });
    if (!res.ok) { const d = await res.json(); alert('Error: ' + d.detail); return; }
    if (addQty > 0 && wholesale > 0) {
      const purRes = await fetch(`${API_URL}/purchases/`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ category_id: id, quantity_bought: addQty, total_paid: wholesale })
      });
      if (purRes.ok) {
        const purData = await purRes.json();
        const stockEl = get(`bedit-stock-${id}`);
        if (stockEl) stockEl.textContent = purData.stock_update.new_quantity;
      }
    }
    const priceEl = get(`bedit-price-${id}`);
    if (priceEl) priceEl.textContent = '₹' + sellPrice;
    const nameEl = get(`bedit-row-${id}`)?.previousElementSibling?.querySelector('.eci-name');
    if (nameEl) nameEl.textContent = newName;
    get(`bedit-row-${id}`).classList.remove('show');
    get(`bedit-qty-${id}`).value = '';
    get(`bedit-ws-${id}`).value  = '';
    loadCategories();
    showToast('✅ Category updated!');
  } catch(e) { alert('Cannot connect to server'); }
}

function showToast(message) {
  const toast = document.getElementById('successToast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); }, 3000);
}
// ─────────────────────────────────────────
// SELL CATEGORY SEARCH
// ─────────────────────────────────────────
function filterSellCategories() {
  const search = get('sellCategorySearch').value.toLowerCase().trim();
  const sel    = get('sellCategory');
  sel.value = '';
  onSellCategorySelect();
  sel.innerHTML = '<option value="">— Select Category —</option>';
  const qmap = {};
  cart.forEach(i => {
    qmap[String(i.category_id)] = (qmap[String(i.category_id)] || 0) + i.quantity;
  });
  const filtered = search
    ? _categoryCache.filter(cat => cat.name.toLowerCase().includes(search))
    : _categoryCache;
  filtered.forEach(cat => {
    const avail = (cat.current_stock || 0) - (qmap[String(cat.id)] || 0);
    const o = document.createElement('option');
    o.value                = cat.id;
    o.dataset.stock        = avail;
    o.dataset.avgCost      = cat.avg_cost || 0;
    o.dataset.sellingPrice = cat.selling_price || 0;
    o.dataset.name         = cat.name;
    o.textContent = avail <= 0
      ? `${cat.name} — OUT OF STOCK`
      : `${cat.name} (${avail} left)`;
    if (avail <= 0) o.disabled = true;
    sel.appendChild(o);
  });
  if (filtered.length === 1) {
    sel.value = String(filtered[0].id);
    onSellCategorySelect();
  }
}

function handleSellSearchEnter(e) {
  if (e.key !== 'Enter') return;
  const sel = get('sellCategory');
  for (let i = 1; i < sel.options.length; i++) {
    if (!sel.options[i].disabled) {
      sel.selectedIndex = i;
      onSellCategorySelect();
      get('sellCategorySearch').blur();
      break;
    }
  }
}

// ─────────────────────────────────────────
// BUY CATEGORY SEARCH
// ─────────────────────────────────────────
function filterBuyCategories() {
  const search = get('buyCategorySearch').value.toLowerCase().trim();
  const sel    = get('buyCategory');
  sel.value = '';
  get('buyCatInfoStrip').style.display = 'none';
  sel.innerHTML = '<option value="">— Select Category —</option>';
  const filtered = search
    ? _categoryCache.filter(cat => cat.name.toLowerCase().includes(search))
    : _categoryCache;
  filtered.forEach(cat => {
    const o = document.createElement('option');
    o.value                = cat.id;
    o.dataset.sellingPrice = cat.selling_price || 0;
    o.dataset.stock        = cat.current_stock || 0;
    o.dataset.avgCost      = cat.avg_cost || 0;
    o.dataset.name         = cat.name;
    o.textContent = `${cat.name} (Stock: ${cat.current_stock||0})`;
    sel.appendChild(o);
  });
  if (filtered.length === 1) {
    sel.value = String(filtered[0].id);
    onBuyCategorySelect();
  }
}

function handleBuySearchEnter(e) {
  if (e.key !== 'Enter') return;
  const sel = get('buyCategory');
  for (let i = 1; i < sel.options.length; i++) {
    if (!sel.options[i].disabled) {
      sel.selectedIndex = i;
      onBuyCategorySelect();
      get('buyCategorySearch').blur();
      break;
    }
  }
}
// PWA Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('SW registered:', reg.scope))
    .catch(err => console.log('SW failed:', err));
}