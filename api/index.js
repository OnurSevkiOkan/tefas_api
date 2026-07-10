const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const fonKodu = (req.query.fon || 'TLY').toUpperCase();
  const url = `https://finans.mynet.com/fon/${fonKodu}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 7000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    let fiyatText = '';
    let eslesmeKaynagi = '';

    // 1. Kademe: Doğrudan Mynet'in ana fiyat sınıflarını hedef alıyoruz
    if ($('.fn-fiyat').length > 0) {
      fiyatText = $('.fn-fiyat').first().text().trim();
      eslesmeKaynagi = "DOM_Class_fn-fiyat";
    } else if ($('.seans-fiyat').length > 0) {
      fiyatText = $('.seans-fiyat').first().text().trim();
      eslesmeKaynagi = "DOM_Class_seans-fiyat";
    }

    // 2. Kademe (Fallback): Sınıflar boşsa, HTML içindeki "Son Fiyat" tablosunu Regex ile tara
    if (!fiyatText) {
      const regexMatch = html.match(/(?:Fiyat|Son Fiyat)[\s\S]*?>\s*([0-9.,]+)\s*</i);
      if (regexMatch) {
        fiyatText = regexMatch[1].trim();
        eslesmeKaynagi = "Regex_Son_Fiyat";
      }
    }

    // Ayıklanan metni ham haliyle saklayalım (Debugger için)
    const hamMetin = fiyatText;

    if (!fiyatText) {
      return res.status(404).json({ hata: "Sayfada fiyata dair hicbir metin bulunamadi." });
    }

    // --- AKILLI SAYI FORMATLAMA ALGORİTMASI ---
    // Eğer veride hem nokta hem virgül varsa (Örn: 2.048,15 -> İki bin kırk sekiz nokta on beş)
    // Noktayı (binlik ayırıcıyı) sil, virgülü noktaya çevir.
    let temizFiyat = fiyatText;
    if (temizFiyat.includes(',') && temizFiyat.includes('.')) {
      temizFiyat = temizFiyat.replace(/\./g, '').replace(',', '.');
    } 
    // Eğer sadece virgül varsa (Örn: 3,4567 -> Üç nokta kırk beş altmış yedi)
    // Virgülü direkt noktaya çevir.
    else if (temizFiyat.includes(',')) {
      temizFiyat = temizFiyat.replace(',', '.');
    }
    // Eğer sadece nokta varsa (Örn: 2.048) binlik mi yoksa ondalık mı ayırt etmek zor.
    // Ancak fon fiyatları küsuratlı olduğu için bunu direkt ondalık (float) kabul ediyoruz, dokunmuyoruz.

    const fiyatFloat = parseFloat(temizFiyat);

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // ESP32'nin kafası karışmasın ama biz tarayıcıdan bakınca her şeyi görelim diye genişletilmiş çıktı:
    res.status(200).json({
      fon: fonKodu,
      fiyat: fiyatFloat,
      tarih: tarihStr,
      // Hata ayıklama (Debug) parametreleri:
      debug: {
        yakalananHamMetin: hamMetin,
        formatlanmisMetin: temizFiyat,
        verininAlindigiYer: eslesmeKaynagi
      }
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "Ağ veya sunucu hatası oluştu.",
      detay: error.message 
    });
  }
};
