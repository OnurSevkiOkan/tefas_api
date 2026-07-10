const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // ESP32'nin ve farklı istemcilerin doğrudan erişimi için CORS izinleri
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // URL query'den fon kodunu al (Örn: /api?fon=TLY). Parametre yoksa TLY kullan.
  const fonKodu = req.query.fon || 'TLY';
  const url = `https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${fonKodu.toUpperCase()}`;

  try {
    // TEFAS'ın bot korumasını aşmak için standart browser User-Agent'ları kullanıyoruz
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 10000 // ESP32 uzun süre bekleyip watchdog triggerlamasın diye 10sn limit
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // TEFAS DOM yapısında ana fiyat genelde .top-list altındadır
    let rawFiyat = $('.top-list > li:nth-child(1) > span').text();
    
    // Fallback: Eğer tasarım değişirse diye HTML içinde Regex ile güvenli bir arama yapıyoruz
    if (!rawFiyat || rawFiyat.trim() === '') {
      const regexMatch = html.match(/Son Fiyat.*?<span[^>]*>([\d,]+)<\/span>/i);
      if (regexMatch && regexMatch[1]) {
        rawFiyat = regexMatch[1];
      }
    }

    if (!rawFiyat) {
      return res.status(404).json({ hata: "Fiyat bilgisi TEFAS DOM'u içinde bulunamadi." });
    }

    // "3,4567" formatındaki stringi ESP32 C++ float'una uygun "3.4567" formatına çeviriyoruz
    let formatliFiyat = rawFiyat.replace(/\./g, '').replace(',', '.').trim();
    
    // Sistemin okuduğu o anki tarihi Türk formatında alıyoruz
    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // Node.js üzerinden ESP32'ye tertemiz JSON'u gönder
    res.status(200).json({
      fon: fonKodu.toUpperCase(),
      fiyat: parseFloat(formatliFiyat),
      tarih: tarihStr
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "TEFAS sunucusuna erisim saglanamadi.",
      detay: error.message 
    });
  }
};