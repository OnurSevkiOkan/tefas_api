const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS ve JSON yanıt başlıkları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const fonKodu = (req.query.fon || 'TLY').toUpperCase();

  // Türkçe finansal sayı formatını standart float tipine çeviren temizlik fonksiyonu
  const parseFinansSayi = (str) => {
    if (!str) return 0;
    let temiz = str.replace(/[^0-9.,]/g, '').trim();
    if (temiz.includes(',') && temiz.includes('.')) {
      temiz = temiz.replace(/\./g, '').replace(',', '.');
    } else if (temiz.includes(',')) {
      temiz = temiz.replace(',', '.');
    }
    return parseFloat(temiz) || 0;
  };

  // =================================================================
  // 1. HAT: BLOOMBERG HT (Düzeltilmiş Nokta Atışı URL Hattı)
  // =================================================================
  try {
    const bhtUrl = `https://www.bloomberght.com/fon/${fonKodu}`;
    const response = await axios.get(bhtUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 4000
    });

    if (response && response.data) {
      const $ = cheerio.load(response.data);
      $('script, style, noscript, iframe').remove();
      const text = $('body').text().replace(/\s+/g, ' ');

      // Syntax hatası ihtimali sıfır olan güvenli finansal Regex kalıpları
      const fiyatMatch = text.match(/Son Fiyat[^0-9]*([0-9.,]+)/i);
      const buyuklukMatch = text.match(/(?:Fon Toplam Değeri|Büyüklük)[^0-9]*([0-9.,]+)/i);
      const payMatch = text.match(/(?:Dolaşımdaki Pay|Pay Sayısı)[^0-9]*([0-9.,]+)/i);

      const fiyat = parseFinansSayi(fiyatMatch ? fiyatMatch[1] : null);
      
      if (fiyat > 0) {
        return res.status(200).json({
          fon: fonKodu,
          fiyat: fiyat,
          fon_toplam_buyukluk_tl: parseFinansSayi(buyuklukMatch ? buyuklukMatch[1] : null),
          toplam_pay_sayisi: Math.round(parseFinansSayi(payMatch ? payMatch[1] : null)),
          tarih: new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }),
          kaynak: "Bloomberg HT"
        });
      }
    }
  } catch (e) {
    // 1. Hat çökerse log bas ve 2. hatta güvenle geçmesi için akışı serbest bırak
    console.log("Bloomberg HT Hattı devre dışı kaldı:", e.message);
  }

  // =================================================================
  // 2. HAT: BIGPARA HÜRRİYET (Garantili Klasik SSR Hattı)
  // =================================================================
  try {
    const bigparaUrl = `https://bigpara.hurriyet.com.tr/fon/detay/${fonKodu}/`;
    const response = await axios.get(bigparaUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 4000
    });

    if (response && response.data) {
      const $ = cheerio.load(response.data);
      $('script, style, noscript, iframe').remove();
      const text = $('body').text().replace(/\s+/g, ' ');

      const fiyatMatch = text.match(/(?:Son Fiyat|Fiyat)[^0-9]*([0-9.,]+)/i);
      const buyuklukMatch = text.match(/(?:Fon Toplam Değeri|Büyüklük|Toplam Değer)[^0-9]*([0-9.,]+)/i);
      const payMatch = text.match(/(?:Dolaşımdaki Pay|Pay Sayısı)[^0-9]*([0-9.,]+)/i);

      const fiyat = parseFinansSayi(fiyatMatch ? fiyatMatch[1] : null);
      
      if (fiyat > 0) {
        return res.status(200).json({
          fon: fonKodu,
          fiyat: fiyat,
          fon_toplam_buyukluk_tl: parseFinansSayi(buyuklukMatch ? buyuklukMatch[1] : null),
          toplam_pay_sayisi: Math.round(parseFinansSayi(payMatch ? payMatch[1] : null)),
          tarih: new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }),
          kaynak: "Bigpara Hürriyet"
        });
      }
    }
  } catch (e) {
    console.log("Bigpara Hattı devre dışı kaldı:", e.message);
  }

  // =================================================================
  // NİHAİ ÇIKIŞ: İki hat da havlu atarsa ESP32'ye kontrollü hata dön
  // =================================================================
  return res.status(404).json({
    hata: "Tüm bağımsız finans hatları (Bloomberg HT & Bigpara) tarandı ancak fon verisi soyutlanamadı.",
    durum: "Kaynak sitelerde geçici bakım veya IP engellemesi mevcut olabilir."
  });
};
