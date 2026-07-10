const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Varsayılan olarak TLY fonunu hedefliyoruz
  const fonKodu = (req.query.fon || 'TLY').toUpperCase();
  const url = `https://fon.doviz.com/tefas-fonlari/${fonKodu}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // 1. ADIM: Fon Fiyatını Çekme (.value sınıfı altındadır)
    let hamFiyat = $('.value').first().text().trim();
    
    // 2. ADIM: Sayfadaki tüm script ve gereksiz etiketleri temizleyip metne odaklanma
    $('script, style, noscript').remove();
    const sayfaMetni = $('body').text().replace(/\s+/g, ' ');

    // 3. ADIM: Fon Toplam Değerini (Büyüklüğünü) ve Pay Sayısını Regex ile Ayıklama
    // Döviz.com formatı örn: "Fon Toplam Değeri 12.345.678.900 TL" veya "Pay Sayısı 3.500.000.000"
    const buyuklukMatch = sayfaMetni.match(/Fon Toplam Değeri\s*([0-9.,]+)\s*TL/i);
    const paySayisiMatch = sayfaMetni.match(/Pay Sayısı\s*([0-9.,]+)/i);
    const degisimMatch = sayfaMetni.match(/Değişim\s*([-+]?[0-9.,]+)%/i);

    if (!hamFiyat) {
      return res.status(404).json({ hata: "Fon fiyatı sayfa yapısından çekilemedi." });
    }

    // --- VERİ TEMİZLEME VE FORMATLAMA ---
    // Fiyatı float yap (Örn: "3,4567" -> 3.4567)
    const fiyat = parseFloat(hamFiyat.replace(/\./g, '').replace(',', '.'));

    // Toplam Büyüklüğü saf sayıya çevir (Örn: "14.500.000.000,50" -> 14500000000.50)
    let fonBuyukluguTL = 0;
    if (buyuklukMatch && buyuklukMatch[1]) {
      fonBuyukluguTL = parseFloat(buyuklukMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    // Pay sayısını saf tam sayıya çevir
    let toplamPaySayisi = 0;
    if (paySayisiMatch && paySayisiMatch[1]) {
      toplamPaySayisi = parseInt(paySayisiMatch[1].replace(/\./g, ''));
    }

    // Günlük Değişim Yüzdesi
    let günlükDegisimYuzde = 0;
    if (degisimMatch && degisimMatch[1]) {
      günlükDegisimYuzde = parseFloat(degisimMatch[1].replace(',', '.'));
    }

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // ESP32'nin ve senin doğrudan okuyabileceğiniz zengin finans paketi
    res.status(200).json({
      fon: fonKodu,
      fiyat: fiyat,
      fon_toplam_buyukluk_tl: fonBuyukluguTL,
      toplam_pay_sayisi: toplamPaySayisi,
      gunluk_degisim_yuzde: günlükDegisimYuzde,
      tarih: tarihStr
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "Fon verileri çekilirken ağ veya sunucu hatası oluştu.",
      detay: error.message 
    });
  }
};
