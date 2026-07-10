const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS ve JSON yanıt başlıkları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Türkçe finansal sayıları standart float formatına (7277.90) getiren temizlik fonksiyonu
  const parseFinansSayi = (str) => {
    if (!str) return 0;
    let temiz = str.toString().replace(/[^0-9.,-]/g, '').trim();
    if (temiz.includes(',') && temiz.includes('.')) {
      temiz = temiz.replace(/\./g, '').replace(',', '.');
    } else if (temiz.includes(',')) {
      temiz = temiz.replace(',', '.');
    }
    return parseFloat(temiz) || 0;
  };

  // Next.js veri ağacında TLY fonuna ait nesneyi derinlemesine arayan fonksiyon
  const findFundRecursively = (obj, targetCode) => {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.code === targetCode || obj.kod === targetCode || obj.fund_code === targetCode) {
      return obj;
    }
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const result = findFundRecursively(obj[key], targetCode);
        if (result) return result;
      }
    }
    return null;
  };

  let birimFiyat = 0;
  let fonBuyuklugu = 0;
  let toplamPay = 0;
  let direktNetAkis = 0;

  try {
    // =================================================================
    // 1. ADIM: TERA PORTFÖY'DEN BİRİM FİYATI ÇEKME
    // =================================================================
    const teraUrl = 'https://www.teraportfoy.com/fonlarimiz/serbest-fonlarimiz/tera-portfoy-birinci-serbest-fon-tly';
    const teraResponse = await axios.get(teraUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 5000
    }).catch(() => null);

    if (teraResponse && teraResponse.data) {
      const $t = cheerio.load(teraResponse.data);
      $t('script, style, noscript').remove();
      const teraMetin = $t('body').text().replace(/\s+/g, ' ');
      
      const fiyatMatch = teraMetin.match(/Son Güncelleme Tarihi\s+([0-9.,]+)/i) || teraMetin.match(/\b(\d+,\d{4,6})\b/);
      if (fiyatMatch) {
        birimFiyat = parseFinansSayi(fiyatMatch[1]);
      }
    }

    // =================================================================
    // 2. ADIM: FINTABLES'TAN GİRİŞ/ÇIKIŞ VE DETAYLARI ÇEKME
    // =================================================================
    const fintablesUrl = 'https://fintables.com/fonlar/nakit-giris-cikisi';
    const fintablesResponse = await axios.get(fintablesUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 6000
    }).catch(() => null);

    if (fintablesResponse && fintablesResponse.data) {
      const $f = cheerio.load(fintablesResponse.data);
      const nextDataHtml = $f('#__NEXT_DATA__').html();
      
      if (nextDataHtml) {
        const nextData = JSON.parse(nextDataHtml);
        const tlyTabloObjesi = findFundRecursively(nextData, 'TLY');

        if (tlyTabloObjesi) {
          // Eğer Tera Portföy sitesi anlık çökerse fiyata yedek olarak Fintables değerini ata
          if (birimFiyat === 0) {
            birimFiyat = parseFinansSayi(tlyTabloObjesi.price || tlyTabloObjesi.fiyat || 0);
          }
          
          // Fintables Next.js veri alanındaki olası anahtar eşleşmeleri
          fonBuyuklugu = parseFinansSayi(tlyTabloObjesi.market_cap || tlyTabloObjesi.total_value || tlyTabloObjesi.fon_toplam_buyukluk_tl || 0);
          toplamPay = parseFinansSayi(tlyTabloObjesi.total_shares || tlyTabloObjesi.shares || tlyTabloObjesi.toplam_pay_sayisi || 0);
          direktNetAkis = parseFinansSayi(tlyTabloObjesi.net_flow || tlyTabloObjesi.flow || tlyTabloObjesi.net_giris_cikislari || tlyTabloObjesi.amount || 0);
        }
      }
    }

    // Her iki hattan da fiyat saptanamazsa güvenli hata mesajı fırlat
    if (birimFiyat === 0) {
      return res.status(200).json({
        hata: "Tera Portföy ve Fintables kaynaklarından birim fiyat saptanamadı."
      });
    }

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // ESP32 terminaline iletilecek konsolide veri paketi
    res.status(200).json({
      fon: "TLY",
      fiyat: birimFiyat,
      fon_toplam_buyukluk_tl: fonBuyuklugu,
      toplam_pay_sayisi: Math.round(toplamPay),
      direkt_net_nakit_akisi: direktNetAkis, // Fintables tablosundaki net giriş/çıkış miktarı (TL)
      tarih: tarihStr
    });

  } catch (error) {
    res.status(200).json({
      hata: "Hibrit veri hatları birleştirilirken hata oluştu.",
      detay: error.message
    });
  }
};
