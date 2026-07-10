const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const url = 'https://www.teraportfoy.com/fonlarimiz/serbest-fonlarimiz/tera-portfoy-birinci-serbest-fon-tly';

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    $('script, style, noscript, header, footer, nav').remove();
    const safMetin = $('body').text().replace(/\s+/g, ' ');

    // 1. Birim Fiyatı Yakala
    const fiyatMatch = safMetin.match(/Son Güncelleme Tarihi\s+([0-9.,]+)/i);
    let fiyat = fiyatMatch ? parseFinansSayi(fiyatMatch[1]) : 0;

    // 2. Fon Büyüklüğünü Yakala
    const buyuklukMatch = safMetin.match(/(?:Portföy Büyüklüğü|Fon Toplam Değeri|Toplam Değer|Büyüklük)[^0-9]*([0-9.,]+)/i);
    let fonBuyuklugu = buyuklukMatch ? parseFinansSayi(buyuklukMatch[1]) : 0;

    // 3. Pay Sayısını Yakala veya HESAPLA!
    const payMatch = safMetin.match(/(?:Pay Sayısı|Tedavüldeki Pay|Dolaşımdaki Pay)[^0-9]*([0-9.,]+)/i);
    let toplamPay = payMatch ? parseFinansSayi(payMatch[1]) : 0;

    // Eğer sayfada pay sayısı yoksa ama fiyat ve büyüklük varsa formülle bul (Matematiksel Hack)
    if (toplamPay === 0 && fiyat > 0 && fonBuyuklugu > 0) {
      toplamPay = fonBuyuklugu / fiyat;
    }

    if (fiyat === 0) {
      return res.status(200).json({
        hata: "Tera Portföy sitesinden fiyat saptanamadı.",
        metin_ozeti: safMetin.substring(0, 300)
      });
    }

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    res.status(200).json({
      fon: "TLY",
      fiyat: fiyat,
      fon_toplam_buyukluk_tl: fonBuyuklugu,
      toplam_pay_sayisi: Math.round(toplamPay),
      tarih: tarihStr
    });

  } catch (error) {
    res.status(200).json({
      hata: "Tera Portföy sunucusuna erişim başarısız.",
      detay: error.message
    });
  }
};
