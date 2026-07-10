const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

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

  let birimFiyat = 0;
  let direktNetAkis = 0;

  try {
    // =================================================================
    // 1. ADIM: TERA PORTFÖY (FİYAT MOTORU - DİREKT BAĞLANTI)
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
    // 2. ADIM: FINTABLES (PROXY İLE IP ENGELİNİ AŞMA)
    // =================================================================
    // Fintables'a direkt gitmek yerine AllOrigins Proxy üzerinden geçiyoruz
    const fintablesProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://fintables.com/fonlar/nakit-giris-cikisi')}`;
    
    const fintablesResponse = await axios.get(fintablesProxyUrl, {
      timeout: 8000
    }).catch(() => null);

    // AllOrigins proxy'si sitenin HTML kodlarını 'contents' adlı JSON anahtarında döndürür
    if (fintablesResponse && fintablesResponse.data && fintablesResponse.data.contents) {
      const rawHtml = fintablesResponse.data.contents;
      const $f = cheerio.load(rawHtml);
      const nextDataHtml = $f('#__NEXT_DATA__').html();
      
      if (nextDataHtml) {
        const nextData = JSON.parse(nextDataHtml);
        
        // JSON ağacında "TLY" fonunu alttan yukarıya tarayan zeki arama motoru
        let tlyRow = null;
        const searchNode = (node, parent) => {
          if (!node || typeof node !== 'object') return;
          if (node.code === 'TLY' || node.kod === 'TLY' || node.fund_code === 'TLY') {
            tlyRow = { current: node, parent: parent };
            return;
          }
          for (const key in node) {
            if (tlyRow) return;
            searchNode(node[key], node);
          }
        };
        
        searchNode(nextData, null);

        if (tlyRow) {
          const obj = tlyRow.parent || {};
          const cur = tlyRow.current || {};
          
          const extractFlow = (targetObj) => {
            if (!targetObj) return 0;
            const priorityKeys = ['daily_flow', 'net_flow', 'flow', 'net_giris_cikis', 'diff'];
            for (const pk of priorityKeys) {
               for (const key in targetObj) {
                  if (key.toLowerCase().includes(pk) && key.toLowerCase() !== 'total_value') {
                     const val = targetObj[key];
                     if (typeof val === 'number') return val;
                     if (typeof val === 'string' && val.match(/[0-9-]/)) return parseFinansSayi(val);
                  }
               }
            }
            return 0;
          };

          direktNetAkis = extractFlow(obj) || extractFlow(cur) || 0;
        }
      }
    }

    if (birimFiyat === 0) {
      return res.status(200).json({ hata: "Tera Portföy fiyatı saptanamadı." });
    }

    const tarihStr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

    res.status(200).json({
      fon: "TLY",
      fiyat: birimFiyat,
      direkt_net_nakit_akisi: direktNetAkis,
      tarih: tarihStr
    });

  } catch (error) {
    res.status(200).json({
      hata: "Veri isleme sirasinda sunucu hatasi.",
      detay: error.message
    });
  }
};
