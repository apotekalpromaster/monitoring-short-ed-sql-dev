// --- START OF FILE Management.gs ---

/**
 * @file Management.gs
 * @description Logika Backend khusus untuk Dashboard Management (AM/BOD).
 * REVISI V2.1: Perbaikan query master_products untuk menyertakan Supplier & Cost.
 */

function getAMDashboardData(amName) {
  try {
    // 1. Ambil Daftar Outlet
    const outletEndpoint = `master_outlets?am_name=eq.${encodeURIComponent(amName)}&select=outlet_code,outlet_name`;
    const outlets = fetchSupabase(outletEndpoint, 'GET');

    if (!outlets || outlets.length === 0) return { error: "Tidak ada outlet." };

    const outletCodes = outlets.map(o => o.outlet_code);
    const outletMap = {}; 
    outlets.forEach(o => outletMap[o.outlet_code] = o.outlet_name);

    // 2. Ambil Data Stok
    const stockEndpoint = `stocks_ed?outlet_code=in.(${outletCodes.join(',')})&expired_date=gte.2025-09-01&expired_date=lte.2026-09-30&select=product_code,outlet_code,qty,expired_date`;
    const stocks = fetchSupabase(stockEndpoint, 'GET');

    // 3. Mapping Produk & Harga
    const productMaster = getProductMaster(); 
    const prices = getProductPrices(); 
    const productInfoMap = {};
    
    productMaster.forEach(p => {
      const info = { name: p.name, price: (prices[normalizeCode_(p.code)] || {}).normal || 0 };
      if (p.barcode) productInfoMap[normalizeCode_(p.barcode)] = info;
      productInfoMap[normalizeCode_(p.code)] = info;
    });

    // 4. Struktur Data Baru: Agregasi Per Outlet
    const outletData = {};

    // Inisialisasi
    outlets.forEach(o => {
      outletData[o.outlet_name] = {
        riskValue: 0,
        expiredValue: 0,
        riskSkus: new Set(),
        distribution: { 'bulan_ini': 0, '1_3_bulan': 0, '4_6_bulan': 0, '7_12_bulan': 0 },
        productRisks: {} 
      };
    });

    const today = new Date(2026, 0, 26); 
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const riskStartDate = new Date(2026, 0, 1); 

    // 5. Loop & Kalkulasi
    stocks.forEach(item => {
      const storedCode = normalizeCode_(item.product_code);
      const info = productInfoMap[storedCode] || { name: `Unknown (${storedCode})`, price: 0 };
      const value = item.qty * info.price;
      const edDate = new Date(item.expired_date);
      const outletName = outletMap[item.outlet_code] || item.outlet_code;
      
      const data = outletData[outletName];
      if (!data) return; 

      if (edDate < riskStartDate) {
        data.expiredValue += value;
      } else {
        data.riskValue += value;
        data.riskSkus.add(storedCode);
        
        if (!data.productRisks[info.name]) data.productRisks[info.name] = 0;
        data.productRisks[info.name] += value;

        const monthDiff = (edDate.getFullYear() - currentYear) * 12 + (edDate.getMonth() - currentMonth);
        if (monthDiff === 0) data.distribution['bulan_ini'] += value;
        else if (monthDiff >= 1 && monthDiff <= 3) data.distribution['1_3_bulan'] += value;
        else if (monthDiff >= 4 && monthDiff <= 6) data.distribution['4_6_bulan'] += value;
        else if (monthDiff >= 7) data.distribution['7_12_bulan'] += value;
      }
    });

    const finalData = Object.entries(outletData).map(([name, d]) => ({
      name: name,
      riskValue: d.riskValue,
      expiredValue: d.expiredValue,
      skuCount: d.riskSkus.size,
      distribution: d.distribution,
      topProducts: Object.entries(d.productRisks)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5) 
        .map(([n, v]) => ({ name: n, value: v }))
    }));

    return {
      success: true,
      data: finalData,
      filterList: outlets.map(o => o.outlet_name).sort()
    };

  } catch (e) {
    console.error("[getAMDashboardData Error]", e);
    return { error: "Gagal memuat dashboard: " + e.message };
  }
}

/**
 * Mengambil data Dashboard untuk Procurement dengan Filter & Pagination.
 * REVISI V2.4: Looping Fetch (Fix Limit 1000 Rows) & Accordion Logic
 */
function getProcDashboardData(filters = {}) {
  try {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offsetPagination = (page - 1) * limit;

    // 1. Ambil Data Master (Produk & Supplier)
    const productEndpoint = 'master_products?select=product_code,item_description,supplier,unit_cost_no_vat,barcode,procurement_id';
    const masterProducts = fetchSupabase(productEndpoint, 'GET');
    
    const productMap = {};
    if (masterProducts && Array.isArray(masterProducts)) {
      masterProducts.forEach(p => {
        const key = normalizeCode_(p.product_code);
        const info = {
          name: p.item_description,
          supplier: p.supplier || 'N/A',
          procId: p.procurement_id || 'N/A', 
          price: p.unit_cost_no_vat || 0
        };
        productMap[key] = info;
        if (p.barcode) productMap[normalizeCode_(p.barcode)] = info;
      });
    }

    // 2. Tentukan Rentang Tanggal (ED Range)
    // Default: Sept 2025 - Sept 2026 (Agar mencakup expired & future risk)
    let edStart = '2025-09-01'; 
    let edEnd = '2026-09-30';
    
    // Custom ED Range Filter (Override jika user memilih spesifik)
    if (filters.edRange === 'bulan_ini') { edStart = '2026-01-01'; edEnd = '2026-01-31'; }
    else if (filters.edRange === '1_3_bulan') { edStart = '2026-02-01'; edEnd = '2026-04-30'; }
    else if (filters.edRange === '4_6_bulan') { edStart = '2026-05-01'; edEnd = '2026-07-31'; }
    else if (filters.edRange === '7_12_bulan') { edStart = '2026-08-01'; edEnd = '2026-09-30'; }

    // 3. Looping Fetch Data Stok (Mengatasi Limit 1000 Baris Supabase)
    let allStocks = [];
    let fetchOffset = 0;
    const fetchLimit = 1000; // Chunk size
    let keepFetching = true;

    while (keepFetching) {
      // Construct URL dengan Offset & Limit
      const stockEndpoint = `stocks_ed?expired_date=gte.${edStart}&expired_date=lte.${edEnd}&select=product_code,outlet_code,batch_id,qty,expired_date,status_action&offset=${fetchOffset}&limit=${fetchLimit}`;
      
      const chunk = fetchSupabase(stockEndpoint, 'GET');
      
      if (chunk && Array.isArray(chunk) && chunk.length > 0) {
        allStocks = allStocks.concat(chunk);
        
        if (chunk.length < fetchLimit) {
          keepFetching = false; // Data habis (kurang dari limit)
        } else {
          fetchOffset += fetchLimit; // Lanjut ke halaman berikutnya
        }
      } else {
        keepFetching = false; // Data kosong
      }
    }

    // 4. Agregasi & Filter In-Memory
    const productAggregator = {}; 
    const timeRiskAggregator = { 'Bulan Ini': 0, '1-3 Bulan': 0, '4-6 Bulan': 0, '7-12 Bulan': 0 };
    const statusStats = { 'Belum Ditangani': { sku: new Set(), val: 0 }, 'Sudah Ditangani': { sku: new Set(), val: 0 } };

    const today = new Date(2026, 0, 26); 
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    // Proses data dari allStocks (bukan stocks parsial)
    allStocks.forEach(item => {
      const pCode = normalizeCode_(item.product_code);
      const info = productMap[pCode] || { name: `Unknown (${pCode})`, supplier: 'Unknown', procId: '-', price: 0 };
      
      // Filter Logic
      if (filters.supplier && info.supplier !== filters.supplier) return;
      if (filters.procId && info.procId !== filters.procId) return;
      if (filters.productName && !info.name.toUpperCase().includes(filters.productName.toUpperCase())) return;
      
      const isHandled = item.status_action && item.status_action !== '';
      if (filters.status === 'belum' && isHandled) return;
      if (filters.status === 'sudah' && !isHandled) return;

      // Logika Rounding
      let qty = item.qty;
      if (filters.rounding) qty = Math.floor(qty);
      
      const value = qty * info.price; // Menggunakan unit_cost_no_vat
      if (value <= 0) return;

      // Agregasi Per Produk
      if (!productAggregator[pCode]) {
        productAggregator[pCode] = {
          productCode: pCode,
          productName: info.name,
          supplier: info.supplier,
          procId: info.procId,
          unitCost: info.price,
          totalCost: 0,
          totalQty: 0,
          status: item.status_action || 'Belum Ditangani',
          outlets: new Set(),
          batches: new Set(),
          nearestED: item.expired_date
        };
      }

      const agg = productAggregator[pCode];
      agg.totalCost += value;
      agg.totalQty += qty;
      agg.outlets.add(item.outlet_code);
      agg.batches.add(item.batch_id);
      if (new Date(item.expired_date) < new Date(agg.nearestED)) {
        agg.nearestED = item.expired_date;
      }

      // Agregasi Global
      const statusKey = isHandled ? 'Sudah Ditangani' : 'Belum Ditangani';
      statusStats[statusKey].val += value;
      statusStats[statusKey].sku.add(pCode);

      // Agregasi Time-Based
      const edDate = new Date(item.expired_date);
      const monthDiff = (edDate.getFullYear() - currentYear) * 12 + (edDate.getMonth() - currentMonth);
      
      if (monthDiff === 0) timeRiskAggregator['Bulan Ini'] += value;
      else if (monthDiff >= 1 && monthDiff <= 3) timeRiskAggregator['1-3 Bulan'] += value;
      else if (monthDiff >= 4 && monthDiff <= 6) timeRiskAggregator['4-6 Bulan'] += value;
      else if (monthDiff >= 7) timeRiskAggregator['7-12 Bulan'] += value;
    });

    // 5. Format Data Tabel
    let aggregatedList = Object.values(productAggregator).map(item => {
      const edDate = new Date(item.nearestED);
      const monthDiff = (edDate.getFullYear() - currentYear) * 12 + (edDate.getMonth() - currentMonth);
      let category = '7-12 Bulan';
      if (monthDiff === 0) category = 'Bulan Ini';
      else if (monthDiff >= 1 && monthDiff <= 3) category = '1-3 Bulan';
      else if (monthDiff >= 4 && monthDiff <= 6) category = '4-6 Bulan';
      // Handle Expired (jika ada data masa lalu)
      if (monthDiff < 0) category = 'Expired';

      return {
        ...item,
        detailInfo: {
          category: category,
          nearestED: item.nearestED,
          batchCount: item.batches.size,
          pharmacyCount: item.outlets.size,
          costPerUnit: item.unitCost
        }
      };
    });

    // 6. Sorting & Pagination
    aggregatedList.sort((a, b) => b.totalCost - a.totalCost);
    
    const totalItems = aggregatedList.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedData = aggregatedList.slice(offsetPagination, offsetPagination + limit);

    // 7. Chart Data & Filters
    const topProducts = aggregatedList.slice(0, 10).map(p => ({
      name: p.productName,
      cost: p.totalCost,
      outlets: p.detailInfo.pharmacyCount
    }));

    const timeRiskData = Object.entries(timeRiskAggregator).map(([label, val]) => ({
      category: label,
      value: val
    }));

    const summary = [
      { label: 'Belum Ditangani', sku: statusStats['Belum Ditangani'].sku.size, val: statusStats['Belum Ditangani'].val },
      { label: 'Sudah Ditangani', sku: statusStats['Sudah Ditangani'].sku.size, val: statusStats['Sudah Ditangani'].val }
    ];

    const uniqueSuppliers = [...new Set(aggregatedList.map(d => d.supplier))].sort();
    const uniqueProcIds = [...new Set(aggregatedList.map(d => d.procId))].sort();

    return {
      success: true,
      data: paginatedData,
      pagination: { currentPage: page, totalPages: totalPages, totalItems: totalItems },
      summary: summary,
      charts: { riskDistribution: topProducts, timeRisk: timeRiskData },
      filters: { suppliers: uniqueSuppliers, procIds: uniqueProcIds }
    };

  } catch (e) {
    console.error("[getProcDashboardData Error]", e);
    return { error: "Gagal memuat data procurement: " + e.message };
  }
}