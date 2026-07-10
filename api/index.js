const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const url = 'https://www.teraportfoy.com/fonlarimiz/serbest-fonlarimiz/tera-portfoy-birinci-serbest-fon-tly';

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

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9'
      },
      timeout: 8000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Görsel kalabalıkları temizleerek saf metne odaklanıyoruz
    $('script, style, noscript, iframe, footer, nav, header').remove();
    const safMetin = $('body').text().replace(/\s+/g, ' ');

    // --- NOKTA ATIŞI TERA PORTFÖY REGEX SÜZGEÇLERİ ---
    // Log çıktındaki "Son Güncelleme Tarihi 7.277,90395" dizilimini yakalayan süzgeç
    const fiyatMatch = safMetin.match(/Son Güncelleme Tarihi\s+([0-9.,]+)/i) || safMetin.match(/\b(\d+,\d{4,6})\b/);
    
    // Tablonun ilerleyen kısımlarındaki toplam değer ve pay sayılarını esnek biçimde tarar
    const buyuklukMatch = safMetin.match(/(?:Toplam Değer|Büyüklük|Portföy Büyüklüğü|Fon Toplam Değeri)[^0-9]*([0-9.,]+)/i);
    const payMatch = safMetin.match(/(?:Pay Sayısı|Dolaşımdaki Pay|Toplam Pay|Tedavüldeki Pay)[^0-9]*([0-9.,]+)/i);

    let fiyat = fiyatMatch ? parseFinansSayi(fiyatMatch[1]) : 0;
    let fonBuyuklugu = buyuklukMatch ? parseFinansSayi(buyuklukMatch[1]) : 0;
    let toplamPay = payMatch ? parseFinansSayi(payMatch[1]) : 0;

    // Eğer fiyat ayıklanamadıysa sistemi tamamen durdurmak yerine kontrollü hata mesajı veriyoruz (200 durum koduyla)
    if (fiyat === 0) {
      return res.status(200).json({
        hata: "Metin icerisinden gecerli fiyat sayisi soyutlanamadi.",
        sayfaMetinOzeti: safMetin.substring(0, 300)
      });
    }

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // ESP32'nin beklediği standart başarılı JSON çıktısı
    res.status(200).json({
      fon: "TLY",
      fiyat: fiyat,
      fon_toplam_buyukluk_tl: fonBuyuklugu,
      toplam_pay_sayisi: Math.round(toplamPay),
      tarih: tarihStr
    });

  } catch (error) {
    res.status(200).json({
      hata: "Tera Portföy sunucusuna baglanirken baglanti hatasi olustu.",
      detay: error.message
    });
  }
};
