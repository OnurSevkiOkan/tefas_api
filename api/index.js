const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Doğrudan hedeflediğimiz Mynet sayfası
  const url = `https://finans.mynet.com/borsa/hisseler/tera-tera-yatirim-menkul-degerler/`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 7000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Ekranda paylaştığın DevTools görselindeki tam sınıf (class) yolunu hedef alıyoruz
    let hamFiyat = $('.finance-heading-new-bar .unit-price .data-value').text().trim();

    // Alternatif Fallback: Eğer üst klasör ismi esnerse sadece alt kırılımları dene
    if (!hamFiyat) {
      hamFiyat = $('.unit-price .data-value').text().trim();
    }

    if (!hamFiyat) {
      return res.status(404).json({ 
        hata: "Görseldeki '.finance-heading-new-bar .unit-price .data-value' seçicisi altında veri bulunamadı." 
      });
    }

    // " 155,90 " gibi gelen metindeki boşlukları ve gizli karakterleri temizle
    let temizFiyatMetni = hamFiyat.replace(/\s+/g, '').trim();

    // "155,90" formatındaki Türkçe sayıyı, backend ve ESP32 formatı olan "155.90" haline getiriyoruz
    // Binlik ayırıcı noktaları siler, ondalık virgülünü noktaya çevirir
    let noktaFormatli = temizFiyatMetni.replace(/\./g, '').replace(',', '.');
    const fiyatFloat = parseFloat(noktaFormatli);

    if (isNaN(fiyatFloat) || fiyatFloat === 0) {
      return res.status(404).json({ hata: "Ayıklanan fiyat geçersiz bir sayıya dönüştü." });
    }

    // Türkiye saatine göre güncel tarih bilgisi
    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // ESP32'ye gidecek tertemiz ve doğrulanmış veri paketi
    res.status(200).json({
      sembol: "TERA",
      fiyat: fiyatFloat,
      tarih: tarihStr,
      debug: {
        tarayicidanOkunanHamMetin: hamFiyat,
        temizlenmisMetin: temizFiyatMetni,
        hedefSelector: ".finance-heading-new-bar .unit-price .data-value"
      }
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "Mynet sunucusuna bağlanırken hata oluştu.",
      detay: error.message 
    });
  }
};
