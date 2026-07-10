const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Kullanıcının belirttiği resmi Mynet Hisse senedi URL'sini doğrudan hedefliyoruz
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

    // False-positive (yanlış eşleşme) ihtimalini sıfırlamak için arkada çalışan kod etiketlerini temizle
    $('script, style, noscript, iframe, svg, meta').remove();

    // Sayfa içindeki tüm görünür temiz metni al
    const temizGorselMetin = $('body').text().replace(/\s+/g, ' ');

    let fiyatText = '';
    let bulmaYontemi = '';

    // 1. Kademe: Mynet hisse sayfalarındaki standart fiyat sınıflarını tara
    if ($('.fn-fiyat').length > 0) {
      fiyatText = $('.fn-fiyat').first().text().trim();
      bulmaYontemi = "DOM_fn-fiyat";
    } else if ($('.seans-fiyat').length > 0) {
      fiyatText = $('.seans-fiyat').first().text().trim();
      bulmaYontemi = "DOM_seans-fiyat";
    }

    // 2. Kademe (Katı Fallback): Eğer DOM sınıfları değiştiyse, Regex filtresini devreye sok.
    // Bu kez \d{2,6} yaparak hisse senetlerinin 2 basamaklı (156,50) yapısını da kapsama alanına alıyoruz!
    if (!fiyatText || fiyatText.trim() === '') {
      const strictRegex = temizGorselMetin.match(/\b(\d+,\d{2,6})\b/);
      if (strictRegex) {
        fiyatText = strictRegex[1].trim();
        bulmaYontemi = "Strict_Asset_Regex";
      }
    }

    if (!fiyatText) {
      return res.status(404).json({ 
        hata: "Belirtilen Mynet hisse sayfasında fiyat formatı saptanamadı.",
        metinOzeti: temizGorselMetin.substring(0, 300)
      });
    }

    // "156,50" formatını ESP32'nin okuyacağı "156.50" float tipine dönüştür
    let noktaFormatli = fiyatText.replace(/\./g, '').replace(',', '.').trim();
    const fiyatFloat = parseFloat(noktaFormatli);

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    res.status(200).json({
      sembol: "TERA",
      fiyat: fiyatFloat,
      tarih: tarihStr,
      debug: {
        ayiklananMetin: fiyatText,
        yontem: bulmaYontemi,
        hedefUrl: url
      }
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "Mynet hisse sayfasına bağlanırken ağ hatası oluştu.",
      detay: error.message 
    });
  }
};
