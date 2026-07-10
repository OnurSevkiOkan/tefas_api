const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const fonKodu = (req.query.fon || 'TLY').toLowerCase();
  // Bloomberg HT TEFAS fon detay sayfası
  const url = `https://www.bloomberght.com/fon/tefas/${fonKodu}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 8000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Gereksiz kod bloklarını uçurarak belleği temizle
    $('script, style, noscript').remove();
    const sayfaMetni = $('body').text().replace(/\s+/g, ' ');

    // --- NOKTA ATIŞI REGEX AYIKLAMA SÜZGEÇLERİ ---
    // Bloomberg HT formatına göre verileri ham metinden cımbızla çekiyoruz
    const fiyatMatch = sayfaMetni.match(/Son Fiyat\s*([0-9.,]+)/i);
    const buyuklukMatch = sayfaMetni.match(/Fon Toplam Değeri\s*([0-9.,]+)/i);
    const payMatch = sayfaMetni.match(/Dolaşımdaki Pay Sayısı\s*([0-9.,]+)/i);

    if (!fiyatMatch) {
      return res.status(404).json({ 
        hata: "Bloomberg HT uzerinde TLY fonu verileri ayristirilamadi.",
        metinOzeti: sayfaMetni.substring(0, 300)
      });
    }

    // Türkçe sayı formatını (1.234.567,89) standart float'a (1234567.89) çevirme fonksiyonu
    const parseFinansSayi = (str) => {
      if (!str) return 0;
      return parseFloat(str.replace(/\./g, '').replace(',', '.').trim());
    };

    const fiyat = parseFinansSayi(fiyatMatch[1]);
    const fonBuyukluguTL = parseFinansSayi(buyuklukMatch ? buyuklukMatch[1] : "0");
    const toplamPaySayisi = parseFinansSayi(payMatch ? payMatch[1] : "0");

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // ESP32'nin ve senin doğrudan tarayıcıda görebileceğin eksiksiz veri paketi
    res.status(200).json({
      fon: fonKodu.toUpperCase(),
      fiyat: fiyat,
      fon_toplam_buyukluk_tl: fonBuyukluguTL,
      toplam_pay_sayisi: Math.round(toplamPaySayisi), // Pay sayısı tam sayıdır
      tarih: tarihStr
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "Bloomberg HT sunucusuna erisilirken hata olustu.",
      detay: error.message 
    });
  }
};
