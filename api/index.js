const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const fonKodu = req.query.fon || 'TLY';

  try {
    // Geo-Block engelini aşmak için veriyi Fintables üzerinden çekiyoruz
    const url = `https://fintables.com/fonlar/${fonKodu.toUpperCase()}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    
    // Fintables'ın sayfa içine gömdüğü ana JSON veri paketini (Next.js state) yakala
    const nextData = $('#__NEXT_DATA__').html();
    
    if (!nextData) {
      return res.status(404).json({ hata: "DOM icinde Next.js verisi bulunamadi." });
    }

    // JSON ağacında gezinmek yerine, Regex (Düzenli İfadeler) ile 
    // doğrudan fiyat parametresini bulmak en garantili yoldur.
    // Örnek aranan format: "price": 3.4567
    const priceMatch = nextData.match(/"price"\s*:\s*([0-9\.]+)/);
    
    if (!priceMatch || priceMatch[1] === "0") {
      return res.status(404).json({ hata: "Veri havuzunda gecerli fiyat bulunamadi." });
    }

    // Bulunan fiyat string'ini ondalıklı sayıya (float) çevir
    const fiyat = parseFloat(priceMatch[1]);
    
    // Türkiye saat dilimine göre o anki tarihi al
    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // ESP32'nin beklediği standart formata uygun olarak JSON'u gönder
    res.status(200).json({
      fon: fonKodu.toUpperCase(),
      fiyat: fiyat,
      tarih: tarihStr
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "Alternatif veri kaynagina erisim basarisiz. Fon kodu hatali olabilir.",
      detay: error.message 
    });
  }
};
