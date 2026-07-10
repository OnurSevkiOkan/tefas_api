const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS ve JSON başlıkları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Doğrudan fvt.com.tr üzerindeki TLY fon sayfasını hedefliyoruz
  const url = 'https://fvt.com.tr/fonlar/yatirim-fonlari/TLY';

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9'
      },
      timeout: 9000 // Sunucu yanıt barajı
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Kod gürültüsünü engellemek için görsel olmayan tüm etiketleri DOM'dan temizle
    $('script, style, noscript, iframe, svg').remove();
    const safMetin = $('body').text().replace(/\s+/g, ' ');

    // --- DEĞİŞKEN TANIMLAMALARI ---
    let hamFiyat = "";
    let hamBuyukluk = "";
    let hamPay = "";

    // 1. Kademe: Hücre ve etiket bazlı akıllı arama algoritması
    // Sayfadaki metin bloklarında gezerek finansal etiketlerin yakınındaki sayısal değerleri yakalar
    $('*').each((i, el) => {
      const text = $(el).text().trim();
      
      if (text.includes('Son Fiyat') || text.includes('Birim Fiyat')) {
        hamFiyat = $(el).next().text().trim() || text.match(/[0-9.,]+/)?.[0] || "";
      }
      if (text.includes('Fon Toplam Değeri') || text.includes('Portföy Büyüklüğü')) {
        hamBuyukluk = $(el).next().text().trim() || text.match(/[0-9.,]+/)?.[0] || "";
      }
      if (text.includes('Dolaşımdaki Pay') || text.includes('Pay Sayısı')) {
        hamPay = $(el).next().text().trim() || text.match(/[0-9.,]+/)?.[0] || "";
      }
    });

    // 2. Kademe (Strict Fallback): Eğer etiketler arası boşluk varsa doğrudan ham metinden Regex ile süz
    if (!hamFiyat) {
      const fiyatRegex = safMetin.match(/(?:Fiyat|Son Fiyat)[\s\S]{0,20?}\b([0-9.,]+)\b/i);
      if (fiyatRegex) hamFiyat = fiyatRegex[1];
    }
    if (!hamBuyukluk) {
      const buyuklukRegex = safMetin.match(/(?:Toplam Değer|Büyüklük|Portföy)[\s\S]{0,30?}\b([0-9.,]+)\b/i);
      if (buyuklukRegex) hamBuyukluk = buyuklukRegex[1];
    }
    if (!hamPay) {
      const payRegex = safMetin.match(/(?:Pay Sayısı|Dolaşımdaki Pay)[\s\S]{0,30?}\b([0-9.,]+)\b/i);
      if (payRegex) hamPay = payRegex[1];
    }

    // 3. Kademe (Nihai Fon Fiyatı Güvencesi): Eğer hala fiyat yoksa virgülden sonra 4-6 haneli ilk sayıyı kopar
    if (!hamFiyat) {
      const fonFormatRegex = safMetin.match(/\b(\d+,\d{4,6})\b/);
      if (fonFormatRegex) hamFiyat = fonFormatRegex[1];
    }

    // Türkçe finansal sayı formatını (1.234.567,89) standart float yapısına dönüştüren fonksiyon
    const finansalParse = (str) => {
      if (!str) return 0;
      let temiz = str.replace(/[^0-9.,]/g, '').trim(); // Sayı, nokta ve virgül dışındakileri temizle
      if (temiz.includes(',') && temiz.includes('.')) {
        temiz = temiz.replace(/\./g, '').replace(',', '.');
      } else if (temiz.includes(',')) {
        temiz = temiz.replace(',', '.');
      }
      return parseFloat(temiz) || 0;
    };

    const fiyat = finansalParse(hamFiyat);
    const fonBuyukluguTL = finansalParse(hamBuyukluk);
    const toplamPaySayisi = finansalParse(hamPay);

    if (fiyat === 0) {
      return res.status(404).json({
        hata: "FVT sayfa içeriğinden geçerli bir fon fiyatı soyutlanamadı.",
        debugSnippet: safMetin.substring(0, 400)
      });
    }

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // ESP32'nin beklediği standart endüstriyel JSON çıktısı
    res.status(200).json({
      fon: "TLY",
      fiyat: fiyat,
      fon_toplam_buyukluk_tl: fonBuyukluguTL,
      toplam_pay_sayisi: Math.round(toplamPaySayisi),
      tarih: tarihStr
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "FVT sunucusuna erişim sağlanırken ağ katmanı hatası oluştu.",
      detay: error.message 
    });
  }
};
