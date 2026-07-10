const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const url = 'https://www.tefas.gov.tr/tr/fon-detayli-analiz/TLY';

  try {
    // TEFAS bot koruması için Referer başlığı ZORUNLUDUR
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://www.tefas.gov.tr/'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    
    // Verileri tablolardan/alanlardan çekiyoruz
    const fiyatText = $('.fon-fiyat-bilgi .fon-fiyat').text().trim(); 
    const buyuklukText = $('.fon-detay-bilgi').text(); // Büyüklük genelde bu bloktadır
    
    // Temizleme fonksiyonu
    const parse = (str) => {
        if (!str) return 0;
        let t = str.replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.');
        return parseFloat(t) || 0;
    };

    const fiyat = parse(fiyatText);
    
    // Büyüklük bilgisini metin bloğundan temizleyerek buluyoruz
    let fonBuyuklugu = 0;
    const bMatch = buyuklukText.match(/(?:Fon Toplam Değer|Portföy Değeri)[\s\S]{0,50}?([0-9.,]+)/i);
    if (bMatch) fonBuyuklugu = parse(bMatch[1]);

    // TEFAS detay sayfasında nakit akışı verisi doğrudan yazmaz. 
    // Ancak "Dolaşımdaki Pay" verisi varsa bunu ESP32 tarafında hesaplayabiliriz.
    // Şimdilik 0 dönüyoruz, pay sayısını bulursak güncelleriz.
    
    res.status(200).json({
      fon: "TLY",
      fiyat: fiyat,
      fon_toplam_buyukluk_tl: fonBuyuklugu,
      toplam_pay_sayisi: 0, 
      direkt_net_nakit_akisi: 0,
      tarih: new Date().toLocaleDateString('tr-TR')
    });

  } catch (error) {
    res.status(500).json({ hata: "TEFAS bağlantısı başarısız.", detay: error.message });
  }
};
