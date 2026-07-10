const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS ve JSON başlıkları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const fonKodu = (req.query.fon || 'TLY').toUpperCase();
  
  // Bu sefer klasik ve sunucu taraflı (SSR) HTML basan Mynet Finans'ı hedefliyoruz
  const url = `https://finans.mynet.com/fon/${fonKodu}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 7000 // ESP32 zaman aşımına uğramasın diye 7 saniye limit
    });

    const html = response.data;
    const $ = cheerio.load(html);

    let fiyatText = '';

    // 1. Kademe: Mynet Finans'ın klasik fiyat sınıflarını tara
    fiyatText = $('.fn-fiyat').text() || $('.seans-fiyat').text() || '';

    // 2. Kademe (Fallback): Eğer seçiciler ıskalarsa, HTML içinde "Son Fiyat" kelimesinin sağını solunu Regex ile tara
    if (!fiyatText || fiyatText.trim() === '') {
      const regexMatch = html.match(/(?:Fiyat|Son Fiyat)[\s\S]*?>\s*([0-9.,]+)\s*</i);
      if (regexMatch) fiyatText = regexMatch[1];
    }

    // 3. Kademe (Fallback): Sayfada yer alan fon fiyatı formatındaki (Örn: 3,4567) ilk saf sayıyı cımbızla çek
    if (!fiyatText || fiyatText.trim() === '') {
      const generalRegex = html.match(/>\s*([0-9]{1,3},[0-9]{4,6})\s*</);
      if (generalRegex) fiyatText = generalRegex[1];
    }

    // Gelişmiş Hata Ayıklama: Eğer hala bulunamadıysa, Cloudflare barajına mı takıldık anlamak için HTML özetini dön
    if (!fiyatText || fiyatText.trim() === '') {
      const htmlSnippet = html.substring(0, 400).replace(/\s+/g, ' ');
      return res.status(404).json({ 
        hata: "Mynet DOM yapisinda fiyat sablonu ayristirilamadi.",
        SistemNotu: "Asagidaki veri eger Cloudflare iceriyorsa IP engellenmis demektir.",
        htmlSnippet: htmlSnippet
      });
    }

    // "3,4567" formatını ESP32'nin seveceği "3.4567" float formatına çeviriyoruz
    let temizFiyat = fiyatText.replace(/\./g, '').replace(',', '.').trim();
    const fiyatFloat = parseFloat(temizFiyat);

    if (isNaN(fiyatFloat) || fiyatFloat === 0) {
      return res.status(404).json({ hata: "Ayristirilan fiyat gecersiz bir sayısal degere sahip." });
    }

    // Türkiye saatine göre güncel tarih oluştur
    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // ESP32 ve Telegram'ın beklediği kusursuz çıktı
    res.status(200).json({
      fon: fonKodu,
      fiyat: fiyatFloat,
      tarih: tarihStr
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "Mynet sunucusuna erisim saglanirken ağ hatasi olustu.",
      detay: error.message 
    });
  }
};
