/**
 * @file Utils.gs
 * @description Kumpulan fungsi pembantu (Helper Functions).
 */

/**
 * Memformat angka menjadi format mata uang Rupiah (IDR).
 * Contoh: 15000 -> "Rp 15.000"
 * @param {number} amount - Nilai angka yang akan diformat.
 * @return {string} String terformat.
 */
function formatRupiah(amount) {
  if (amount == null || isNaN(amount)) return "Rp 0";
  
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Memformat tanggal menjadi format UI yang ramah pengguna Indonesia.
 * Contoh: 2025-01-30 -> "30 Jan 2025"
 * @param {string|Date} dateInput - Objek Date atau string tanggal ISO.
 * @return {string} Tanggal terformat.
 */
function formatDateUI(dateInput) {
  if (!dateInput) return "-";
  
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "-"; // Invalid date

  return Utilities.formatDate(date, "Asia/Jakarta", "dd MMM yyyy");
}

/**
 * Helper untuk parsing tanggal dari input HTML (YYYY-MM-DD) ke Objek Date.
 * @param {string} dateStr - String tanggal dari input type="date".
 * @return {Date} Objek Date (jam 00:00:00).
 */
function parseDateFromInput(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  // Note: Month di JS mulai dari 0 (Januari = 0)
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Helper untuk parsing tanggal dari input HTML (YYYY-MM-DD) ke Objek Date.
 * Berguna jika kita perlu manipulasi tanggal di Apps Script sebelum kirim ke DB.
 */
function parseDateFromInput(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  // Note: Month di JS mulai dari 0 (Januari = 0)
  return new Date(parts[0], parts[1] - 1, parts[2]);
}