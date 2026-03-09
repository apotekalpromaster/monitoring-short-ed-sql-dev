/**
 * @file Api.gs
 * @description Wrapper universal untuk melakukan request ke Supabase API.
 */

/**
 * Melakukan HTTP Request ke Supabase.
 * @param {string} endpoint - Path tabel atau query (misal: 'master_products?select=*').
 * @param {string} method - HTTP Method (GET, POST, PATCH, DELETE). Default: GET.
 * @param {Object} payload - Data JSON untuk dikirim (opsional).
 * @return {Object|Array} Response data dari Supabase.
 */
function fetchSupabase(endpoint, method = 'GET', payload = null) {
  const url = `${CONFIG.SUPABASE.URL}/rest/v1/${endpoint}`;
  
  const options = {
    method: method,
    headers: { ...CONFIG.SUPABASE.HEADERS }, // Copy headers agar tidak memutasi config asli
    muteHttpExceptions: true // Penting: Agar kita bisa tangkap error 4xx/5xx secara manual
  };

  // Jika method POST/PATCH, pastikan payload dikirim
  if (payload && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    options.payload = JSON.stringify(payload);
  }

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    // Cek status code (200-299 dianggap sukses)
    if (responseCode >= 200 && responseCode < 300) {
      // Supabase kadang mengembalikan body kosong untuk status 204 (No Content)
      if (!responseBody) return { success: true }; 
      return JSON.parse(responseBody);
    } else {
      // Logging error untuk debugging di Apps Script Dashboard
      console.error(`[Supabase Error] ${method} ${endpoint}`, {
        code: responseCode,
        body: responseBody
      });
      throw new Error(`Database Error (${responseCode}): ${responseBody}`);
    }

  } catch (e) {
    // Tangkap error koneksi (misal timeout atau DNS error)
    console.error(`[Connection Error] ${e.message}`);
    throw new Error(`Gagal terhubung ke Database: ${e.message}`);
  }
}