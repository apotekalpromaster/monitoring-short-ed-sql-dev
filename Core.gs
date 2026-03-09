/**
 * @file Core.gs
 * @description Entry point aplikasi web (doGet) dan fungsi helper dasar.
 */

/**
 * Fungsi utama yang dijalankan saat user membuka URL Web App.
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  
  return template.evaluate()
    .setTitle(CONFIG.APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, user-scalable=no') // Mobile friendly
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper untuk menyisipkan file HTML/CSS/JS ke dalam template utama.
 * Digunakan di Index.html: <?!= include('NamaFile'); ?>
 * @param {string} filename - Nama file .html yang ingin disisipkan.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}