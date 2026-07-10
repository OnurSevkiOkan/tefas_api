const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    // TEFAS resmi veri portalı (Hisse senedi değil, fon olduğu için en kesin kaynak)
    // TLY fon kodu için Takasbank API
    const tefasUrl = 'https://www.tefas.gov.tr/api/Teias/GetFonMarketValue';
    
    // TLY fonunun TEFAS'taki güncel verilerini istiyoruz
    const response = await axios.post(tefasUrl, {
      "fonKod": "TLY",
      "tarih": new Date().toISOString().split('T')[0]
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data && response.data.length > 0) {
      const data = response.data[0];
      
      res.status(200).json({
        fon: "TLY",
        fiyat: data.fiyat || 0,
        fon_toplam_buyukluk_tl: data.fonBuyuklugu || 0,
        direkt_net_nakit_akisi: data.gunlukNetGirisCikis || 0,
        tarih: new Date().toLocaleDateString('tr-TR')
      });
    } else {
      // TEFAS boş dönerse yedek Tera Portföy fiyat motorunu tetikle
      res.status(404).json({ hata: "TEFAS verisi henüz güncellenmemiş." });
    }
  } catch (error) {
    res.status(500).json({ hata: "API bağlantısı başarısız.", detay: error.message });
  }
};
