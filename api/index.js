const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const parseFinans = (str) => {
    if (!str) return 0;
    let t = str.replace(/[^0-9.,]/g, '').trim();
    if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
    else if (t.includes(',')) t = t.replace(',', '.');
    return parseFloat(t) || 0;
  };

  try {
    // -------------------------------------------------------------
    // KAYNAK 1: TERA PORTFÖY (Sadece Birim Fiyat İçin - Senin Tercihin)
    // -------------------------------------------------------------
    let fiyat = 0;
    const teraRes = await axios.get('https://www.teraportfoy.com/fonlarimiz/serbest-fonlarimiz/tera-portfoy-birinci-serbest-fon-tly', {
        headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000
    }).catch(() => null);

    if (teraRes) {
        const $t = cheerio.load(teraRes.data);
        $t('script, style').remove();
        const tMetin = $t('body').text().replace(/\s+/g, ' ');
        // Tera'nın özel metin diziliminden fiyatı çekiyoruz
        const fiyatMatch = tMetin.match(/Son Güncelleme Tarihi\s+([0-9.,]+)/i);
        fiyat = fiyatMatch ? parseFinans(fiyatMatch[1]) : 0;
    }

    // -------------------------------------------------------------
    // KAYNAK 2: BIGPARA (Tera'da Olmayan Büyüklük ve Pay Sayısı İçin)
    // -------------------------------------------------------------
    let fonBuyuklugu = 0;
    let toplamPay = 0;
    const bpRes = await axios.get('https://bigpara.hurriyet.com.tr/fon/detay/TLY/', {
        headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000
    }).catch(() => null);

    if (bpRes) {
        const $b = cheerio.load(bpRes.data);
        $b('script, style').remove();
        const bpMetin = $b('body').text().replace(/\s+/g, ' ');
        
        // Bigpara'nın standart finans tablolarından hacim verilerini çekiyoruz
        const bMatch = bpMetin.match(/(?:Fon Toplam Değeri|Toplam Değer)[^0-9]*([0-9.,]+)/i);
        const pMatch = bpMetin.match(/(?:Dolaşımdaki Pay|Pay Sayısı)[^0-9]*([0-9.,]+)/i);
        
        fonBuyuklugu = bMatch ? parseFinans(bMatch[1]) : 0;
        toplamPay = pMatch ? parseFinans(pMatch[1]) : 0;
    }

    // Eğer kaynaklardan pay sayısı gelmez ama büyüklük gelirse, matematiksel ters mühendislik yap:
    if (toplamPay === 0 && fonBuyuklugu > 0 && fiyat > 0) {
        toplamPay = fonBuyuklugu / fiyat;
    }

    res.status(200).json({
      fon: "TLY",
      fiyat: fiyat,
      fon_toplam_buyukluk_tl: fonBuyuklugu,
      toplam_pay_sayisi: Math.round(toplamPay),
      tarih: new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })
    });

  } catch (error) {
    res.status(500).json({ hata: "Sunucu içi birleştirme hatası.", detay: error.message });
  }
};
