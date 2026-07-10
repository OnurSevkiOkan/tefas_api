module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const fonKodu = req.query.fon || 'TLY';

  try {
    // ES Module (ESM) yapısını dinamik olarak içe aktarıyoruz
    const { TefasClient } = await import('@firstthumb/tefas-api');
    const client = new TefasClient();
    
    // Sadece "today" (bugün) dersek hafta sonu fiyatları boş dönebilir. 
    // Bu yüzden son 1 haftanın verisini çekip, dizideki en son (en güncel) günü alıyoruz.
    const response = await client.getFund('last week', 'today', fonKodu.toUpperCase());
    
    if (!response || !response.results || response.results.length === 0) {
      return res.status(404).json({ hata: "Yeni TEFAS altyapisinda fon verisi bulunamadi." });
    }

    // Gelen dizideki en son (en taze) objeyi seç
    const enGuncelVeri = response.results[response.results.length - 1];

    res.status(200).json({
      fon: enGuncelVeri.fundCode,
      fiyat: enGuncelVeri.price,
      tarih: enGuncelVeri.date
    });

  } catch (error) {
    res.status(500).json({ 
      hata: "TEFAS API baglantisi basarisiz oldu.",
      detay: error.message 
    });
  }
};
