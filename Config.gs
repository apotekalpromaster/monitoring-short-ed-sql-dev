/**
 * @file Config.gs
 * @description Menyimpan konfigurasi global, kredensial, dan konstanta aplikasi.
 */

const CONFIG = {
  APP: {
    NAME: "Alpro Short ED 2.0",
    VERSION: "2.0.0",
    CACHE_DURATION: 21600 // 6 Jam (dalam detik)
  },

  SUPABASE: {
    URL: "https://wjbyrbbqumqpbqhkdpus.supabase.co",
    KEY: "sb_publishable_s0k06SAx7sw6xG-KUafPLQ_wpI1dzjc", // Public Key
    HEADERS: {
      'apikey': "sb_publishable_s0k06SAx7sw6xG-KUafPLQ_wpI1dzjc",
      'Authorization': "Bearer sb_publishable_s0k06SAx7sw6xG-KUafPLQ_wpI1dzjc",
      'Content-Type': "application/json",
      'Prefer': "return=representation" // Agar Supabase mengembalikan data setelah Insert/Update
    }
  },

  AUTH: {
    // Hardcoded credentials sesuai instruksi (untuk fase awal/fallback)
    BOD: {
      USERNAME: "BOD",
      PASSWORD: "YONGXINKAIZEN",
      ROLE: "BOD",
      NAME: "Board of Directors"
    },
    PROCUREMENT: {
      USERNAME: "PROCUREMENT",
      PASSWORD: "ACCOUNTABLE",
      ROLE: "PROCUREMENT",
      NAME: "Procurement Team"
    }
  }
};