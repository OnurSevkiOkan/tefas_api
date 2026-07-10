const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS ve JSON başlık tanımlamaları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Doğrudan verdiğin resmi Tera Portföy TLY fon sayfasını hedefliyoruz
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
    // 1. ADIM: Tera Portföy Resmi Sitesine İstek Atma
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

    // Kod kalabalığını temizle
    $('script, style, noscript, iframe, footer, nav, header').remove();
    const safMetin = $('body').text().replace(/\s+/g, ' ');

    // --- RESMİ SİTE REGEX SÜZGEÇLERİ ---
    // Kurumsal fon sitelerinin standart veri başlıklarını (Birim Değer, Büyüklük, Pay Sayısı) tarıyoruz
    const fiyatMatch = safMetin.match(/(?:Fiyat|Birim Pay Değeri|Birim Fiyat)[^0-9]*([0-9]+,[0-9]{4,6}|[0-9]+\.[0-9]{4,6})/i);
    const buyuklukMatch = safMetin.match(/(?:Toplam Değer|Büyüklük|Portföy Büyüklüğü|Fon Toplam Değeri)[^0-9]*([0-9.,]+)/i);
    const payMatch = safMetin.match(/(?:Pay Sayısı|Dolaşımdaki Pay|Toplam Pay)[^0-9]*([0-9.,]+)/i);

    let fiyat = fiyatMatch ? parseFinansSayi(fiyatMatch[1]) : 0;
    let fonBuyuklugu = buyuklukMatch ? parseFinansSayi(buyuklukMatch[1]) : 0;
    let toplamPay = payMatch ? parseFinansSayi(payMatch[1]) : 0;
    let kaynakBelirteci = "Tera Portföy Resmi Sitesi";

    // --- FAIL-OVER (EMNİYET ŞERİDİ) ---
    // Eğer kurumsal site o gün bakımdaysa veya bulut IP'sini engellediyse cihaz kör kalmasın:
    if (fiyat === 0) {
      const bhtUrl = `https://www.bloomberght.com/fon/TLY`;
      const bhtResponse = await axios.get(bhtUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 5000
      }).catch(() => null);

      if (bhtResponse && bhtResponse.data) {
        const $bht = cheerio.load(bhtResponse.data);
        $bht('script, style, noscript').remove();
        const bhtMetin = $bht('body').text().replace(/\s+/g, ' ');

        const bhtFiyatMatch = bhtMetin.match(/Son Fiyat[^0-9]*([0-9.,]+)/i);
        const bhtBuyuklukMatch = bhtMetin.match(/(?:Fon Toplam Değeri|Büyüklük)[^0-9]*([0-9.,]+)/i);
        const bhtPayMatch = bhtMetin.match(/(?:Dolaşımdaki Pay|Pay Sayısı)[^0-9]*([0-9.,]+)/i);

        fiyat = parseFinansSayi(bhtFiyatMatch ? bhtFiyatMatch[1] : null);
        fonBuyuklugu = parseFinansSayi(bhtBuyuklukMatch ? bhtBuyuklukMatch[1] : null);
        toplamPay = parseFinansSayi(bhtPayMatch ? bhtPayMatch[1] : null);
        kaynakBelirteci = "Emniyet Şeridi (Bloomberg HT)";
      }
    }

    if (!fiyat || fiyat === 0) {
      return res.status(404).json({
        hata: "Resmi kaynak ve emniyet hattı üzerinden TLY fon fiyatı soyutlanamadı.",
        sayfaMetinOzeti: safMetin.substring(0, 300)
      });
    }

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // ESP32 terminalinin beklediği kusursuz JSON paketi
    res.status(200).json({
      fon: "TLY",
      fiyat: fiyat,
      fon_toplam_buyukluk_tl: fonBuyuklugu,
      toplam_pay_sayisi: Math.round(toplamPay),
      tarih: tarihStr,
      bilgi: {
        aktifKaynak: kaynakBelirteci
      }
    });

  } catch (error) {
    res.status(500).json({
      hata: "Sunucu içi kritik işlem hatası.",
      detay: error.message
    });
  }
};
