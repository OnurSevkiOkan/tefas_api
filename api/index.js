const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const fonKodu = (req.query.fon || 'TLY').toUpperCase();

  // Türkçe finansal sayı formatını (1.234.567,89) standart float'a çeviren yardımcı fonksiyon
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
    // =================================================================
    // 1. HAT: FVT SCRIPT KATMANI TARAMASI (İstediğiniz Öncelikli Kaynak)
    // =================================================================
    const fvtUrl = `https://fvt.com.tr/fonlar/yatirim-fonlari/${fonKodu}`;
    const fvtResponse = await axios.get(fvtUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 4000
    }).catch(() => null);

    if (fvtResponse && fvtResponse.data) {
      const $fvt = cheerio.load(fvtResponse.data);
      let scriptMetni = '';
      
      // HTML gövdesi "Yukleniyor" dese bile, SEO için eklenen ld+json etiketlerini tara
      $fvt('script[type="application/ld+json"], script[type="application/json"]').each((i, el) => {
        scriptMetni += $fvt(el).html() + ' ';
      });

      // Script bloklarının içerisinden fiyat parametrelerini Regex ile ayıklamayı dene
      const fvtFiyatMatch = scriptMetni.match(/"price"\s*:\s*"?([0-9.,]+)"?/i);
      if (fvtFiyatMatch && fvtFiyatMatch[1]) {
        const fiyat = parseFinansSayi(fvtFiyatMatch[1]);
        if (fiyat > 0) {
          const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
          return res.status(200).json({
            fon: fonKodu,
            fiyat: fiyat,
            fon_toplam_buyukluk_tl: 0, // SPA içi kısıtlı metadata durumunda default
            toplam_pay_sayisi: 0,
            tarih: tarihStr,
            kaynak: "fvt.com.tr (Metadata Katmanı)"
          });
        }
      }
    }

    // =================================================================
    // 2. HAT: BLOOMBERG HT VERİ MOTORU (Kusursuz Kesintisiz Yedek Hat)
    // =================================================================
    // FVT'nin gövdesi boş geldiğinde ESP32'nin kör kalmaması için devreye giren kurumsal SSR altyapısı
    const bhtUrl = `https://www.bloomberght.com/fon/tefas/${fonKodu.toLowerCase()}`;
    const bhtResponse = await axios.get(bhtUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0;
