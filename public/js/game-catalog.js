(function() {
  // Built-in Chinese catalog (fallback when language packs aren't loaded)
  var zhCatalog = {
    gomoku: {
      name: '五子棋',
      icon: '●',
      subtitle: '十五路攻防，五子成线',
      description: '更稳更长线的经典落子博弈。',
      players: '2人',
      duration: '约5分钟',
      category: '棋盘对弈',
      tags: ['策略', '对弈'],
      featured: false,
      supportsAI: true,
      maxPlayers: 2,
    },
    go9: {
      name: '围棋 9路',
      icon: '○',
      subtitle: '短局围棋，落子见功',
      description: '更快结束的小棋盘围棋，非常适合线上玩。',
      players: '2人',
      duration: '约15分钟',
      category: '棋盘对弈',
      tags: ['围地', '短局'],
      featured: false,
      supportsAI: true,
      maxPlayers: 2,
    },
    heat: {
      name: '热力',
      icon: '🔥',
      subtitle: '六体位快感卡，先弄倒对方',
      description: '选个体位，两人出卡推双方快感条，克制与节奏决定谁先到 100。',
      players: '2人',
      duration: '约3分钟',
      category: '双人情趣',
      tags: ['亲密', '对战'],
      featured: false,
      supportsAI: true,
      maxPlayers: 2,
    }
  };

  var catalog = zhCatalog;

  Object.keys(catalog).forEach(function(id) {
    if (!catalog[id].cover) {
      catalog[id].cover = '/assets/game-covers/' + id + '.webp';
    }
  });

  const order = [
    'gomoku',
    'go9',
    'heat'
  ];

  function getLangPack() {
    var lang = (window.__ACTIVE_LANG === 'en' && window.__LANG && window.__LANG.en && window.__LANG.en.catalog) ? 'en' : 'zh';
    return window.__LANG && window.__LANG[lang] && window.__LANG[lang].catalog;
  }

  function withId(id) {
    var entry = catalog[id];
    if (!entry) return null;
    // Merge language pack over base catalog for localized fields
    var lp = getLangPack();
    if (lp && lp[id]) {
      return Object.assign({ id }, entry, lp[id]);
    }
    return Object.assign({ id }, entry);
  }

  window.gameCatalog = {
    byId: function(id) {
      return withId(id);
    },
    list: function() {
      return order.map(withId).filter(Boolean);
    },
    featured: function() {
      return order.map(withId).filter(function(item) {
        return item && item.featured;
      });
    },
    categories: function() {
      var seen = {};
      var result = [];
      order.forEach(function(id) {
        var item = catalog[id];
        if (!item) return;
        var cat = item.category;
        var lp = getLangPack();
        if (lp && lp[id] && lp[id].category) cat = lp[id].category;
        if (seen[cat]) return;
        seen[cat] = true;
        result.push(cat);
      });
      return result;
    }
  };
})();
