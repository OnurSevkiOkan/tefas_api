const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const fonKodu = (req.query.fon || 'TLY').toUpperCase();
  const url = `https://finans.mynet.com/borsa/hisseler/tera-tera-yatirim-menkul-degerler/`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 7000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // --- KRİTİK ADIM: ARKA PLAN KODLARINI KAZI ---
    // JavaScript, CSS ve meta ayarlarını silerek false-positive (2048 gibi) tuzakları engelliyoruz
    $('script, style, noscript, iframe, svg, meta').remove();

    // Sadece ekranda görünen temiz metni al
    const temizGorselMetin = $('body').text().replace(/\s+/g, ' ');

    let fiyatText = '';
    let bulmaYontemi = '';

    // 1. Kademe: Doğrudan Mynet'in sınıflarını kontrol et (Temizlenmiş DOM'da)
    if ($('.fn-fiyat').length > 0) {
      fiyatText = $('.fn-fiyat').first().text().trim();
      bulmaYontemi = "DOM_fn-fiyat";
    } 

    // 2. Kademe (Strict Fallback): Eğer sınıf boşsa, sadece fon fiyatı formatına uyan 
    // (Örn: 3,4567 veya 12,345678 gibi virgülden sonra 4-6 hanesi olan) sayıları ara
    if (!fiyatText || fiyatText.trim() === '') {
      // RegEx Açıklaması: \d+ (en az bir sayı), virgül, \d{4,6} (en az 4 en fazla 6 basamak küsurat)
      const strictRegex = temizGorselMetin.match(/\b(\d+,\d{4,6})\b/);
      if (strictRegex) {
        fiyatText = strictRegex[1].trim();
        bulmaYontemi = "Strict_Fond_Regex";
      }
    }

    if (!fiyatText) {
      return res.status(404).json({ 
        hata: "Temizlenmis metin icinde geçerli bir fon fiyatı formatı saptanamadı.",
        IncelenenMetinOzeti: temizGorselMetin.substring(0, 300)
      });
    }

    // "3,456789" formatını ESP32 için "3.456789" float haline getir
    let noktaFormatli = fiyatText.replace(',', '.');
    const fiyatFloat = parseFloat(noktaFormatli);

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    res.status(200).json({
      fon: fonKodu,
      fiyat: fiyatFloat,
      tarih: tarihStr,
      debug: {
        ayiklananMetin: fiyatText,
        yontem: bulmaYontemi
      }
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "Ağ veya kaynak sunucu hatası.",
      detay: error.message 
    });
  }
};
