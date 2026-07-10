const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS ve JSON başlık kural tanımlamaları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const fonKodu = (req.query.fon || 'TLY').toUpperCase();

  // Türkçe finansal sayı formatını standart float'a dönüştüren fonksiyon
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
    // 1. HAT: FVT SCRIPT VE METADATA KATMANI TARAMASI
    // =================================================================
    const fvtUrl = `https://fvt.com.tr/fonlar/yatirim-fonlari/${fonKodu}`;
    const fvtResponse = await axios.get(fvtUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 4000
    }).catch(() => null);

    if (fvtResponse && fvtResponse.data) {
      const $fvt = cheerio.load(fvtResponse.data);
      let scriptMetni = '';
      
      // SEO verisi barındıran ld+json bloklarını topla
      $fvt('script[type="application/ld+json"], script[type="application/json"]').each((i, el) => {
        scriptMetni += $fvt(el).html() + ' ';
      });

      const fvtFiyatMatch = scriptMetni.match(/"price"\s*:\s*"?([0-9.,]+)"?/i);
      if (fvtFiyatMatch && fvtFiyatMatch[1]) {
        const fiyat = parseFinansSayi(fvtFiyatMatch[1]);
        if (fiyat > 0) {
          const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
          return res.status(200).json({
            fon: fonKodu,
            fiyat: fiyat,
            fon_toplam_buyukluk_tl: 0, 
            toplam_pay_sayisi: 0,
            tarih: tarihStr,
            kaynak: "fvt.com.tr (Metadata Katmanı)"
          });
        }
      }

      // --- SÖZDİZİMİ HATASI DÜZELTİLEN REGEX ALANI ---
      const safMetin = $fvt('body').text().replace(/\s+/g, ' ');
      // Soru işaretleri süslü parantezlerin dışına çıkarılarak crash engellendi:
      const fiyatRegex = safMetin.match(/(?:Fiyat|Son Fiyat)[\s\S]{0,20}?\b([0-9.,]+)\b/i);
      const buyuklukRegex = safMetin.match(/(?:Toplam Değer|Büyüklük|Portföy)[\s\S]{0,30}?\b([0-9.,]+)\b/i);
      const payRegex = safMetin.match(/(?:Pay Sayısı|Dolaşımdaki Pay)[\s\S]{0,30}?\b([0-9.,]+)\b/i);

      if (fiyatRegex && fiyatRegex[1]) {
        const fiyat = parseFinansSayi(fiyatRegex[1]);
        const fonBuyuklugu = buyuklukRegex ? parseFinansSayi(buyuklukRegex[1]) : 0;
        const toplamPay = payRegex ? parseFinansSayi(payRegex[1]) : 0;
        const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        
        return res.status(200).json({
          fon: fonKodu,
          fiyat: fiyat,
          fon_toplam_buyukluk_tl: fonBuyuklugu,
          toplam_pay_sayisi: Math.round(toplamPay),
          tarih: tarihStr,
          kaynak: "fvt.com.tr (Gövde Taraması)"
        });
      }
    }

    // =================================================================
    // 2. HAT: BLOOMBERG HT VERİ MOTORU (Yedek Kararlı Hat)
    // =================================================================
    const bhtUrl = `https://www.bloomberght.com/fon/tefas/${fonKodu.toLowerCase()}`;
    const bhtResponse = await axios.get(bhtUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 5000
    });

    const $bht = cheerio.load(bhtResponse.data);
    $bht('script, style, noscript').remove();
    const bhtMetin = $bht('body').text().replace(/\s+/g, ' ');

    const fiyatMatch = bhtMetin.match(/Son Fiyat\s*([0-9.,]+)/i);
    const buyuklukMatch = bhtMetin.match(/Fon Toplam Değeri\s*([0-9.,]+)/i);
    const payMatch = bhtMetin.match(/Dolaşımdaki Pay Sayısı\s*([0-9.,]+)/i);

    const fiyat = parseFinansSayi(fiyatMatch ? fiyatMatch[1] : null);
    const fonBuyuklugu = parseFinansSayi(buyuklukMatch ? buyuklukMatch[1] : null);
    const toplamPay = parseFinansSayi(payMatch ? payMatch[1] : null);

    if (!fiyat || fiyat === 0) {
      return res.status(404).json({ hata: "Yedek hat üzerinden de veri ayıklanamadı." });
    }

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    res.status(200).json({
      fon: fonKodu,
      fiyat: fiyat,
      fon_toplam_buyukluk_tl: fonBuyuklugu,
      toplam_pay_sayisi: Math.round(toplamPay),
      tarih: tarihStr,
      kaynak: "Yedek Hat (Bloomberg HT)"
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "Sistem kritik bir hata ile karsilasti.",
      detay: error.message 
    });
  }
};
