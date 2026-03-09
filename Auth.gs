/**
 * @file Auth.gs
 * @description Menangani autentikasi user dan autocomplete (Revisi AM Support).
 */

// ... (Fungsi validateLogin TETAP SAMA, tidak perlu diubah) ...
function validateLogin(username, password) {
  // ... (Gunakan kode validateLogin dari revisi sebelumnya) ...
  try {
    // --- STEP 1: SANITASI INPUT ---
    const userUpper = username ? username.toString().trim().toUpperCase() : "";
    const passUpper = password ? password.toString().trim().toUpperCase() : "";

    if (!userUpper) return { success: false, message: "Nama pengguna tidak boleh kosong." };

    const authConfig = CONFIG.AUTH;

    // --- STEP 2: HARDCODED CHECK (BOD & PROCUREMENT) ---
    if (userUpper === authConfig.BOD.USERNAME) {
      if (passUpper === authConfig.BOD.PASSWORD) {
        return { success: true, user: { name: authConfig.BOD.NAME, role: authConfig.BOD.ROLE, code: 'BOD' } };
      } else {
        return { success: false, message: "Password BOD salah." };
      }
    }
    
    if (userUpper === authConfig.PROCUREMENT.USERNAME) {
      if (passUpper === authConfig.PROCUREMENT.PASSWORD) {
        return { success: true, user: { name: authConfig.PROCUREMENT.NAME, role: authConfig.PROCUREMENT.ROLE, code: 'PROC' } };
      } else {
        return { success: false, message: "Password Procurement salah." };
      }
    }

    // --- STEP 3: OUTLET CHECK (NO PASSWORD) ---
    const outletEndpoint = `master_outlets?outlet_name=eq.${encodeURIComponent(userUpper)}&select=*`;
    const outletResult = fetchSupabase(outletEndpoint, 'GET');

    if (outletResult && outletResult.length > 0) {
      const outlet = outletResult[0];
      return { 
        success: true, 
        user: { 
          name: outlet.outlet_name, 
          role: 'OUTLET', 
          code: outlet.outlet_code,
          am: outlet.am_name 
        } 
      };
    }

    // --- STEP 4: AM CHECK (DATABASE) ---
    const amEndpoint = `master_am?username=eq.${encodeURIComponent(userUpper)}&password=eq.${encodeURIComponent(passUpper)}&select=*`;
    const amResult = fetchSupabase(amEndpoint, 'GET');

    if (amResult && amResult.length > 0) {
      const am = amResult[0];
      return {
        success: true,
        user: {
          name: am.fullname,
          role: 'AM',
          code: am.username
        }
      };
    }

    // --- STEP 5: FAIL ---
    return { success: false, message: "Pengguna tidak ditemukan atau Password salah." };

  } catch (e) {
    console.error("[Auth Error]", e);
    return { success: false, message: "Terjadi kesalahan server: " + e.message };
  }
}

/**
 * Mengambil daftar opsi login terpisah antara Outlet dan User Lain.
 * Return format: { outlets: [...], others: [...] }
 */
function getLoginOptions() {
  const cacheKey = "LOGIN_OPTIONS_OBJ_V1"; 
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  try {
    // 1. Fetch Data Outlet
    const outletsData = fetchSupabase('master_outlets?select=outlet_name', 'GET');
    const outletNames = Array.isArray(outletsData) ? outletsData.map(item => item.outlet_name).sort() : [];

    // 2. Fetch Data AM
    const amData = fetchSupabase('master_am?select=username', 'GET');
    const amNames = Array.isArray(amData) ? amData.map(item => item.username).sort() : [];

    // 3. Hardcoded Roles
    const hardcoded = [CONFIG.AUTH.PROCUREMENT.USERNAME, CONFIG.AUTH.BOD.USERNAME];

    // 4. Gabungkan AM dan Hardcoded sebagai "Others" (Butuh Password)
    const otherNames = [...hardcoded, ...amNames].sort();

    const result = {
      outlets: outletNames, // Login TANPA Password
      others: otherNames    // Login DENGAN Password
    };

    cache.put(cacheKey, JSON.stringify(result), CONFIG.APP.CACHE_DURATION);
    return result;

  } catch (e) {
    console.error("[GetLoginOptions Error]", e);
    return { outlets: [], others: [] };
  }
}