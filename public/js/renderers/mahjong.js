// public/js/renderers/mahjong.js
// Mahjong (四川 / 广东 unified) — Canvas renderer.
// 环形桌布局：自己的手牌在底部（大、可点），对手手牌(牌背)环绕上/左/右，
// 各家牌河集中在中央。番子(广东音牌)用大字绘制。
(function() {
  window.gameRenderers = window.gameRenderers || new Map();

  // 字牌（广东）显示名：feng=风牌 东南西北, jian=箭牌 中发白
  var HONOUR = { 'feng': ['', '东', '南', '西', '北'], 'jian': ['', '中', '发', '白'] };
  var SUIT_GLYPH = { wan: '万', tong: '筒', tiao: '条' };
  var SUIT_COLOR = {
    wan: '#c0392b', tong: '#2c3e50', tiao: '#1e8449',
    feng: '#2c3e50', jian: '#8e44ad',
  };

  var canvas, ctx, W, H, TW, TH;
  var _playerIndex = 0;
  var _hoverIdx = -1;       // hovered own-hand tile index
  var _layout = [];         // hit-test rects for own hand
  var _state = null;

  // 是否广东（带番子）：四川 playerView 总带 cfg，广东不带
  function isCantonese() { return _state && _state.cfg === undefined; }

  var STYLES = '' +
    '.mj-wrap{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;height:100%;flex:1;min-height:0;}' +
    '.mj-status{text-align:center;font-size:13px;font-weight:700;min-height:20px;color:var(--text-muted);letter-spacing:.3px;padding:0 8px;}' +
    '.mj-bar{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center;min-height:40px;}' +
    '.mj-btn{border:0;border-radius:12px;padding:9px 16px;font-size:14px;font-weight:800;cursor:pointer;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.18);transition:transform .1s;}' +
    '.mj-btn:active{transform:scale(.94);}' +
    '.mj-btn.pung{background:linear-gradient(135deg,#2f6fb0,#244f7d);}' +
    '.mj-btn.kong{background:linear-gradient(135deg,#7d5ba6,#553a78);}' +
    '.mj-btn.win{background:linear-gradient(135deg,#c04040,#8c2a2a);}' +
    '.mj-btn.chow{background:linear-gradient(135deg,#2e8b57,#1f6b3f);}' +
    '.mj-btn.pass{background:linear-gradient(135deg,#6a6a6a,#444);}' +
    '.mj-btn.void-suit{border:1px solid var(--border);background:var(--surface);color:var(--text);font-weight:700;padding:7px 13px;}' +
    '.mj-btn.void-suit .g{font-size:18px;margin-right:4px;}' +
    '.mj-seats{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;}' +
    '.mj-seat{padding:4px 12px;border-radius:14px;font-size:12px;font-weight:700;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;gap:5px;}' +
    '.mj-seat.active{border-color:var(--accent);box-shadow:0 0 0 2px rgba(200,164,92,.25);}' +
    '.mj-seat.winner{background:linear-gradient(135deg,#c04040,#8c2a2a);color:#fff;border-color:#c04040;}' +
    '.mj-seat .vc{width:9px;height:9px;border-radius:50%;display:inline-block;}';

  window.gameRenderers.set('mahjong-sichuan', {
    init: function(container) {
      // 让容器撑满父级（桌面大屏时棋盘铺满可用宽度，而非缩成一个小格）
      container.style.width = '100%';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.flex = '1';
      container.innerHTML = '' +
        '<div class="mj-wrap">' +
          '<div class="mj-status" id="mjStatus"></div>' +
          '<div class="mj-board" id="mjBoard" style="position:relative;flex:1;min-height:0;width:100%;">' +
            '<canvas id="mjCanvas"></canvas>' +
          '</div>' +
          '<div class="mj-bar" id="mjActions"></div>' +
        '</div>';
      canvas = document.getElementById('mjCanvas');
      ctx = canvas.getContext('2d');
      sizeCanvas();
      window.addEventListener('resize', sizeCanvas);
      canvas.addEventListener('click', onClick);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseleave', function() { _hoverIdx = -1; draw(); });
    },

    render: function(state, container, playerIndex) {
      _state = state;
      _playerIndex = playerIndex;
      if (!ctx) return;
      draw();
      drawSeats();
      drawControls();
    },
  });

  function sizeCanvas() {
    var board = document.getElementById('mjBoard');
    // 宽度取容器实际可用宽度（撑满父级），并有合理上限
    var bw = board ? board.clientWidth : window.innerWidth;
    bw = Math.min(bw, 720);   // 桌面大屏也控制在 720 内，牌不至于过大
    var bh = board ? board.clientHeight : 460;
    // 高度：桌面(>600)用更高更饱满；窄屏手机用可用高度
    if (bw > 600) {
      H = Math.max(bh, Math.round(bw * 0.72));   // 桌面：棋盘高约宽0.72，饱满不扁
    } else {
      H = Math.max(bh, 340);
    }
    W = Math.max(bw, 300);
    H = Math.min(H, 760);                        // 高度上限
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    // 牌尺寸自适应：自己牌 ~ W/9，对手牌略小
    TW = Math.max(34, Math.min(56, W / 9));
    TH = Math.round(TW * 1.4);
  }

  // ---- 牌面绘制 ----

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTileFace(x, y, w, h, tile, highlight) {
    ctx.save();
    ctx.fillStyle = highlight ? '#fff8dc' : '#fdfcf2';
    roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = highlight ? '#c8a45c' : 'rgba(0,0,0,.22)';
    ctx.lineWidth = highlight ? 2.5 : 1.2;
    ctx.stroke();

    if (!tile || tile.k === undefined) { ctx.restore(); return; }

    var isHonour = (tile.k === 'feng' || tile.k === 'jian');
    var col = SUIT_COLOR[tile.k] || '#333';
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isHonour) {
      var name = HONOUR[tile.k] && HONOUR[tile.k][tile.n] || '';
      ctx.font = 'bold ' + Math.floor(h * 0.44) + 'px "Ma Shan Zheng","KaiTi","Microsoft YaHei",serif';
      ctx.fillText(name, x + w / 2, y + h / 2 + 1);
      // 番子左上角红点装饰(中/白)
      ctx.fillStyle = 'rgba(200,60,60,.55)';
      ctx.beginPath();
      ctx.arc(x + w - 6, y + 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.font = 'bold ' + Math.floor(h * 0.42) + 'px "Ma Shan Zheng","KaiTi","Microsoft YaHei",serif';
      ctx.fillText(String(tile.n), x + w / 2, y + h * 0.35);
      ctx.font = Math.floor(h * 0.26) + 'px "Ma Shan Zheng","KaiTi","Microsoft YaHei",serif';
      ctx.fillText(SUIT_GLYPH[tile.k] || '', x + w / 2, y + h * 0.72);
    }
    ctx.restore();
  }

  function drawTileBack(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#2f6f8f';
    roundRect(x, y, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = '#245670';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 背纹：内框+菱形
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.lineWidth = 1;
    roundRect(x + w * .14, y + h * .14, w * .72, h * .72, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h * .28);
    ctx.lineTo(x + w * .72, y + h / 2);
    ctx.lineTo(x + w / 2, y + h * .72);
    ctx.lineTo(x + w * .28, y + h / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // ---- 座位映射：0自己(下), 其余相对自己逆时针上/右/左 ----

  function seatPos(idx) {
    var n = _state.hands.length;
    var rel = (idx - _playerIndex + n) % n;
    if (rel === 0) return 'bottom';       // 自己
    if (rel === 1) return 'top';          // 下家(通常对家)…标准逆时针：1=右? 用相对位置即可
    if (rel === 2) return 'right';
    return 'left';
  }

  function handCount(idx) {
    var h = _state.hands[idx];
    // 四川：数组; 广东：数字(count)或数组
    return Array.isArray(h) ? h.length : (h || 0);
  }

  // ---- 布局绘制 ----

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!_state || !_state.hands) return;

    // 桌面底色
    ctx.fillStyle = '#1e3a2a';
    ctx.fillRect(0, 0, W, H);
    // 中央椭圆桌面
    var cx = W / 2, cy = H / 2;
    _cx = cx;
    var rx = Math.min(W, H) * 0.44, ry = Math.min(W, H) * 0.36;
    ctx.save();
    ctx.fillStyle = '#274a34';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,164,92,.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    drawOpponents();
    drawOwnHand();
    drawDiscards();
    drawMelds();
  }

  function drawOpponents() {
    var seats = _state.hands.length;
    for (var s = 0; s < seats; s++) {
      if (s === _playerIndex) continue;
      var count = handCount(s);
      if (count === 0) continue;
      var pos = seatPos(s);
      var h = seatLabel(s);
      var tw = Math.round(TW * 0.8), th = Math.round(TH * 0.8);
      var gap = 3, x, y;

      if (pos === 'top') {
        // 顶部居中横排（座位条下方）
        var totalW = count * (tw + gap);
        x = (W - totalW) / 2;
        y = 32;
        for (var i = 0; i < count; i++) drawTileBack(x + i * (tw + gap), y, tw, th);
        label(h + ' · ' + count, W / 2, y + th + 12);
      } else if (pos === 'right') {
        // 右侧竖排，靠中央（不贴边）
        var rh = count * (th + gap);
        y = (H - rh) / 2;
        x = cx() + Math.min(W, H) * 0.24;
        for (var j = 0; j < count; j++) drawTileBack(x, y + j * (th + gap), tw, th);
        label(h + ' · ' + count, x + tw / 2, y - 10);
      } else {
        // 左侧竖排，靠中央
        var lh = count * (th + gap);
        y = (H - lh) / 2;
        x = cx() - Math.min(W, H) * 0.24 - tw;
        for (var k = 0; k < count; k++) drawTileBack(x, y + k * (th + gap), tw, th);
        label(h + ' · ' + count, x + tw / 2, y - 10);
      }
    }
  }

  var _cx = 0;
  function cx() { return _cx; }

  function label(text, x, y) {
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = 'bold 12px system-ui,"Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function seatLabel(idx) {
    if (window.gamePlayers && window.gamePlayers[idx]) return window.gamePlayers[idx].name;
    var names = ['你', '下家', '对家', '上家'];
    return names[idx] || ('玩家' + (idx + 1));
  }

  function drawOwnHand() {
    var hand = _state.hands[_playerIndex];
    if (!Array.isArray(hand) || hand.length === 0) return;
    var n = hand.length;
    var tw = TW, th = TH;
    // 牌过大时横向压缩
    var maxW = W - 20;
    if (n * (tw + 4) > maxW) tw = Math.floor((maxW - n * 4) / n);
    var totalW = n * (tw + 4);
    var startX = (W - totalW) / 2;
    var y = H - th - 14;
    _layout = [];
    for (var i = 0; i < n; i++) {
      var x = startX + i * (tw + 4);
      var lift = _hoverIdx === i ? -12 : 0;
      var hover = _hoverIdx === i;
      drawTileFace(x, y + lift, tw, th, hand[i], hover);
      _layout.push({ x: x, y: y + lift, w: tw, h: th, idx: i });
    }
    // 名牌
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.font = 'bold 13px system-ui,"Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('你', startX - 18, y + th / 2);
  }

  // 各家弃牌(牌河)集中中央，按座位分区
  function drawDiscards() {
    var seats = _state.discards ? _state.discards.length : 0;
    var cx = W / 2, cy = H / 2;
    var dw = Math.round(TW * 0.66), dh = Math.round(TH * 0.66);
    var gap = 2, perRow = 8;
    for (var s = 0; s < seats; s++) {
      var pile = _state.discards[s];
      if (!pile || pile.length === 0) continue;
      var pos = seatPos(s);
      for (var i = 0; i < pile.length; i++) {
        var row = Math.floor(i / perRow), col = i % perRow;
        var x, y;
        if (pos === 'bottom') { x = cx - (perRow*(dw+gap))/2 + col*(dw+gap); y = cy + 44 + row*(dh+gap); }
        else if (pos === 'top') { x = cx - (perRow*(dw+gap))/2 + col*(dw+gap); y = cy - 44 - dh - row*(dh+gap); }
        else if (pos === 'right') { x = cx + 54 + row*(dw+gap); y = cy - (perRow*(dh+gap))/2 + col*(dh+gap); }
        else { x = cx - 54 - dw - row*(dw+gap); y = cy - (perRow*(dh+gap))/2 + col*(dh+gap); }
        var isLast = _state.lastDiscard && pile[i].id === _state.lastDiscard.id;
        drawTileFace(x, y, dw, dh, pile[i], isLast);
      }
    }
  }

  function drawMelds() {
    if (!_state.melds) return;
    var seats = _state.melds.length;
    var tw = Math.round(TW * 0.6), th = Math.round(TH * 0.6);
    for (var s = 0; s < seats; s++) {
      if (s === _playerIndex) continue;
      var melds = _state.melds[s];
      if (!melds || melds.length === 0) continue;
      var pos = seatPos(s);
      var idx = 0;
      for (var m = 0; m < melds.length; m++) {
        var md = melds[m];
        var cnt = md.tiles ? md.tiles.length : (md.type === 'kong' ? 4 : 3);
        for (var k = 0; k < cnt; k++) {
          var x, y;
          if (pos === 'top') { x = 16 + idx * (tw + 2); y = 20 + m * (th + 3); }
          else if (pos === 'right') { x = W - tw - 16 - idx * (tw + 2); y = 40 + m * (th + 3); }
          else { x = 16 + idx * (tw + 2); y = 40 + m * (th + 3); }
          var tile = (md.tiles && md.tiles[k]) || md.tile;
          drawTileFace(x, y, tw, th, tile, false);
          idx++;
        }
      }
    }
  }

  // ---- 控件 ----

  function tileLabel(tile) {
    if (!tile || tile.k === undefined) return '';
    if (tile.k === 'feng' || tile.k === 'jian') return HONOUR[tile.k][tile.n] || tile.k;
    return tile.n + SUIT_GLYPH[tile.k];
  }

  function drawControls() {
    var bar = document.getElementById('mjActions');
    var status = document.getElementById('mjStatus');
    if (!bar) return;
    bar.innerHTML = '';
    if (!_state) return;
    var me = _playerIndex;

    if (_state.phase === 'void') {
      status.textContent = '定缺：选择一门花色，打完该门才能胡牌';
      var suits = [{ k: 'wan' }, { k: 'tong' }, { k: 'tiao' }];
      for (var i = 0; i < suits.length; i++) {
        (function(suit) {
          var b = document.createElement('button');
          b.className = 'mj-btn void-suit';
          b.innerHTML = '<span class="g">' + SUIT_GLYPH[suit.k] + '</span>' + suitCount(_state.hands[me], suit.k);
          b.onclick = function() { window._mjVoid(suit.k); };
          bar.appendChild(b);
        })(suits[i]);
      }
      return;
    }

    if (_state.phase === 'claim' && _state.lastDiscard) {
      status.textContent = '有人打出 ' + tileLabel(_state.lastDiscard) + ' — 是否操作？';
      if (me !== undefined && !(_state.winners || []).includes(me)) {
        if (canChow()) bar.appendChild(btn('吃', 'chow', 'window._mjChow()'));
        bar.appendChild(btn('碰', 'pung', 'window._mjPung()'));
        bar.appendChild(btn('杠', 'kong', 'window._mjKong()'));
        bar.appendChild(btn('胡', 'win', 'window._mjWin()'));
      }
      bar.appendChild(btn('过', 'pass', 'window._mjPass()'));
      return;
    }

    if (_state.phase === 'play' || _state.phase === 'win') {
      status.textContent = _state.currentPlayer === me ? '轮到你了 — 点击手牌出牌' : '等待其他玩家…';
      return;
    }
    if (_state.phase === 'over') { status.textContent = '本局结束'; return; }
    status.textContent = '';
  }

  function canChow() {
    // 只有广东可吃；四川不吃。用 state.cfg 判断：四川 cfg.allowChow=false
    if (_state.cfg && _state.cfg.allowChow === false) return false;
    return true;
  }

  // 座位信息画进 canvas 顶部横条（不再用 DOM 行，避免和手牌/底部按钮重叠）
  function drawSeats() {
    if (!_state || !_state.hands) return;
    var n = _state.hands.length;
    var barW = Math.min(W - 16, 520);
    var x0 = (W - barW) / 2;
    var y0 = 4;
    var itemW = barW / n;
    for (var i = 0; i < n; i++) {
      var isActive = _state.currentPlayer === i;
      var isWinner = (_state.winners || []).includes(i);
      var vs = _state.voidSuit ? _state.voidSuit[i] : undefined;
      var count = handCount(i);
      var cxI = x0 + itemW * i + itemW / 2;
      // 名牌背景
      ctx.save();
      ctx.fillStyle = isWinner ? 'rgba(192,64,64,.9)' : (isActive ? 'rgba(200,164,92,.85)' : 'rgba(0,0,0,.5)');
      roundRect(x0 + itemW * i + 2, y0, itemW - 4, 22, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui,"Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var labelTxt = seatLabel(i) + ' ' + count;
      if (vs) labelTxt += ' 缺' + (SUIT_GLYPH[vs] || vs);
      if (isWinner) labelTxt += ' 胡';
      ctx.fillText(labelTxt, cxI, y0 + 11);
      ctx.restore();
    }
  }

  function suitCount(hand, suit) {
    if (!Array.isArray(hand)) return '0张';
    var c = 0;
    for (var i = 0; i < hand.length; i++) if (hand[i].k === suit) c++;
    return c + '张';
  }

  function btn(label, cls, fn) {
    var b = document.createElement('button');
    b.className = 'mj-btn ' + cls;
    b.textContent = label;
    b.setAttribute('onclick', fn);
    return b;
  }

  // ---- 交互 ----

  function hitTile(px, py) {
    for (var i = 0; i < _layout.length; i++) {
      var r = _layout[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.idx;
    }
    return -1;
  }

  function onClick(e) {
    if (!_layout.length) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    var idx = hitTile(x, y);
    if (idx < 0) return;
    window._mjDiscard(idx);
  }

  function onMouseMove(e) {
    if (!_layout.length) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    var idx = hitTile(x, y);
    if (idx !== _hoverIdx) { _hoverIdx = idx; draw(); }
  }

  // 回调：接线到 makeGameMove（与 room-client 的 webSocket 通信）
  window._mjVoid = function(suit) { if (window.makeGameMove) window.makeGameMove({ type: 'void', suit: suit }); };
  window._mjDiscard = function(idx) {
    var hand = _state && Array.isArray(_state.hands[_playerIndex]) ? _state.hands[_playerIndex] : [];
    if (idx >= 0 && idx < hand.length && window.makeGameMove) {
      window.makeGameMove({ type: 'discard', tileId: hand[idx].id });
    }
  };
  window._mjPung = function() { if (window.makeGameMove) window.makeGameMove({ type: 'pung' }); };
  window._mjKong = function() { if (window.makeGameMove) window.makeGameMove({ type: 'kong' }); };
  window._mjWin = function() { if (window.makeGameMove) window.makeGameMove({ type: 'win' }); };
  window._mjPass = function() { if (window.makeGameMove) window.makeGameMove({ type: 'pass' }); };
  window._mjChow = function() {
    // 吃：广东才有。取最近的能吃组合（简化：让服务器校验，这里只发 type）
    if (window.makeGameMove) window.makeGameMove({ type: 'chow', tiles: [] });
  };
})();
