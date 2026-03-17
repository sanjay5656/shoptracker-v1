// ─────────────────────────────────────────
// SHOPTRACKER V1 — app.js
// Clean rewrite fixing all mobile issues
// ─────────────────────────────────────────

// ── CONSTANTS ──
const fmt = n => '₹' + (parseFloat(n)||0).toLocaleString('en-IN');
const get = id => document.getElementById(id);

// ── STATE VARIABLES ──
// Safe localStorage access — works on all mobile browsers
function safeGetStorage(key) {
  try { return localStorage.getItem(key); } catch(e) { return null; }
}
function safeSetStorage(key, val) {
  try { localStorage.setItem(key, val); } catch(e) {}
}

let API_URL = safeGetStorage('api_url') ||
  (window.location.port === '8000'
    ? window.location.origin
    : 'http://localhost:8000');

let cart          = [];
let cartTotal     = 0;
let histData      = { sales: [], purchases: [] };
let histMode      = 'all';
let _confirmCallback = null;
let _editCartIndex   = -1;
let _categoryCache   = [];

// ── HELPERS ──
function addClass(id, c) {
  const el = get(id);
  if (el) el.classList.add(c);
}
function removeClass(id, c) {
  const el = get(id);
  if (el) el.classList.remove(c);
}

// ─────────────────────────────────────────
// INIT — runs when page is fully loaded
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Load shop name and owner name from settings
  loadSettings();

  // Show today's date on home screen
  const now = new Date();
  get('todayDate').textContent = now.toLocaleDateString('en-IN', {
    weekday:'short', day:'numeric', month:'short'
  });
  get('heroDay').textContent = now.getDate();
  get('heroMon').textContent = now.toLocaleDateString('en-IN', {
    month:'short'
  }).toUpperCase() + ' ' + now.getFullYear();

  // Always start on home screen
  switchTabInternal('home');

  // Modal backdrop click handlers
  // MUST be inside DOMContentLoaded — elements must exist first
  const soldModalEl     = document.getElementById('soldModal');
  const settingsModalEl = document.getElementById('settingsModal');

  if (soldModalEl) {
    soldModalEl.addEventListener('click', function(e) {
      if (e.target === this) closeSoldModal();
    });
  }
  if (settingsModalEl) {
    settingsModalEl.addEventListener('click', function(e) {
      if (e.target === this) closeSettings();
    });
  }

  // Logo tap 5 times = debug panel
  const logo = document.querySelector('.topbar-logo');
  let _logoTapCount = 0;
  let _logoTapTimer = null;
  if (logo) {
    logo.addEventListener('click', () => {
      _logoTapCount++;
      clearTimeout(_logoTapTimer);
      _logoTapTimer = setTimeout(() => { _logoTapCount = 0; }, 1500);
      if (_logoTapCount >= 5) {
        _logoTapCount = 0;
        openDebugPanel();
      }
    });
  }

  // Load initial data
  checkOnline();
  loadHomeData();
  loadCategories();
});

// ─────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────
function switchTab(tab) {
  switchTabInternal(tab);
}

function switchTabInternal(tab) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const map = {
    home:    'homeScreen',
    buy:     'buyScreen',
    sell:    'sellScreen',
    see:     'seeScreen',
    history: 'historyScreen'
  };

  const screen = get(map[tab] || 'homeScreen');
  if (screen) screen.classList.add('active');

  const navEl = get('nav-' + tab);
  if (navEl) navEl.classList.add('active');

  window.scrollTo(0, 0);

  if (tab === 'home')    loadHomeData();
  if (tab === 'sell')    { resetSellScreen(); loadCategoriesForSell(); }
  if (tab === 'buy')     loadCategories();
  if (tab === 'history') initHistoryTab();
  if (tab === 'see') {
    document.querySelectorAll('#seeScreen .tab-content')
      .forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#seeScreen .tab-btn')
      .forEach(b => b.classList.remove('active'));
    const todayTab = get('dashToday');
    const firstBtn = document.querySelector('#seeScreen .tab-btn');
    if (todayTab) todayTab.classList.add('active');
    if (firstBtn) firstBtn.classList.add('active');
    loadDashToday();
    loadDashStock();
  }
}

function goToHistory() {
  switchTab('history');
}

// ─────────────────────────────────────────
// OFFLINE DETECTION
// ─────────────────────────────────────────
async function checkOnline() {
  try {
    const r = await fetch(`${API_URL}/categories/`, {
      signal: AbortSignal.timeout(4000)
    });
    if (r.ok) {
      get('offlineBanner').classList.remove('show');
      return true;
    }
  } catch(e) {}
  get('offlineBanner').classList.add('show');
  return false;
}

// ─────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────
function loadSettings() {
  const shop  = safeGetStorage('shop_name')  || 'My Shop';
  const owner = safeGetStorage('owner_name') || 'Owner';
  get('topbarShopName').textContent = shop;
  get('heroShopName').textContent   = shop;
  get('heroOwnerName').textContent  = '👤 ' + owner;
}

function openSettings() {
  get('settingShopName').value         = safeGetStorage('shop_name')  || '';
  get('settingOwnerName').value        = safeGetStorage('owner_name') || '';
  get('settingApiUrl').value           = API_URL;
  get('settingApiCurrent').textContent = API_URL;
  get('settingsModal').classList.add('show');
}

function closeSettings() {
  get('settingsModal').classList.remove('show');
}

function saveSettings() {
  const shop   = get('settingShopName').value.trim()  || 'My Shop';
  const owner  = get('settingOwnerName').value.trim() || 'Owner';
  const newUrl = get('settingApiUrl').value.trim();
  safeSetStorage('shop_name', shop);
  safeSetStorage('owner_name', owner);
  if (newUrl && newUrl !== API_URL) {
    safeSetStorage('api_url', newUrl);
    API_URL = newUrl;
    closeSettings();
    showToast('✅ Settings saved — reloading...');
    setTimeout(() => location.reload(), 1200);
    return;
  }
  loadSettings();
  closeSettings();
  showToast('✅ Settings saved!');
}

// ─────────────────────────────────────────
// HOME DATA
// ─────────────────────────────────────────
async function loadHomeData() {
  try {
    const res  = await fetch(`${API_URL}/dashboard/today`, {
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json();
    const s    = data.sales_summary;

    get('topbarProfit').textContent  = fmt(s.total_profit);
    get('homeProfitAmt').textContent = (s.total_profit||0).toLocaleString('en-IN');
    get('heroRevenue').textContent   = fmt(s.total_revenue);
    get('heroItems').textContent     = s.total_items_sold || 0;
    get('heroBargain').textContent   = fmt(s.total_bargain_loss);
    get('homeSubtitle').textContent  = s.total_items_sold > 0
      ? `${s.total_items_sold} items sold today`
      : 'No sales yet today';
    get('tcRevenue').textContent = fmt(s.total_revenue);
    get('tcProfit').textContent  = fmt(s.total_profit);
    get('tcBargain').textContent = fmt(s.total_bargain_loss);
    get('tcItems').textContent   = s.total_items_sold || 0;
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
    if (out > 0) {
      b.style.display = 'flex';
      get('alertMsg').textContent = `${out} categories OUT of stock`;
    } else if (low > 0) {
      b.style.display = 'flex';
      get('alertMsg').textContent = `${low} categories running low`;
    } else {
      b.style.display = 'none';
    }
  } catch(e) {}
}

// ─────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────
async function loadCategories() {
  try {
    const res  = await fetch(`${API_URL}/categories/`);
    const data = await res.json();
    _categoryCache = data.categories || [];

    const sel = get('buyCategory');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select Category —</option>';

    _categoryCache.forEach(cat => {
      const o = document.createElement('option');
      o.value = cat.id;
      o.textContent = `${cat.name} (Stock: ${cat.current_stock})`;
      o.dataset.sellingPrice = cat.selling_price || 0;
      o.dataset.stock        = cat.current_stock;
      o.dataset.avgCost      = cat.avg_cost || 0;
      o.dataset.name         = cat.name;
      sel.appendChild(o);
    });
  } catch(e) {}
}

async function loadCategoriesForSell() {
  try {
    const res  = await fetch(`${API_URL}/categories/`);
    const data = await res.json();
    _categoryCache = data.categories || [];

    const sel = get('sellCategory');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select Category —</option>';

    const qmap = {};
    cart.forEach(i => {
      qmap[String(i.category_id)] = (qmap[String(i.category_id)] || 0) + i.quantity;
    });

    let allExhausted = _categoryCache.length > 0;
    _categoryCache.forEach(cat => {
      const avail = (cat.current_stock || 0) - (qmap[String(cat.id)] || 0);
      if (avail > 0) allExhausted = false;
      const o = document.createElement('option');
      o.value = cat.id;
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

    if (cart.length > 0 && allExhausted) {
      get('sellFormArea').style.display    = 'none';
      get('sellDoneOnlyArea').style.display = 'block';
      get('cartCompleteBanner').classList.add('show');
    } else {
      get('sellFormArea').style.display    = 'block';
      get('sellDoneOnlyArea').style.display = 'none';
      get('cartCompleteBanner').classList.remove('show');
    }
  } catch(e) {}
}

// ─────────────────────────────────────────
// BUY SCREEN
// ─────────────────────────────────────────
function onBuyCategorySelect() {
  const sel = get('buyCategory');
  const opt = sel.options[sel.selectedIndex];
  if (!sel.value) {
    get('buyCatInfoStrip').style.display = 'none';
    return;
  }
  const sp    = parseFloat(opt.dataset.sellingPrice) || 0;
  const stock = opt.dataset.stock || 0;
  const cost  = parseFloat(opt.dataset.avgCost) || 0;

  get('buyCatStockVal').textContent = stock;
  get('buyCatSellVal').textContent  = fmt(sp);
  get('buyCatCostVal').textContent  = cost > 0 ? fmt(cost) : '—';
  get('buyCatInfoStrip').style.display = 'block';

  if (sp > 0) get('buySellingPrice').value = sp;
  calcBuy();
}

function calcBuy() {
  const qty   = parseFloat(get('buyQty').value)   || 0;
  const total = parseFloat(get('buyTotal').value)  || 0;
  const sp    = parseFloat(get('buySellingPrice').value) || 0;
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
      addClass('calcBox', 'show');
    } else {
      get('marginRow').style.display = 'none';
      removeClass('calcBox', 'show');
    }
  } else {
    disp.textContent = '—';
    disp.style.color = 'var(--text3)';
    get('marginRow').style.display = 'none';
    removeClass('calcBox', 'show');
  }
}

async function recordPurchase() {
  const catId = get('buyCategory').value;
  const qty   = get('buyQty').value;
  const total = get('buyTotal').value;
  const sp    = parseFloat(get('buySellingPrice').value) || 0;
  const supp  = get('buySupplier').value;

  if (!catId)               { alert('Select a category'); return; }
  if (!qty   || qty <= 0)   { alert('Enter quantity'); return; }
  if (!total || total <= 0) { alert('Enter wholesale amount'); return; }

  try {
    // Step 1: Record the purchase
    const res = await fetch(`${API_URL}/purchases/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id:    parseInt(catId),
        quantity_bought: parseInt(qty),
        total_paid:      parseFloat(total),
        supplier_name:   supp || null
      })
    });
    const data = await res.json();

    if (res.ok) {
      // Step 2: Update selling price if provided
      // Uses PUT /categories/{id} with {selling_price}
      if (sp > 0) {
        await fetch(`${API_URL}/categories/${catId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selling_price: sp })
        });
      }

      const box = get('buySuccessBox');
      box.innerHTML = `✅ ${qty} pcs added! Cost/pc: ${fmt(data.purchase.cost_per_piece)} · New stock: ${data.stock_update.new_quantity}`;
      box.style.display = 'block';

      // Clear form
      ['buyCategory','buyQty','buyTotal','buySellingPrice','buySupplier']
        .forEach(id => { if(get(id)) get(id).value = ''; });
      get('buyCatInfoStrip').style.display = 'none';
      get('costPerPieceDisplay').textContent = '—';
      removeClass('calcBox', 'show');

      loadCategories();
      showToast(`✅ ${qty} pieces added!`);
      setTimeout(() => { box.style.display = 'none'; }, 5000);
    } else {
      alert('Error: ' + data.detail);
    }
  } catch(e) {
    alert('Cannot connect to server');
  }
}

// ─────────────────────────────────────────
// SELL SCREEN
// ─────────────────────────────────────────
function onSellCategorySelect() {
  const sel = get('sellCategory');
  const opt = sel.options[sel.selectedIndex];

  if (!sel.value) {
    get('stockPillRow').style.display  = 'none';
    get('sellPriceSection').style.display = 'none';
    get('sellQtySection').style.display   = 'none';
    get('clearCatBtn').style.display      = 'none';
    removeClass('itemTotalBox', 'show');
    removeClass('cartButtons',  'show');
    return;
  }

  get('clearCatBtn').style.display = 'block';

  const stock = parseInt(opt.dataset.stock) || 0;
  const pill  = get('stockPill');
  pill.textContent = stock <= 0 ? 'Out of stock' : `📦 ${stock} left`;
  pill.className   = 'pill ' + (
    stock === 0  ? 'pill-red' :
    stock <= 10  ? 'pill-gold' :
    'pill-green'
  );
  get('stockPillRow').style.display = 'flex';

  const sp = parseFloat(opt.dataset.sellingPrice) || 0;
  get('priceDisplayVal').textContent = fmt(sp);
  get('sellPrice').value             = sp;
  get('priceDisplay').style.display  = 'flex';
  get('sellPrice').style.display     = 'none';
  get('sellPriceSection').style.display = 'block';
  get('sellQtySection').style.display   = 'block';
  calcSellTotal();
}

function clearCategorySelection() {
  get('sellCategory').value = '';
  get('sellQty').value      = '';
  get('sellPrice').value    = '';
  get('stockPillRow').style.display     = 'none';
  get('sellPriceSection').style.display = 'none';
  get('sellQtySection').style.display   = 'none';
  get('clearCatBtn').style.display      = 'none';
  removeClass('itemTotalBox', 'show');
  removeClass('cartButtons',  'show');
}

function enablePriceEdit() {
  get('priceDisplay').style.display = 'none';
  const inp = get('sellPrice');
  inp.style.display = 'block';
  inp.focus();
  inp.select();
}

function showPriceDisplay() {
  const val = parseFloat(get('sellPrice').value) || 0;
  get('priceDisplayVal').textContent = fmt(val);
  get('priceDisplay').style.display  = 'flex';
  get('sellPrice').style.display     = 'none';
  calcSellTotal();
}

function calcSellTotal() {
  const qty   = parseFloat(get('sellQty').value)   || 0;
  const price = parseFloat(get('sellPrice').value) || 0;
  if (qty > 0 && price > 0) {
    get('itemTotalVal').textContent = fmt((qty * price).toFixed(2));
    addClass('itemTotalBox', 'show');
    addClass('cartButtons',  'show');
  } else {
    removeClass('itemTotalBox', 'show');
    removeClass('cartButtons',  'show');
  }
}

function addToCart(action) {
  const sel   = get('sellCategory');
  const opt   = sel.options[sel.selectedIndex];
  const qty   = parseFloat(get('sellQty').value);
  const price = parseFloat(get('sellPrice').value);

  if (!sel.value)         { alert('Select category'); return; }
  if (!qty   || qty <= 0) { alert('Enter quantity');  return; }
  if (!price || price<=0) { alert('Enter price');     return; }
  if (qty > parseInt(opt.dataset.stock)) {
    alert(`Only ${opt.dataset.stock} in stock!`);
    return;
  }

  const existing = cart.find(c => c.category_id === parseInt(sel.value));
  if (existing) {
    const newTotal           = existing.item_total + (qty * price);
    existing.quantity       += qty;
    existing.price_per_piece = newTotal / existing.quantity;
    existing.item_total      = newTotal;
    cartTotal               += qty * price;
  } else {
    const item = {
      category_id:    parseInt(sel.value),
      category_name:  opt.dataset.name,
      quantity:       qty,
      price_per_piece: price,
      item_total:     qty * price,
      avg_cost:       parseFloat(opt.dataset.avgCost) || 0
    };
    cart.push(item);
    cartTotal += item.item_total;
  }

  renderCart();

  ['sellCategory','sellQty','sellPrice'].forEach(id => { if(get(id)) get(id).value = ''; });
  get('stockPillRow').style.display     = 'none';
  get('sellPriceSection').style.display = 'none';
  get('sellQtySection').style.display   = 'none';
  get('clearCatBtn').style.display      = 'none';
  removeClass('itemTotalBox', 'show');
  removeClass('cartButtons',  'show');

  loadCategoriesForSell();
  if (action === 'done') showFinalSection();
}

function removeFromCart(i) {
  const item = cart[i];
  showConfirm(
    'Remove Item?',
    `Remove "${item.category_name}" (${item.quantity} pcs × ${fmt(item.price_per_piece)}) from cart?`,
    () => {
      cartTotal -= cart[i].item_total;
      cart.splice(i, 1);
      renderCart();
      loadCategoriesForSell();
      if (cart.length === 0) {
        removeClass('finalSection', 'show');
        get('sellFormArea').style.display    = 'block';
        get('sellDoneOnlyArea').style.display = 'none';
        get('cartCompleteBanner').classList.remove('show');
      } else {
        get('fchCartTotal').textContent = fmt(cartTotal.toFixed(2));
        get('finalActualAmt').value     = cartTotal.toFixed(2);
        calcFinalProfit();
      }
    }
  );
}

function editCartItem(i) {
  _editCartIndex = i;
  const item = cart[i];
  get('editCartTitle').textContent = `✏️ Edit: ${item.category_name}`;
  get('editCartQty').value         = item.quantity;
  get('editCartPrice').value       = item.price_per_piece;
  get('editCartOverlay').classList.add('show');
}

function closeEditCart() {
  get('editCartOverlay').classList.remove('show');
  _editCartIndex = -1;
}

function saveEditCart() {
  if (_editCartIndex < 0) return;
  const newQty   = parseFloat(get('editCartQty').value)   || 0;
  const newPrice = parseFloat(get('editCartPrice').value) || 0;

  if (newQty   <= 0) { alert('Quantity must be more than 0'); return; }
  if (newPrice <= 0) { alert('Price must be more than 0');    return; }

  const item = cart[_editCartIndex];
  const cat  = _categoryCache.find(c => c.id === item.category_id);
  if (cat) {
    const otherInCart = cart
      .filter((_, idx) => idx !== _editCartIndex && _.category_id === item.category_id)
      .reduce((s, c) => s + c.quantity, 0);
    const maxAvail = (cat.current_stock || 0) - otherInCart;
    if (newQty > maxAvail) {
      alert(`Only ${maxAvail} in stock for ${item.category_name}`);
      return;
    }
  }

  cartTotal        -= item.item_total;
  item.quantity     = newQty;
  item.price_per_piece = newPrice;
  item.item_total   = newQty * newPrice;
  cartTotal        += item.item_total;

  renderCart();
  loadCategoriesForSell();

  if (get('finalSection').classList.contains('show')) {
    get('fchCartTotal').textContent = fmt(cartTotal.toFixed(2));
    get('finalActualAmt').value     = cartTotal.toFixed(2);
    calcFinalProfit();
  }

  closeEditCart();
  showToast('✅ Item updated!');
}

function renderCart() {
  const s = get('cartSection');
  if (cart.length === 0) { s.classList.remove('show'); return; }
  s.classList.add('show');
  get('cartTotalDisplay').textContent = fmt(cartTotal.toFixed(2));
  get('cartItems').innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <div style="flex:1">
        <div class="ci-name">${item.category_name}</div>
        <div class="ci-sub">${item.quantity} × ${fmt(item.price_per_piece)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:2px">
        <span class="ci-total">${fmt(item.item_total.toFixed(2))}</span>
        <button class="ci-edit"   onclick="editCartItem(${i})"   title="Edit">✏️</button>
        <button class="ci-remove" onclick="removeFromCart(${i})" title="Remove">✕</button>
      </div>
    </div>`).join('');
}

function showFinalSection() {
  const fs = get('finalSection');
  fs.classList.add('show');
  get('fchCartTotal').textContent = fmt(cartTotal.toFixed(2));
  get('finalActualAmt').value     = cartTotal.toFixed(2);
  calcFinalProfit();
  fs.scrollIntoView({ behavior: 'smooth' });
}

function addMoreItems() {
  removeClass('finalSection', 'show');
  loadCategoriesForSell();
}

function calcFinalProfit() {
  const actual = parseFloat(get('finalActualAmt').value) || 0;
  if (actual <= 0) return;
  let totalCost = 0;
  cart.forEach(i => { totalCost += i.avg_cost * i.quantity; });
  const profit  = actual - totalCost;
  const bargain = cartTotal - actual;
  addClass('profitPreview', 'show');
  get('ppProfit').textContent = fmt(profit.toFixed(2));
  get('ppProfit').className   = 'pp-val ' + (profit < 0 ? 'red' : 'green');
  get('ppBargain').textContent = bargain > 0 ? fmt(bargain.toFixed(2)) : '₹0 (no bargain)';
}

async function saveSale() {
  if (cart.length === 0)           { alert('No items in cart'); return; }
  const actual = parseFloat(get('finalActualAmt').value);
  if (!actual || actual <= 0)      { alert('Enter amount received'); return; }

  const ratio = actual / cartTotal;
  try {
    let tp = 0, tb = 0;
    for (const item of cart) {
      const ia  = item.price_per_piece * ratio;
      const res = await fetch(`${API_URL}/sales/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          category_id:    item.category_id,
          quantity_sold:  item.quantity,
          original_price: item.price_per_piece,
          actual_price:   parseFloat(ia.toFixed(2))
        })
      });
      const data = await res.json();
      if (res.ok) {
        tp += data.profit_summary.profit_made;
        tb += data.profit_summary.bargain_loss;
      }
    }
    get('sellSuccessBox').innerHTML  = `✅ Sale saved! Profit: ${fmt(tp.toFixed(2))} | Bargain: ${fmt(tb.toFixed(2))}`;
    get('sellSuccessBox').style.display = 'block';
    showToast(`✅ Sale saved! Profit: ${fmt(tp.toFixed(2))}`);
    resetSellScreen();
    loadHomeData();
    setTimeout(() => { get('sellSuccessBox').style.display = 'none'; }, 5000);
  } catch(e) {
    alert('Cannot connect to server');
  }
}

function resetSellScreen() {
  cart      = [];
  cartTotal = 0;
  ['sellCategory','sellQty','sellPrice','finalActualAmt']
    .forEach(id => { if(get(id)) get(id).value = ''; });
  get('cartItems').innerHTML = '';
  get('cartSection').classList.remove('show');
  get('stockPillRow').style.display     = 'none';
  get('sellPriceSection').style.display = 'none';
  get('sellQtySection').style.display   = 'none';
  get('sellFormArea').style.display     = 'block';
  get('sellDoneOnlyArea').style.display = 'none';
  get('cartCompleteBanner').classList.remove('show');
  if (get('clearCatBtn')) get('clearCatBtn').style.display = 'none';
  ['itemTotalBox','cartButtons','finalSection','profitPreview']
    .forEach(id => removeClass(id, 'show'));
  get('sellInfoBox').style.display    = 'none';
  get('sellSuccessBox').style.display = 'none';
}

// ─────────────────────────────────────────
// CONFIRM DIALOG
// ─────────────────────────────────────────
function showConfirm(title, msg, callback) {
  get('confirmTitle').textContent = title;
  get('confirmMsg').textContent   = msg;
  _confirmCallback = callback;
  get('confirmOverlay').classList.add('show');
}
function confirmOk() {
  get('confirmOverlay').classList.remove('show');
  if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
}
function confirmCancel() {
  get('confirmOverlay').classList.remove('show');
  _confirmCallback = null;
}

// ─────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────
function showDashTab(tab, btn) {
  document.querySelectorAll('#seeScreen .tab-content')
    .forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#seeScreen .tab-btn')
    .forEach(b => b.classList.remove('active'));
  const map = {
    today:      'dashToday',
    month:      'dashMonth',
    stock:      'dashStock',
    top:        'dashTop',
    categories: 'dashCategories'
  };
  if (get(map[tab])) get(map[tab]).classList.add('active');
  btn.classList.add('active');
  if (tab === 'today')      loadDashToday();
  if (tab === 'month')      loadDashMonth();
  if (tab === 'stock')      loadDashStock();
  if (tab === 'top')        loadDashTop();
  if (tab === 'categories') loadCatMgmt();
}

async function loadDashToday() {
  try {
    const res  = await fetch(`${API_URL}/dashboard/today`);
    const data = await res.json();
    const s    = data.sales_summary;
    get('dRevenue').textContent = fmt(s.total_revenue);
    get('dProfit').textContent  = fmt(s.total_profit);
    get('dBargain').textContent = fmt(s.total_bargain_loss);
    get('dItems').textContent   = s.total_items_sold || 0;
  } catch(e) {}
}

async function loadDashMonth() {
  try {
    const res  = await fetch(`${API_URL}/dashboard/month`);
    const data = await res.json();
    const s    = data.summary;
    get('mRevenue').textContent = fmt(s.total_revenue);
    get('mProfit').textContent  = fmt(s.total_profit);
    get('mBargain').textContent = fmt(s.total_bargain_loss);
    get('mBestDay').textContent = data.best_day?.date || '—';
  } catch(e) {}
  loadMonthSoldItems();
}

async function loadMonthSoldItems() {
  const c = get('monthSoldList');
  if (!c) return;
  c.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">Loading...</div>';
  try {
    const now  = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const to   = now.toISOString().split('T')[0];

    const [salesRes, catRes, todayRes] = await Promise.all([
      fetch(`${API_URL}/sales/history?from_date=${from}&to_date=${to}`),
      fetch(`${API_URL}/categories/`),
      fetch(`${API_URL}/sales/?date=${to}`)
    ]);
    const salesData = await salesRes.json();
    const catData   = await catRes.json();
    const todayData = await todayRes.json();

    const catNameMap = buildCatNameMap(catData.categories);
    const histSales  = (salesData.sales || []).map(s => ({
      ...s, category_name: resolveCatName(s, catNameMap)
    }));
    const seenIds    = new Set(histSales.map(s => s.id));
    const todaySales = (todayData.sales || [])
      .filter(s => !seenIds.has(s.id))
      .map(s => ({ ...s, category_name: resolveCatName(s, catNameMap) }));
    const merged = [...histSales, ...todaySales];

    if (!merged.length) {
      c.innerHTML = '<div class="empty-state" style="padding:20px"><div class="es-icon" style="font-size:30px">📦</div><div class="es-title">No sales this month yet</div></div>';
      return;
    }

    const catMap = {};
    merged.forEach(s => {
      const name = s.category_name;
      if (!catMap[name]) catMap[name] = { qty:0, revenue:0, profit:0, bargain:0 };
      catMap[name].qty     += s.quantity_sold || 0;
      catMap[name].revenue += (s.actual_price || 0) * (s.quantity_sold || 0);
      catMap[name].profit  += getSaleProfit(s);
      catMap[name].bargain += s.bargain_loss || 0;
    });

    const sorted = Object.entries(catMap).sort((a, b) => b[1].revenue - a[1].revenue);
    const medals = ['🥇','🥈','🥉'];
    let html = '<div class="hist-items-list">';
    sorted.forEach(([name, d], i) => {
      html += `
        <div class="hist-sale-row">
          <div class="hsr-left">
            <div class="hsr-name">${medals[i] || '▪️'} ${name}</div>
            <div class="hsr-meta">${d.qty} pcs sold${d.bargain > 0 ? ` · bargain ${fmt(d.bargain)}` : ''}</div>
          </div>
          <div class="hsr-right">
            <div class="hsr-total">${fmt(d.revenue)}</div>
            <div class="hsr-profit" style="color:${d.profit>0?'var(--green)':d.profit<0?'var(--danger)':'var(--text3)'}">
              ${d.profit >= 0 ? '+' : ''}${fmt(d.profit)} profit
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
    c.innerHTML = html;
  } catch(e) {
    c.innerHTML = `<div style="padding:16px;color:var(--danger);font-size:13px">Could not load month data: ${e.message}</div>`;
  }
}

async function loadDashStock() {
  try {
    const res  = await fetch(`${API_URL}/dashboard/stock-alerts`);
    const data = await res.json();
    const c    = get('stockList');
    c.innerHTML = '';
    const all = [
      ...data.alerts.out_of_stock.categories.map(i => ({...i, level:'danger'})),
      ...data.alerts.low_stock.categories.map(i =>    ({...i, level:'warning'})),
      ...data.alerts.healthy.categories.map(i =>      ({...i, level:'good'}))
    ];
    if (!all.length) {
      c.innerHTML = '<div class="empty-state"><div class="es-icon">📦</div><div class="es-title">No stock data yet</div></div>';
      return;
    }
    all.forEach(item => {
      const e = item.level === 'danger' ? '🔴' : item.level === 'warning' ? '🟡' : '🟢';
      c.innerHTML += `
        <div class="stock-row ${item.level}">
          <div>
            <div class="sk-name">${item.category}</div>
            <div class="sk-meta">Avg cost: ${fmt(item.avg_cost)}</div>
          </div>
          <div class="sk-qty ${item.level}">${e} ${item.current_stock}</div>
        </div>`;
    });
  } catch(e) {}
}

async function loadDashTop() {
  try {
    const res  = await fetch(`${API_URL}/dashboard/top-categories`);
    const data = await res.json();
    const c    = get('topList');
    c.innerHTML = '';
    const cats = data.top_categories || [];
    if (!cats.length) {
      c.innerHTML = '<div class="empty-state"><div class="es-icon">🏆</div><div class="es-title">No sales data yet</div></div>';
      return;
    }
    const medals = ['🥇','🥈','🥉'];
    cats.forEach((cat, i) => {
      c.innerHTML += `
        <div class="top-row">
          <div class="top-row-header">
            <span class="top-row-name">${medals[i] || '▪️'} ${cat.category}</span>
            <span class="top-row-profit">${fmt(cat.total_profit)}</span>
          </div>
          <div class="top-row-stats">
            <span class="top-stat">Revenue: <strong>${fmt(cat.total_revenue)}</strong></span>
            <span class="top-stat">Bargain: <strong>${fmt(cat.total_bargain_loss)}</strong></span>
            <span class="top-stat">Stock: <strong>${cat.current_stock}</strong></span>
          </div>
        </div>`;
    });
  } catch(e) {}
}

// ─────────────────────────────────────────
// CATEGORY MANAGEMENT (Dashboard → Categories tab)
// ─────────────────────────────────────────
async function loadCatMgmt() {
  const c = get('catMgmtList');
  if (!c) return;
  c.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">Loading...</div>';
  try {
    const res  = await fetch(`${API_URL}/categories/`);
    const data = await res.json();
    const cats = data.categories || [];

    if (!cats.length) {
      c.innerHTML = '<div class="empty-state"><div class="es-icon">🏷️</div><div class="es-title">No categories yet</div><div class="es-sub">Add categories from Buy screen</div></div>';
      return;
    }

    const card = document.createElement('div');
    card.className    = 'card';
    card.style.overflow = 'hidden';

    cats.forEach(cat => {
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="price-row" onclick="toggleCatEdit(${cat.id})">
          <div style="flex:1">
            <div class="eci-name">${cat.name}</div>
            <div style="display:flex;gap:8px;margin-top:3px;flex-wrap:wrap">
              <span style="font-size:11px;color:var(--text3)">Stock: <strong style="color:var(--text2)" id="cmgmt-stock-${cat.id}">${cat.current_stock||0}</strong></span>
              <span style="font-size:11px;color:var(--text3)">Sell: <strong style="color:var(--green)" id="cmgmt-price-${cat.id}">${fmt(cat.selling_price||0)}</strong></span>
              <span style="font-size:11px;color:var(--text3)">Avg cost: <strong style="color:var(--text2)">${fmt(cat.avg_cost||0)}</strong></span>
            </div>
          </div>
          <button class="eci-edit-btn">✏️ Edit</button>
        </div>
        <div class="eci-edit-row" id="cmgmt-row-${cat.id}" style="flex-direction:column;gap:10px;padding:14px">
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px">📝 Category Name</div>
            <input type="text" class="eci-name-input" id="cmgmt-name-${cat.id}" value="${cat.name}" placeholder="Category name">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px">Selling Price ₹</div>
              <input type="number" class="eci-edit-input" id="cmgmt-sell-${cat.id}" value="${cat.selling_price||0}" inputmode="numeric" placeholder="0">
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px">Add Stock Qty</div>
              <input type="number" class="eci-edit-input" id="cmgmt-qty-${cat.id}" placeholder="0" inputmode="numeric">
            </div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px">Wholesale Amount ₹</div>
            <input type="number" class="eci-edit-input" id="cmgmt-ws-${cat.id}" placeholder="Total paid for the qty above" inputmode="numeric">
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-green btn-sm" style="flex:1" onclick="saveCatMgmt(${cat.id})">✅ Save</button>
            <button class="btn btn-outline btn-sm" onclick="toggleCatEdit(${cat.id})">Cancel</button>
          </div>
        </div>`;
      card.appendChild(div);
    });

    c.innerHTML = '';
    c.appendChild(card);
  } catch(e) {
    c.innerHTML = '<div class="empty-state"><div class="es-icon">⚠️</div><div class="es-title">Could not load categories</div></div>';
  }
}

function toggleCatEdit(id) {
  const row = get(`cmgmt-row-${id}`);
  if (!row) return;
  row.classList.toggle('show');
  if (row.classList.contains('show')) {
    const nameInput = get(`cmgmt-name-${id}`);
    if (nameInput) nameInput.focus();
  }
}

async function saveCatMgmt(id) {
  const newName   = get(`cmgmt-name-${id}`).value.trim();
  const sellPrice = parseFloat(get(`cmgmt-sell-${id}`).value);
  const addQty    = parseInt(get(`cmgmt-qty-${id}`).value)   || 0;
  const wholesale = parseFloat(get(`cmgmt-ws-${id}`).value)  || 0;

  if (!newName)                          { alert('Category name cannot be empty'); return; }
  if (isNaN(sellPrice) || sellPrice < 0) { alert('Enter a valid selling price');   return; }
  if (addQty > 0 && wholesale <= 0)      { alert('Enter wholesale amount for the added quantity'); return; }

  try {
    await fetch(`${API_URL}/categories/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: newName, selling_price: sellPrice })
    });

    if (addQty > 0 && wholesale > 0) {
      const r2 = await fetch(`${API_URL}/purchases/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ category_id: id, quantity_bought: addQty, total_paid: wholesale })
      });
      if (r2.ok) {
        const d2      = await r2.json();
        const stockEl = get(`cmgmt-stock-${id}`);
        if (stockEl) stockEl.textContent = d2.stock_update?.new_quantity || '—';
      }
    }

    const priceEl = get(`cmgmt-price-${id}`);
    if (priceEl) priceEl.textContent = fmt(sellPrice);

    const nameEl = get(`cmgmt-row-${id}`)?.parentElement?.querySelector('.eci-name');
    if (nameEl) nameEl.textContent = newName;

    get(`cmgmt-row-${id}`).classList.remove('show');
    get(`cmgmt-qty-${id}`).value = '';
    get(`cmgmt-ws-${id}`).value  = '';

    loadCategories();
    showToast('✅ Category updated!');
  } catch(e) {
    alert('Cannot connect to server');
  }
}

// ─────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────
function initHistoryTab() {
  const now      = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(now.getDate() - 29);
  get('histFrom').value = fromDate.toISOString().split('T')[0];
  get('histTo').value   = now.toISOString().split('T')[0];
  loadHistory();
}

async function loadHistory() {
  const from = get('histFrom').value;
  const to   = get('histTo').value;
  if (!from || !to) return;

  const c = get('histList');
  c.innerHTML = '<div class="hist-loading">Loading...</div>';

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const [histRes, catRes, todayRes] = await Promise.all([
      fetch(`${API_URL}/sales/history?from_date=${from}&to_date=${to}`),
      fetch(`${API_URL}/categories/`),
      fetch(`${API_URL}/sales/?date=${todayStr}`)
    ]);
    const data      = await histRes.json();
    const catData   = await catRes.json();
    const todayData = await todayRes.json();

    const catNameMap = buildCatNameMap(catData.categories);
    const histSales  = (data.sales || []).map(s => ({
      ...s, category_name: resolveCatName(s, catNameMap)
    }));
    const seenIds    = new Set(histSales.map(s => s.id));
    const todaySales = (todayData.sales || [])
      .filter(s => !seenIds.has(s.id))
      .map(s => ({ ...s, category_name: resolveCatName(s, catNameMap) }));
    const allSales   = [...histSales, ...todaySales];
    const purchases  = (data.purchases || []).map(p => ({
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
  document.querySelectorAll('.htype-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderHistoryDays();
}

function safeDateKey(raw) {
  if (!raw) return null;
  if (typeof raw === 'string' && raw.length >= 10) return raw.substring(0, 10);
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

function safeTimeStr(raw) {
  if (!raw) return '';
  const normalized = raw.replace(' ', 'T');
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}

function getSaleDate(s) {
  return s.sale_datetime || s.sale_date || s.created_at || null;
}

function getSaleProfit(s) {
  if (s.profit_made != null) return s.profit_made;
  if (s.profit      != null) return s.profit;
  return 0;
}

function buildCatNameMap(categories) {
  const m = {};
  (categories || []).forEach(c => {
    m[c.id]         = c.name;
    m[String(c.id)] = c.name;
  });
  return m;
}

function resolveCatName(record, catNameMap) {
  if (record.category_name &&
      record.category_name !== 'Unknown' &&
      record.category_name !== 'Unknown Item') {
    return record.category_name;
  }
  const id = record.category_id;
  return catNameMap[id] || catNameMap[String(id)] || catNameMap[parseInt(id)] || '⚠️ Unknown';
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

  const dates = Object.keys(dayMap).sort((a, b) => b.localeCompare(a));
  if (!dates.length) {
    c.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text3)"><div style="font-size:40px;margin-bottom:8px">📋</div><div style="font-size:14px;font-weight:600;color:var(--text2)">No records found</div><div style="font-size:12px;margin-top:4px">Try a different date range</div></div>';
    return;
  }

  dates.forEach(date => {
    const day     = dayMap[date];
    const revenue = day.sales.reduce((s,x)=>s+((x.actual_price||0)*(x.quantity_sold||0)),0);
    const profit  = day.sales.reduce((s,x)=>s+getSaleProfit(x),0);
    const bargain = day.sales.reduce((s,x)=>s+(x.bargain_loss||0),0);
    const items   = day.sales.reduce((s,x)=>s+(x.quantity_sold||0),0);
    const spent   = day.purchases.reduce((s,x)=>s+(x.total_paid||0),0);

    const dt   = new Date(date + 'T00:00:00');
    const dow  = dt.toLocaleDateString('en-IN', { weekday:'long' });
    const nice = dt.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    const id   = 'hday-' + date.replace(/-/g,'');

    const hasSales = day.sales.length > 0;
    const hasBuys  = day.purchases.length > 0;
    const profitColor = profit > 0 ? 'var(--green)' : profit < 0 ? 'var(--danger)' : 'var(--text3)';

    const soldRows = day.sales.map(s => {
      const total       = (s.actual_price||0) * (s.quantity_sold||0);
      const perPiece    = s.actual_price || 0;
      const orig        = s.original_price || 0;
      const wasBargained = orig > 0 && perPiece < orig;
      const saleTime    = safeTimeStr(getSaleDate(s));
      const p           = getSaleProfit(s);
      const pColor      = p > 0 ? 'var(--green-mid)' : p < 0 ? 'var(--danger)' : 'var(--text3)';
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
            <div class="hsr-profit" style="color:${pColor}">${p>=0?'+':''}${fmt(p)} profit</div>
          </div>
        </div>`;
    }).join('');

    const buyRows = day.purchases.map(p => `
      <div class="hist-buy-row">
        <div>
          <div class="hbr-name">🛒 ${p.category_name || 'Stock'}</div>
          <div class="hbr-meta">${p.quantity_bought} pcs · ₹${(p.total_paid/p.quantity_bought).toFixed(2)}/pc</div>
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
            ${hasBuys &&  hasSales ? `<span class="pill pill-orange" style="font-size:10px;margin-right:4px">+stock</span>` : ''}
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
              <button onclick="event.stopPropagation();showTodaySoldItems('${date}')"
                style="font-size:11px;font-weight:700;color:var(--green);background:var(--green-lite);border:1px solid rgba(26,107,60,0.2);border-radius:6px;padding:3px 10px;cursor:pointer;font-family:'Poppins',sans-serif">
                View All ↗
              </button>
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
  const el   = get(id);
  const chev = get('chev-' + id);
  if (el)   el.classList.toggle('show');
  if (chev) chev.classList.toggle('open');
}

// ─────────────────────────────────────────
// TODAY SOLD ITEMS MODAL
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
  lbl.textContent   = dt.toLocaleDateString('en-IN', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });
  body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3)">Loading...</div>';
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';

  try {
    const [salesRes, catRes] = await Promise.all([
      fetch(`${API_URL}/sales/?date=${date}`),
      fetch(`${API_URL}/categories/`)
    ]);
    const salesData = await salesRes.json();
    const catData   = await catRes.json();
    const catNameMap = buildCatNameMap(catData.categories);
    const sales = (salesData.sales || []).map(s => ({
      ...s, category_name: resolveCatName(s, catNameMap)
    }));

    if (!sales.length) {
      body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">
        <div style="font-size:40px;margin-bottom:10px">📦</div>
        <div style="font-size:14px;font-weight:600;color:var(--text2)">
          ${isToday ? 'No sales yet today' : 'No sales on this day'}
        </div></div>`;
      return;
    }

    const totalRev     = sales.reduce((s,x) => s+((x.actual_price||0)*(x.quantity_sold||0)), 0);
    const totalProfit  = sales.reduce((s,x) => s+getSaleProfit(x), 0);
    const totalBargain = sales.reduce((s,x) => s+(x.bargain_loss||0), 0);
    const totalItems   = sales.reduce((s,x) => s+(x.quantity_sold||0), 0);

    let html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <div class="hd-cell"><div class="hd-lbl">Revenue</div><div class="hd-val green">${fmt(totalRev)}</div></div>
        <div class="hd-cell"><div class="hd-lbl">Profit</div><div class="hd-val" style="color:${totalProfit>0?'var(--green)':totalProfit<0?'var(--danger)':'var(--text)'}">${fmt(totalProfit)}</div></div>
        <div class="hd-cell"><div class="hd-lbl">Bargain Loss</div><div class="hd-val orange">${fmt(totalBargain)}</div></div>
        <div class="hd-cell"><div class="hd-lbl">Items Sold</div><div class="hd-val">${totalItems}</div></div>
      </div>
      <div class="hist-section-label" style="border-top:none;padding-top:0;margin-bottom:8px">
        All Sales · ${sales.length} transaction${sales.length!==1?'s':''}
      </div>
      <div class="hist-items-list">`;

    sales.forEach(s => {
      const total     = (s.actual_price||0) * (s.quantity_sold||0);
      const orig      = s.original_price || 0;
      const actual    = s.actual_price   || 0;
      const bargained = orig > 0 && actual < orig;
      const saleTime  = safeTimeStr(getSaleDate(s) || '');
      const profit    = getSaleProfit(s);
      html += `
        <div class="hist-sale-row">
          <div class="hsr-left">
            <div class="hsr-name">${s.category_name}</div>
            <div class="hsr-meta">
              <span>${s.quantity_sold} pc × ${fmt(actual)}</span>
              ${bargained ? `<span class="hsr-bargain">${fmt(orig)}</span>` : ''}
              ${saleTime  ? `<span>🕐 ${saleTime}</span>` : ''}
            </div>
          </div>
          <div class="hsr-right">
            <div class="hsr-total">${fmt(total)}</div>
            <div class="hsr-profit" style="color:${profit>0?'var(--green-mid)':profit<0?'var(--danger)':'var(--text3)'}">
              ${profit>=0?'+':''}${fmt(profit)} profit
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = `<div style="text-align:center;padding:30px;color:var(--danger)">
      Could not load sales data<br><small>${e.message}</small></div>`;
  }
}

function closeSoldModal() {
  get('soldModal').classList.remove('show');
  document.body.style.overflow = '';
}

// ─────────────────────────────────────────
// TOAST NOTIFICATION
// ─────────────────────────────────────────
function showToast(message) {
  const toast = document.getElementById('successToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// ─────────────────────────────────────────
// DEBUG PANEL (tap logo 5 times)
// ─────────────────────────────────────────
async function openDebugPanel() {
  const today = new Date().toISOString().split('T')[0];
  let info = `📡 API: ${API_URL}\n📅 Today: ${today}\n\n`;
  try {
    const r = await fetch(`${API_URL}/sales/?date=${today}`);
    const d = await r.json();
    info += `Sales today: ${(d.sales||[]).length}\n`;
    info += `Summary: ${JSON.stringify(d.summary)}\n\n`;
  } catch(e) { info += `sales error: ${e.message}\n\n`; }
  try {
    const r = await fetch(`${API_URL}/categories/`);
    const d = await r.json();
    info += `Categories: ${(d.categories||[]).length}\n`;
  } catch(e) { info += `categories error: ${e.message}\n`; }
  alert(info);
}
