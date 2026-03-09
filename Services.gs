/**
 * @file Services.gs
 * @description Logika bisnis utama (CRUD) - Final Revision (Fix Batch Scientific Notation).
 */

// =================================================================
// 0. INTERNAL HELPER
// =================================================================

function normalizeCode_(input) {
  if (input === null || input === undefined) return "";
  let str = String(input).trim();
  if (str.length === 6 && !isNaN(str)) {
    return "0" + str;
  }
  return str;
}

// =================================================================
// 1. HELPER FUNCTIONS
// =================================================================

function getProcodeExcludeList() {
  const cacheKey = "PROCODE_EXCLUDE_LIST";
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);

  if (cached) return JSON.parse(cached);

  try {
    const data = fetchSupabase('procode_exclude?select=product_code', 'GET');
    if (data && Array.isArray(data)) {
      const list = data.map(item => normalizeCode_(item.product_code));
      cache.put(cacheKey, JSON.stringify(list), CONFIG.APP.CACHE_DURATION);
      return list;
    }
    return [];
  } catch (e) {
    console.error("[getProcodeExcludeList Error]", e);
    return [];
  }
}

function getProductPrices() {
  const cacheKey = "PRODUCT_PRICES_LIST";
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);

  if (cached) return JSON.parse(cached);

  try {
    const data = fetchSupabase('master_products?select=product_code,price_non_member,price_discounted&limit=10000', 'GET');
    if (data && Array.isArray(data)) {
      const prices = {};
      data.forEach(p => {
        const key = normalizeCode_(p.product_code);
        prices[key] = { normal: p.price_non_member, disc: p.price_discounted };
      });
      try { cache.put(cacheKey, JSON.stringify(prices), CONFIG.APP.CACHE_DURATION); } catch (e) {}
      return prices;
    }
    return {};
  } catch (e) {
    console.error("[getProductPrices Error]", e);
    return {};
  }
}

// =================================================================
// 2. CORE FUNCTIONS
// =================================================================

function getProductMaster() {
  return getProductMaster_Paginated(); 
}

function getProductMaster_Paginated() {
  const cacheKey = "MASTER_PRODUCT_LIST_PAGINATED_V4";
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);

  if (cached) return JSON.parse(cached);

  let allProducts = [];
  let offset = 0;
  const limit = 1000;
  let keepFetching = true;

  try {
    while (keepFetching) {
      const rangeStart = offset;
      const rangeEnd = offset + limit - 1;
      const url = `${CONFIG.SUPABASE.URL}/rest/v1/master_products?select=product_code,item_description,barcode,uom`;
      const options = {
        method: 'GET',
        headers: { ...CONFIG.SUPABASE.HEADERS, 'Range': `${rangeStart}-${rangeEnd}` },
        muteHttpExceptions: true
      };

      const response = UrlFetchApp.fetch(url, options);
      const data = JSON.parse(response.getContentText());

      if (data && Array.isArray(data) && data.length > 0) {
        const mappedChunk = data.map(item => ({
          code: normalizeCode_(item.product_code),
          name: item.item_description,
          barcode: item.barcode ? String(item.barcode).trim() : "",
          uom: item.uom
        }));
        allProducts = allProducts.concat(mappedChunk);
        if (data.length < limit) keepFetching = false;
        else offset += limit;
      } else {
        keepFetching = false;
      }
    }
    try { cache.put(cacheKey, JSON.stringify(allProducts), CONFIG.APP.CACHE_DURATION); } catch (e) {}
    return allProducts;
  } catch (e) {
    console.error("[getProductMaster Error]", e);
    return [];
  }
}

function getProductInfo(keyword) {
  try {
    const cleanKey = normalizeCode_(keyword);
    const endpoint = `master_products?or=(product_code.eq.${cleanKey},barcode.eq.${cleanKey})&select=*&limit=1`;
    const result = fetchSupabase(endpoint, 'GET');

    if (result && result.length > 0) {
      const p = result[0];
      return {
        code: normalizeCode_(p.product_code),
        name: p.item_description,
        uom: p.uom,
        price: p.price_non_member
      };
    }
    return null;
  } catch (e) {
    console.error("[getProductInfo Error]", e);
    throw new Error("Gagal mengambil data produk.");
  }
}

function getOutletStock(outletCode) {
  try {
    const endpoint = `stocks_ed?outlet_code=eq.${outletCode}&order=expired_date.asc&select=*`;
    const stocks = fetchSupabase(endpoint, 'GET');

    if (!stocks || stocks.length === 0) return [];

    const masterProducts = getProductMaster(); 
    const prices = getProductPrices();
    const excludes = getProcodeExcludeList();
    
    const productMap = new Map();
    masterProducts.forEach(p => {
      if (p.barcode) productMap.set(String(p.barcode).trim(), p);
      if (p.code) productMap.set(p.code, p);
    });

    const today = new Date(2026, 0, 26); 
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const hardLimitDate = new Date(2026, 8, 30); 

    const result = [];

    stocks.forEach(item => {
      const edDate = new Date(item.expired_date);
      if (edDate > hardLimitDate) return;

      const storedCode = normalizeCode_(item.product_code);
      const productInfo = productMap.get(storedCode);
      const productName = productInfo ? productInfo.name : `(Unknown: ${storedCode})`;
      const realProductCode = productInfo ? productInfo.code : storedCode;

      const monthDiff = (edDate.getFullYear() - currentYear) * 12 + (edDate.getMonth() - currentMonth);
      
      let category = 'other';
      let status = 'normal';
      
      if (edDate < new Date(2025, 8, 1)) { 
         category = 'expired'; status = 'expired';
      } else if (edDate <= new Date(2025, 11, 31)) { 
         category = 'expired'; status = 'expired';
      } else if (monthDiff === 0) { 
         category = 'bulan_ini'; status = 'urgent-high';
      } else if (monthDiff >= 1 && monthDiff <= 3) { 
         category = '1_3_bulan'; status = 'urgent-high';
      } else if (monthDiff >= 4 && monthDiff <= 6) { 
         category = '4_6_bulan'; status = 'urgent-medium';
      } else if (monthDiff >= 7 && monthDiff <= 8) { 
         category = '7_12_bulan'; status = 'urgent-low';
      }

      let autoRemark = '';
      if (category === 'bulan_ini' || category === '1_3_bulan' || category === '4_6_bulan') {
        if (!excludes.includes(realProductCode)) {
          const price = prices[realProductCode];
          if (price && price.normal && price.disc) {
            autoRemark = `Diskon 40% Rp ${formatRupiah(price.normal)} -> Rp ${formatRupiah(price.disc)}`;
          }
        }
      }

      result.push({
        id: item.id,
        productCode: storedCode,
        productName: productName,
        // FIX BUG 1: Paksa Batch ID menjadi String agar tidak jadi Scientific Notation
        batchId: String(item.batch_id).trim(), 
        qty: item.qty,
        edDate: formatDateUI(edDate),
        edDateRaw: item.expired_date,
        remark: item.remark || '',
        autoRemark: autoRemark,
        category: category,
        status: status
      });
    });

    return result;

  } catch (e) {
    console.error("[getOutletStock Error]", e);
    throw new Error("Gagal memuat data stok: " + e.message);
  }
}

function saveShortEdReport(payload) {
  try {
    if (!payload.outlet_code || !payload.product_code) return { success: false, message: "Data tidak lengkap." };

    const cleanProductCode = normalizeCode_(payload.product_code);
    let barcodeToSave = cleanProductCode; 
    
    try {
      const pData = fetchSupabase(`master_products?product_code=eq.${cleanProductCode}&select=barcode`, 'GET');
      if (pData && pData.length > 0 && pData[0].barcode) {
        barcodeToSave = String(pData[0].barcode).trim();
      }
    } catch (err) {
      console.warn("Gagal lookup barcode, menggunakan product code asli.", err);
    }

    const stockData = {
      outlet_code: payload.outlet_code,
      product_code: barcodeToSave,
      batch_id: String(payload.batch_id).toUpperCase().trim(), // Ensure String
      expired_date: payload.expired_date,
      qty: parseFloat(payload.qty),
      remark: payload.remark || '',
      created_at: new Date().toISOString()
    };

    fetchSupabase('stocks_ed', 'POST', stockData);
    
    const logData = {
      product_code: barcodeToSave,
      batch_id: String(payload.batch_id).toUpperCase().trim(), // Ensure String
      action_type: "INSERT_OUTLET",
      action_details: { 
        outlet_code: payload.outlet_code, 
        qty: parseFloat(payload.qty),
        remark: payload.remark || ''
      },
      edited_by: payload.user_name,
      last_edited: new Date().toISOString()
    };
    
    fetchSupabase('log_procurement', 'POST', logData);

    return { success: true, message: "Data berhasil disimpan." };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function bulkUpdateShortEd(dataArray) {
  try {
    if (!dataArray || dataArray.length === 0) return { success: false, message: "Data kosong." };

    const upsertData = dataArray.map(item => {
      const row = {
        qty: parseFloat(item.qty),
        remark: item.remark,
        batch_id: String(item.batch_id).trim(), // Ensure String
        expired_date: item.expired_date,
      };
      
      if (item.id) row.id = item.id;
      else {
        row.outlet_code = item.outlet_code;
        row.product_code = normalizeCode_(item.product_code);
        row.created_at = new Date().toISOString();
      }
      return row;
    });

    const url = `${CONFIG.SUPABASE.URL}/rest/v1/stocks_ed`;
    const options = {
      method: 'POST',
      headers: { ...CONFIG.SUPABASE.HEADERS, 'Prefer': 'resolution=merge-duplicates' },
      payload: JSON.stringify(upsertData),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() >= 300) throw new Error(response.getContentText());

    return { success: true, message: `Berhasil update ${dataArray.length} data.` };

  } catch (e) {
    return { success: false, message: "Gagal update massal: " + e.message };
  }
}

function processProcurementAction(payload) {
  try {
    const logData = {
      action_type: payload.actionType,
      product_code: normalizeCode_(payload.productCode),
      batch_id: String(payload.batchId).trim(), 
      action_details: payload.details,
      edited_by: payload.user.name,
      last_edited: new Date().toISOString()
    };

    fetchSupabase('log_procurement', 'POST', logData);
    return { success: true, message: "Aksi berhasil disimpan." };
  } catch (e) {
    console.error("[processProcurementAction Error]", e);
    return { success: false, message: "Gagal memproses aksi: " + e.message };
  }
}