const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const url = `https://fintables.com/fonlar/TLY`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Seçici: Gönderdiğin görseldeki .tabular-nums sınıflarını dizi olarak topluyoruz
    const tabularElements = $('.tabular-nums');
    
    if (tabularElements.length === 0) {
      return res.status(404).json({ hata: "Fintables DOM yapısında 'tabular-nums' bulunamadı." });
    }

    // İlk sıradaki tabular-nums her zaman ana birim fiyatıdır (Örn: 7.277,903951)
    let hamFiyat = $(tabularElements[0]).text().trim();

    // Sayfadaki diğer tabular-nums elementlerinden Fon Büyüklüğü ve Pay Sayısını tahminleme/ayıklama lojiği
    let hamBuyukluk = "";
    let hamPay = "";

    // Fintables yapısında genellikle diğer özet veriler de sıralı tabular-nums içindedir
    tabularElements.each((index, element) => {
      const text = $(element).text().trim();
      // Milyar/Milyon seviyesindeki büyük rakamları (Fon büyüklüğü veya pay sayısı) yakala
      if (index === 1) hamBuyukluk = text;
      if (index === 2) hamPay = text;
    });

    // Türkçe sayı formatını (7.277,903951) standart float (7277.903951) formatına çevirme fonksiyonu
    const temizleVeParseEt = (metin) => {
      if (!metin) return 0;
      return parseFloat(metin.replace(/\./g, '').replace(',', '.').trim());
    };

    const fiyat = temizleVeParseEt(hamFiyat);
    const fonBuyuklugu = temizleVeParseEt(hamBuyukluk);
    const toplamPay = temizleVeParseEt(hamPay);

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    res.status(200).json({
      fon: "TLY",
      fiyat: fiyat,
      fon_toplam_buyukluk_tl: fonBuyuklugu,
      toplam_pay_sayisi: Math.round(toplamPay),
      tarih: tarihStr,
      debug: {
        okunanHamFiyat: hamFiyat,
        kaynakUrl: url
      }
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "Fintables sunucusuna bağlanırken hata oluştu.",
      detay: error.message 
    });
  }
};
