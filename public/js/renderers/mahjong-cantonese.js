// public/js/renderers/mahjong-cantonese.js
// Canvas renderer for Cantonese Mahjong (鸡平胡). Honours shown as Chinese characters.
(function() {
  window.gameRenderers = window.gameRenderers || new Map();

  var canvas, ctx, W, H, dpr;
  var TW, TH; // tile width/height
  var _state = null, _playerIndex = 0, _winner = null;
  var _tiles = []; // clickable hand tiles: [{ x, y, w, h, tile }]
  var _hoverId = null;
  var _claimBtns = []; // claim button rects: [{ x, y, w, h, action }]

  // Honour display names
  var HONOUR = { 'feng': ['', '东', '南', '西', '北'], 'jian': ['', '中', '发', '白'] };
  var SUIT_GLYPH = { wan: '万', tong: '筒', tiao: '条' };

  var STYLES =
    '.mj-wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;}' +
    '.mj-claim{display:flex;gap:8px;pointer-events:auto;}' +
    '.mj-btn{padding:10px 18px;border-radius:10px;border:2px solid var(--border);background:var(--surface);font-size:15px;font-weight:700;cursor:pointer;transition:transform .12s;' +
    'color:var(--text);}.mj-btn:active{transform:scale(.92);}' +
    '.mj-btn-win{background:#c8a45c;border-color:#c8a45c;color:#fff;}' +
    '.mj-btn-pass{background:var(--bg);}' +
    '.mj-toast{position:absolute;top:14%;left:50%;transform:translateX(-50%);font-size:15px;font-weight:700;color:var(--accent);background:rgba(0,0,0,.5);padding:6px 16px;border-radius:20px;pointer-events:none;opacity:0;transition:opacity .3s;}' +
    '.mj-toast.show{opacity:1;}';

  window.gameRenderers.set('mahjong-cantonese', {
    init: function(container) {
      injectStylesOnce('mjStyles', STYLES);
      canvas = document.createElement('canvas');
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.style.position = 'relative';
      container.innerHTML = '';
      container.appendChild(canvas);

      // claim button overlay
      var overlay = document.createElement('div');
      overlay.className = 'mj-wrap';
      var claim = document.createElement('div');
      claim.className = 'mj-claim';
      claim.id = 'mjClaim';
      claim.style.display = 'none';
      overlay.appendChild(claim);
      container.appendChild(overlay);

      // toast
      var toast = document.createElement('div');
      toast.className = 'mj-toast';
      toast.id = 'mjToast';
      container.appendChild(toast);

      ctx = canvas.getContext('2d');
      resize();
      window.addEventListener('resize', resize);
      canvas.addEventListener('click', onClick);
      canvas.addEventListener('mousemove', onMove);
    },

    render: function(state, container, playerIndex, winner) {
      _state = state;
      _playerIndex = playerIndex;
      _winner = winner;
      draw();
    }
  });

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // tile sizing relative to screen width
    TW = Math.max(28, Math.min(46, W / 18));
    TH = TW * 1.35;
  }

  // ---- drawing ----

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!_state || !_state.hands) return;
    var n = _state._playerCount || 4;

    // discards in center
    drawDiscards();

    // hands: self at bottom, others as tile-backs on top/left/right
    drawHand(0, 'bottom');
    if (n >= 2) drawHand(1, 'right');
    if (n >= 3) drawHand(2, 'top');
    if (n >= 4) drawHand(3, 'left');

    // melds
    drawMelds();

    // current player highlight + status
    drawStatus();

    // claim buttons
    updateClaimButtons();
  }

  function tileFace(x, y, w, h, tile, highlight) {
    // body
    ctx.fillStyle = highlight ? '#fffbe6' : '#fdfcf5';
    roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = highlight ? '#c8a45c' : '#d8ccb0';
    ctx.lineWidth = highlight ? 2.5 : 1.5;
    ctx.stroke();

    if (tile.k === 'feng' || tile.k === 'jian') {
      var name = HONOUR[tile.k][tile.n] || '';
      ctx.fillStyle = tile.k === 'jian' && tile.n === 1 ? '#c0392b' : '#2c3e50';
      ctx.font = 'bold ' + (h * 0.42) + 'px "Ma Shan Zheng","KaiTi","楷体","Microsoft YaHei",serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, x + w / 2, y + h / 2 + 1);
    } else {
      // number + suit glyph
      ctx.fillStyle = tile.k === 'wan' ? '#c0392b' : (tile.k === 'tong' ? '#2c3e50' : '#1e8449');
      ctx.font = 'bold ' + (w * 0.46) + 'px "Ma Shan Zheng","KaiTi","Microsoft YaHei",serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tile.n, x + w / 2, y + h * 0.36);
      ctx.font = (w * 0.3) + 'px "Ma Shan Zheng","KaiTi","Microsoft YaHei",serif';
      ctx.fillText(SUIT_GLYPH[tile.k] || '', x + w / 2, y + h * 0.74);
    }
  }

  function tileBack(x, y, w, h) {
    ctx.fillStyle = '#3a6b54';
    roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = '#2c523f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // simple motif
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + h * 0.3);
    ctx.lineTo(x + w * 0.7, y + h * 0.7);
    ctx.moveTo(x + w * 0.7, y + h * 0.3);
    ctx.lineTo(x + w * 0.3, y + h * 0.7);
    ctx.stroke();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // seat position for player p relative to viewing _playerIndex
  function seatPos(p, n) {
    var offset = (p - _playerIndex + n) % n;
    return offset; // 0=self(bottom),1=right,2=top,3=left
  }

  function drawHand(p, where) {
    var hand = _state.hands[p];
    if (!hand) return;
    var n = _state._playerCount || 4;
    var pos = seatPos(p, n);
    var isSelf = p === _playerIndex;
    var count = Array.isArray(hand) ? hand.length : hand;
    var tw = TW, th = TH;
    var gap = 4;

    if (isSelf) {
      var totalW = count * (tw + gap);
      var sx = (W - totalW) / 2;
      var sy = H - th - 24;
      _tiles = [];
      if (Array.isArray(hand)) {
        for (var i = 0; i < hand.length; i++) {
          var x = sx + i * (tw + gap);
          var hover = _hoverId === hand[i].id;
          var ty = hover ? sy - 10 : sy;
          tileFace(x, ty, tw, th, hand[i], hover);
          _tiles.push({ x: x, y: ty, w: tw, h: th, tile: hand[i] });
        }
      }
      // label
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('你 (点击手牌出牌)', W / 2, sy - 8);
    } else {
      // tile backs
      var smallW = tw * 0.8, smallH = th * 0.8;
      if (pos === 2) { // top
        var tw2 = count * (smallW + 2);
        var sx2 = (W - tw2) / 2;
        for (var j = 0; j < count; j++) tileBack(sx2 + j * (smallW + 2), 18, smallW, smallH);
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(playerName(p) + ' (' + count + '张)', W / 2, 18 + smallH + 16);
      } else if (pos === 1) { // right, vertical
        var rh = count * (smallH + 2);
        var sy3 = (H - rh) / 2;
        for (var k = 0; k < count; k++) tileBack(W - smallW - 16, sy3 + k * (smallH + 2), smallW, smallH);
      } else if (pos === 3) { // left, vertical
        var lh = count * (smallH + 2);
        var sy4 = (H - lh) / 2;
        for (var l = 0; l < count; l++) tileBack(16, sy4 + l * (smallH + 2), smallW, smallH);
      }
    }
  }

  function drawDiscards() {
    var cx = W / 2, cy = H / 2;
    var dw = TW * 0.7, dh = TH * 0.7;
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('牌河', cx, cy - 70);

    for (var p = 0; p < _state.discards.length; p++) {
      var pile = _state.discards[p];
      if (!pile || !pile.length) continue;
      var pos = seatPos(p, _state._playerCount || 4);
      var perRow = 8;
      for (var i = 0; i < pile.length; i++) {
        var row = Math.floor(i / perRow);
        var col = i % perRow;
        var ox, oy;
        if (pos === 0) { ox = cx - (perRow * (dw + 2)) / 2 + col * (dw + 2); oy = cy + 50 + row * (dh + 2); }
        else if (pos === 2) { ox = cx - (perRow * (dw + 2)) / 2 + col * (dw + 2); oy = cy - 60 - row * (dh + 2) - dh; }
        else if (pos === 1) { ox = cx + 90 + row * (dw + 2); oy = cy - (perRow * (dh + 2)) / 2 + col * (dh + 2); }
        else { ox = cx - 90 - row * (dw + 2) - dw; oy = cy - (perRow * (dh + 2)) / 2 + col * (dh + 2); }
        var isLast = _state.lastDiscard && _state.lastDiscard.player === p && i === pile.length - 1;
        tileFace(ox, oy, dw, dh, pile[i], isLast);
      }
    }
  }

  function drawMelds() {
    if (!_state.melds) return;
    var tw = TW * 0.6, th = TH * 0.6;
    for (var p = 0; p < _state.melds.length; p++) {
      var melds = _state.melds[p];
      if (!melds || !melds.length) continue;
      var pos = seatPos(p, _state._playerCount || 4);
      var idx = 0;
      for (var m = 0; m < melds.length; m++) {
        var md = melds[m];
        for (var i = 0; i < md.tiles.length; i++) {
          var x, y;
          var baseY = H - 100 - m * (th + 4);
          if (pos === 0) { x = 20 + idx * (tw + 2); y = baseY; }
          else if (pos === 2) { x = 20 + idx * (tw + 2); y = 20 + m * (th + 4); }
          else if (pos === 1) { x = W - tw - 20 - idx * (tw + 2); y = H / 2 + m * (th + 4); }
          else { x = 20 + idx * (tw + 2); y = H / 2 + m * (th + 4); }
          tileFace(x, y, tw, th, md.tiles[i], false);
          idx++;
        }
      }
    }
  }

  function drawStatus() {
    if (_state.winner !== null && _state.winner !== undefined) return;
    var s = _state;
    var msg = '';
    if (s.phase === 'play') {
      msg = (s.currentPlayer === _playerIndex) ? '轮到你出牌' : (playerName(s.currentPlayer) + ' 出牌中');
    } else if (s.phase === 'claim') {
      var actor = s.claim.order[s.claim.idx];
      msg = (actor === _playerIndex) ? '请选择吃碰杠或过' : (playerName(actor) + ' 正在选择');
    }
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, W / 2, H / 2 + 120);

    // wall count
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = '12px sans-serif';
    ctx.fillText('余牌: ' + (Array.isArray(s.wall) ? s.wall.length : s.wall), W / 2, H / 2 + 142);
  }

  // ---- claim buttons ----

  function updateClaimButtons() {
    var el = document.getElementById('mjClaim');
    if (!el) return;
    if (_state.phase !== 'claim' || !_state.claim) { el.style.display = 'none'; return; }
    var actor = _state.claim.order[_state.claim.idx];
    if (actor !== _playerIndex) { el.style.display = 'none'; return; }

    var tile = _state.claim.tile;
    var hand = _state.hands[_playerIndex];
    var n = _state._playerCount;
    var isUpstream = _playerIndex === (_state.claim.discarder + 1) % n;

    // compute options (mirror server logic)
    var opts = [];
    var test = hand.slice(); test.push(tile);
    if (coreHuCheck(test)) opts.push({ action: 'win', label: '胡', cls: 'mj-btn-win' });

    var mc = matchInHand(hand, tile.k, tile.n);
    if (mc >= 3 && tile.k !== 'feng' && tile.k !== 'jian') opts.push({ action: 'kong', label: '杠' });
    if (mc >= 2 && tile.k !== 'feng' && tile.k !== 'jian') opts.push({ action: 'pung', label: '碰' });
    if (isUpstream && tile.k !== 'feng' && tile.k !== 'jian') {
      // chow possible?
      if (canChow(hand, tile)) opts.push({ action: 'chow', label: '吃' });
    }
    opts.push({ action: 'pass', label: '过', cls: 'mj-btn-pass' });

    el.style.display = 'flex';
    el.innerHTML = '';
    for (var i = 0; i < opts.length; i++) {
      (function(opt) {
        var b = document.createElement('button');
        b.className = 'mj-btn' + (opt.cls ? ' ' + opt.cls : '');
        b.textContent = opt.label;
        b.onclick = function() {
          if (opt.action === 'chow') {
            // pick first chow pair
            var pair = firstChowPair(hand, tile);
            window.makeGameMove({ type: 'chow', tiles: pair ? pair.map(function(t){return t.id;}) : [] });
          } else {
            window.makeGameMove({ type: opt.action });
          }
        };
        el.appendChild(b);
      })(opts[i]);
    }
  }

  // Browser has no module import; use inlined check (mirrors games/lib/mahjong-core).
  function coreHuCheck(tiles) {
    return huCheckSimple(tiles);
  }

  function matchInHand(hand, k, n) {
    var c = 0;
    for (var i = 0; i < hand.length; i++) if (hand[i].k === k && hand[i].n === n) c++;
    return c;
  }

  function canChow(hand, tile) {
    if (tile.k === 'feng' || tile.k === 'jian') return false;
    var k = tile.k, n = tile.n;
    var has = function(num) { return hand.some(function(t){return t.k===k&&t.n===num;}); };
    if (n-2 >= 1 && has(n-2) && has(n-1)) return true;
    if (n-1 >= 1 && n+1 <= 9 && has(n-1) && has(n+1)) return true;
    if (n+2 <= 9 && has(n+1) && has(n+2)) return true;
    return false;
  }

  function firstChowPair(hand, tile) {
    if (tile.k === 'feng' || tile.k === 'jian') return null;
    var k = tile.k, n = tile.n;
    var got = function(num) { return hand.find(function(t){return t.k===k&&t.n===num;}); };
    var tries = [];
    if (n-2 >= 1) tries.push([n-2,n-1]);
    if (n-1 >= 1 && n+1 <= 9) tries.push([n-1,n+1]);
    if (n+2 <= 9) tries.push([n+1,n+2]);
    for (var i = 0; i < tries.length; i++) {
      var a = got(tries[i][0]), b = got(tries[i][1]);
      if (a && b) return [a, b];
    }
    return null;
  }

  // Lightweight hu check for the browser when core isn't globally exposed.
  // Mirrors games/lib/mahjong-core huCheck (standard + seven pairs).
  function huCheckSimple(tiles) {
    var counts = {};
    for (var i = 0; i < tiles.length; i++) {
      var key = tiles[i].k + ':' + tiles[i].n;
      counts[key] = (counts[key] || 0) + 1;
    }
    var keys = Object.keys(counts);
    for (var pi = 0; pi < keys.length; pi++) {
      if (counts[keys[pi]] >= 2) {
        var tc = Object.assign({}, counts);
        tc[keys[pi]] -= 2;
        if (tc[keys[pi]] === 0) delete tc[keys[pi]];
        if (canFormMelds(tc)) return true;
      }
    }
    // seven pairs (七对): 7 distinct pairs, only with a 14-tile hand
    if (tiles.length === 14 && keys.length === 7) {
      var allPairs = true;
      for (var j = 0; j < keys.length; j++) {
        if (counts[keys[j]] !== 2) { allPairs = false; break; }
      }
      if (allPairs) return true;
    }
    return false;
  }

  function canFormMelds(counts) {
    var keys = Object.keys(counts).filter(function(k){return counts[k]>0;});
    if (keys.length === 0) return true;
    var key = keys[0];
    var parts = key.split(':');
    var k = parts[0], n = parseInt(parts[1]);
    if (counts[key] >= 3) {
      var next = Object.assign({}, counts);
      next[key] -= 3;
      if (next[key] === 0) delete next[key];
      if (canFormMelds(next)) return true;
    }
    if (k !== 'feng' && k !== 'jian' && n <= 7) {
      var k2 = k + ':' + (n+1), k3 = k + ':' + (n+2);
      if (counts[k2] > 0 && counts[k3] > 0) {
        var next2 = Object.assign({}, counts);
        next2[key]--; next2[k2]--; next2[k3]--;
        if (next2[key] === 0) delete next2[key];
        if (next2[k2] === 0) delete next2[k2];
        if (next2[k3] === 0) delete next2[k3];
        if (canFormMelds(next2)) return true;
      }
    }
    return false;
  }

  // ---- interaction ----

  function onClick(e) {
    if (!_state || _state.phase !== 'play' || _state.currentPlayer !== _playerIndex) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    for (var i = _tiles.length - 1; i >= 0; i--) {
      var t = _tiles[i];
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        window.makeGameMove({ type: 'discard', tileId: t.tile.id });
        return;
      }
    }
  }

  function onMove(e) {
    if (!_state || _state.phase !== 'play' || _state.currentPlayer !== _playerIndex) {
      if (_hoverId) { _hoverId = null; draw(); }
      return;
    }
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    var found = null;
    for (var i = _tiles.length - 1; i >= 0; i--) {
      var t = _tiles[i];
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) { found = t.tile.id; break; }
    }
    if (found !== _hoverId) { _hoverId = found; draw(); }
  }

  function playerName(idx) {
    if (window.gamePlayers && window.gamePlayers[idx]) return window.gamePlayers[idx].name;
    return '玩家' + (idx + 1);
  }
})();
