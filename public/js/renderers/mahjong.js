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

  var canvas, ctx, W, H, TW, TH, DPR;
  var _playerIndex = 0;
  var _hoverIdx = -1;       // hovered own-hand tile index
  var _layout = [];         // hit-test rects for own hand
  var _state = null;
  var _lastDiscardPulse = 0; // 弃牌落点脉冲相位(0..1)
  var _lastDiscardId = null; // 上次弃牌 id（检测变化触发脉冲）
  var _animTimer = null;     // 动画循环句柄
  var _claimEffects = [];    // 碰杠吃胡动画效果 [{ pos, type, text, birth }]
  var _prevMeldCounts = []; // 每家上一帧的明牌数（检测新增）
  var _turnPulse = 0;        // 当前玩家指示脉冲

  // 是否广东（带番子）：四川 playerView 总带 cfg，广东不带
  function isCantonese() { return _state && _state.cfg === undefined; }

  var STYLES = '' +
    '.mj-wrap{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;height:100%;flex:1;min-height:0;}' +
    '.mj-status{text-align:center;font-size:13px;font-weight:700;min-height:18px;color:var(--text-muted);letter-spacing:.3px;padding:0 8px;}' +
    '.mj-bar{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;align-items:center;min-height:50px;padding:4px 0;}' +
    '.mj-btn{border:0;border-radius:16px;padding:12px 22px;font-size:15px;font-weight:800;cursor:pointer;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.15);transition:transform .12s,box-shadow .12s;letter-spacing:1px;position:relative;}' +
    '.mj-btn:active{transform:scale(.93);box-shadow:0 2px 6px rgba(0,0,0,.3);}' +
    '.mj-btn.pung{background:linear-gradient(135deg,#3a8fd4,#1e5fa0);}' +
    '.mj-btn.kong{background:linear-gradient(135deg,#9b6dde,#6a3fb5);}' +
    '.mj-btn.win{background:linear-gradient(135deg,#e05050,#b02020);box-shadow:0 4px 18px rgba(224,60,60,.4),inset 0 1px 0 rgba(255,255,255,.2);}' +
    '.mj-btn.chow{background:linear-gradient(135deg,#3eb870,#1f8c4f);}' +
    '.mj-btn.pass{background:linear-gradient(135deg,#777,#444);}' +
    '.mj-btn.void-suit{border:1px solid var(--border);background:var(--surface);color:var(--text);font-weight:700;padding:10px 18px;box-shadow:0 2px 8px rgba(0,0,0,.08);}' +
    '.mj-btn.void-suit .g{font-size:18px;margin-right:4px;}' +
    '@media(max-width:500px){' +
      '.mj-btn{padding:11px 18px;font-size:15px;}' +
      '.mj-status{font-size:12px;}' +
    '}';

  window.gameRenderers.set('mahjong-sichuan', {
    init: function(container) {
      try {
        // 注入样式（仅一次）
        if (typeof injectStylesOnce === 'function') injectStylesOnce('mjStyles', STYLES);
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
      } catch (e) {
        console.error('[mahjong] init error:', e);
        // 兜底：至少显示一个提示
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#fff;">渲染器初始化失败: ' + e.message + '</div>';
      }
    },

    render: function(state, container, playerIndex) {
      try {
        _state = state;
        _playerIndex = playerIndex;
        if (!ctx) return;
        // 检测新弃牌 → 触发落点脉冲
        var ld = state && state.lastDiscard;
        if (ld && ld.id !== _lastDiscardId) {
          _lastDiscardId = ld.id;
          _lastDiscardPulse = 1;
          startAnimLoop();
        }
        // 检测新增明牌 → 触发碰杠吃胡动画
        if (state && state.melds) {
          for (var i = 0; i < state.melds.length; i++) {
            var cnt = state.melds[i] ? state.melds[i].length : 0;
            var prev = _prevMeldCounts[i] || 0;
            if (cnt > prev && cnt > 0) {
              var md = state.melds[i][cnt - 1];
              var type = md.type;
              var label = type === 'kong' ? '杠' : type === 'pung' ? '碰' : type === 'chow' ? '吃' : type === 'win' ? '胡' : '';
              if (label) {
                _claimEffects.push({ player: i, type: type, label: label, birth: Date.now() });
                if (_claimEffects.length > 8) _claimEffects.shift();
              }
            }
            _prevMeldCounts[i] = cnt;
          }
        }
        // 胡牌效果
        if (state && state.winners && state.winners.length > 0) {
          for (var w = 0; w < state.winners.length; w++) {
            var wPlayer = state.winners[w];
            var alreadyShown = _claimEffects.some(function(e){ return e.player === wPlayer && e.type === 'win'; });
            if (!alreadyShown) {
              _claimEffects.push({ player: wPlayer, type: 'win', label: '胡!', birth: Date.now() });
            }
          }
        }
        if (_claimEffects.length > 0 && !_animTimer) startAnimLoop();
        draw();
        drawControls();
      } catch (e) {
        console.error('[mahjong] render error:', e);
      }
    },
  });

  // ---- 动画循环：弃牌脉冲 + 碰杠效果，空闲自动停 ----
  function startAnimLoop() {
    if (_animTimer) return;
    var tick = function () {
      var active = false;
      // 弃牌脉冲
      if (_lastDiscardPulse > 0.01) {
        _lastDiscardPulse *= 0.92;
        if (_lastDiscardPulse < 0.02) _lastDiscardPulse = 0;
        active = true;
      }
      // 碰杠效果（2 秒生命周期）
      if (_claimEffects.length > 0) {
        var now = Date.now();
        _claimEffects = _claimEffects.filter(function(e){ return (now - e.birth) < 2000; });
        if (_claimEffects.length > 0) active = true;
      }
      if (!active) {
        _animTimer = null;
        draw(); // 最后一帧
        return;
      }
      draw();
      _animTimer = requestAnimationFrame(tick);
    };
    _animTimer = requestAnimationFrame(tick);
  }

  function sizeCanvas() {
    var board = document.getElementById('mjBoard');
    var bw = board ? board.clientWidth : 0;
    // 防御：flex 容器子项在首次布局前 clientWidth 可能为 0，用窗口宽兜底
    if (!bw || bw < 50) bw = window.innerWidth || 375;
    bw = Math.min(bw, 1100);
    var bh = board ? board.clientHeight : 0;
    if (!bh || bh < 50) bh = Math.round(window.innerHeight * 0.5) || 400;
    var isMobile = bw < 500;
    // 高度：桌面饱满；手机用更高比例（出牌区需要纵向空间）
    if (isMobile) {
      H = Math.max(bh, Math.round(bw * 0.85));
    } else if (bw > 600) {
      H = Math.max(bh, Math.round(bw * 0.62));
    } else {
      H = Math.max(bh, 360);
    }
    W = Math.max(bw, 320);
    H = Math.min(H, 900);
    // DPR 适配：高分屏用更多物理像素渲染，画面更清晰
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.style.display = 'block';
    canvas.style.margin = 'auto';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // 牌尺寸：手机用 W/8 更大易点；桌面 W/11；限制在合理范围
    if (isMobile) {
      TW = Math.max(36, Math.min(58, W / 8));
    } else {
      TW = Math.max(38, Math.min(64, W / 11));
    }
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
    // 投影：牌从台面浮起（自己手牌才画投影，牌河/明牌省略以保性能）
    if (w >= TW * 0.9) {
      ctx.shadowColor = 'rgba(0,0,0,.3)';
      ctx.shadowBlur = Math.max(3, w * 0.1);
      ctx.shadowOffsetY = Math.max(2, h * 0.05);
    }
    // 象牙白渐变（顶亮底暗，模拟顶光）
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    if (highlight) {
      grad.addColorStop(0, '#fffef6');
      grad.addColorStop(1, '#f4eac4');
    } else {
      grad.addColorStop(0, '#fdfbf0');
      grad.addColorStop(0.45, '#f9f4e3');
      grad.addColorStop(1, '#efe6c8');
    }
    ctx.fillStyle = grad;
    roundRect(x, y, w, h, 5);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // 描边
    ctx.strokeStyle = highlight ? '#c8a45c' : 'rgba(0,0,0,.16)';
    ctx.lineWidth = highlight ? 2.5 : 1;
    roundRect(x, y, w, h, 5);
    ctx.stroke();
    // 顶边高光（倒角反光）
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 1.5);
    ctx.lineTo(x + w - 5, y + 1.5);
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
      // 番子右上角小红点（中/发）
      if (tile.k === 'jian' && (tile.n === 1 || tile.n === 2)) {
        ctx.fillStyle = 'rgba(192,48,48,.7)';
        ctx.beginPath();
        ctx.arc(x + w - 5, y + 5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
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
    // 牌背：深竹青渐变
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#3a7d6e');
    grad.addColorStop(1, '#2a5c50');
    ctx.fillStyle = grad;
    roundRect(x, y, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    roundRect(x, y, w, h, 5);
    ctx.stroke();
    // 背纹：内框+双菱形（经典麻将牌背纹样）
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 1;
    roundRect(x + w * .16, y + h * .16, w * .68, h * .68, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h * .3);
    ctx.lineTo(x + w * .7, y + h / 2);
    ctx.lineTo(x + w / 2, y + h * .7);
    ctx.lineTo(x + w * .3, y + h / 2);
    ctx.closePath();
    ctx.stroke();
    // 内菱形
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h * .4);
    ctx.lineTo(x + w * .6, y + h / 2);
    ctx.lineTo(x + w / 2, y + h * .6);
    ctx.lineTo(x + w * .4, y + h / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // ---- 座位映射：以自己为基准的相对位置 ----
  // rel=0 自己(下), rel=1 对家(上), rel=2 右家(右), rel=3 左家(左)
  // (4 人桌) 逆时针：下→右→上→左；这里 1 画上方、2 画右方、3 画左方

  function seatPos(idx) {
    var n = _state.hands.length;
    var rel = (idx - _playerIndex + n) % n;
    if (rel === 0) return 'bottom';
    if (rel === 1) return 'top';
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

    // 背景：深墨绿
    ctx.fillStyle = '#14281d';
    ctx.fillRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2;
    // 中央椭圆桌面（径向渐变，中心亮四周暗 = 聚光灯）
    var rx = Math.min(W, H) * 0.46, ry = Math.min(W, H) * 0.38;
    var felt = ctx.createRadialGradient(cx, cy * 0.92, ry * 0.1, cx, cy, Math.max(rx, ry));
    felt.addColorStop(0, '#2f5a40');
    felt.addColorStop(0.7, '#234731');
    felt.addColorStop(1, '#163020');
    ctx.save();
    ctx.fillStyle = felt;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // 金色双圈镶边
    ctx.strokeStyle = 'rgba(200,164,92,.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,164,92,.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 5, ry + 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawOpponents();
    drawOwnHand();
    drawDiscards();
    drawMelds();
    drawClaimEffects();
    drawTurnIndicator();
    drawPlayerNames();
  }

  function drawOpponents() {
    var seats = _state.hands.length;
    // 对手牌背：对家横排在顶部；左右家打横、垂直向下延伸（2列多行网格）
    var tw = Math.round(TW * 0.5), th = Math.round(TH * 0.5);
    var gap = 2;
    var sideCols = 2; // 左右家每行摆 2 张（打横），然后向下延伸
    for (var s = 0; s < seats; s++) {
      if (s === _playerIndex) continue;
      var count = handCount(s);
      if (count === 0) continue;
      var pos = seatPos(s);

      if (pos === 'top') {
        // 对家：顶部横排居中（单行）
        var totalW = count * (tw + gap);
        var x0 = (W - totalW) / 2;
        var y0 = 30;
        for (var i = 0; i < count; i++) drawTileBack(x0 + i * (tw + gap), y0, tw, th);
      } else if (pos === 'right') {
        // 右家：打横、垂直向下（2列多行，靠右对齐）
        var rows = Math.ceil(count / sideCols);
        var rowH = th + gap;
        var gridH = rows * rowH;
        var startY = (H - gridH) / 2;
        var gridW = sideCols * (tw + gap);
        var startX = W - gridW - 20;
        for (var j = 0; j < count; j++) {
          var row = Math.floor(j / sideCols);
          var col = j % sideCols;
          drawTileBack(startX + col * (tw + gap), startY + row * rowH, tw, th);
        }
      } else {
        // 左家：打横、垂直向下（2列多行，靠左对齐）
        var rowsL = Math.ceil(count / sideCols);
        var rowHL = th + gap;
        var gridHL = rowsL * rowHL;
        var startYL = (H - gridHL) / 2;
        var startXL = 20;
        for (var k = 0; k < count; k++) {
          var rowL = Math.floor(k / sideCols);
          var colL = k % sideCols;
          drawTileBack(startXL + colL * (tw + gap), startYL + rowL * rowHL, tw, th);
        }
      }
    }
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
  }

  // 公共出牌区：中央一个长方形区域，所有玩家按顺序从左到右、从上到下出牌
  // 玩家 0 的牌先排，紧接玩家 1，以此类推（每玩家不同颜色标记通过间距区分）
  // 按出牌时间顺序构建弃牌序列（第0轮各家第0张→第1轮各家第1张…）
  function buildDiscardSequence() {
    var seq = [];
    if (!_state.discards) return seq;
    var maxLen = 0;
    for (var s = 0; s < _state.discards.length; s++) {
      maxLen = Math.max(maxLen, _state.discards[s].length);
    }
    for (var r = 0; r < maxLen; r++) {
      for (var s2 = 0; s2 < _state.discards.length; s2++) {
        if (_state.discards[s2][r]) {
          seq.push({ tile: _state.discards[s2][r], player: s2 });
        }
      }
    }
    return seq;
  }

  function drawDiscards() {
    var allTiles = buildDiscardSequence();
    if (allTiles.length === 0) return;
    var dw = Math.round(TW * 0.55), dh = Math.round(TH * 0.55);
    var gap = 3;
    // 出牌区尺寸：手机占更大比例以利用空间
    var isMobile = W < 500;
    var zoneW = W * (isMobile ? 0.88 : 0.56);
    var zoneH = H * (isMobile ? 0.40 : 0.34);
    var zoneX = (W - zoneW) / 2;
    var zoneY = (H - zoneH) / 2;
    var perRow = Math.max(6, Math.floor(zoneW / (dw + gap)));
    // 在长方形区域内网格排列
    for (var idx = 0; idx < allTiles.length; idx++) {
      var row = Math.floor(idx / perRow);
      var col = idx % perRow;
      var x = zoneX + col * (dw + gap);
      var y = zoneY + row * (dh + gap);
      var dt = allTiles[idx];
      var isLast = _state.lastDiscard && dt.tile.id === _state.lastDiscard.id;
      // 落点脉冲光晕
      if (isLast && _lastDiscardPulse > 0.01) {
        ctx.save();
        ctx.strokeStyle = 'rgba(200,164,92,' + (0.6 * _lastDiscardPulse) + ')';
        ctx.lineWidth = 2 + 3 * _lastDiscardPulse;
        var pad = 3 + 6 * _lastDiscardPulse;
        roundRect(x - pad, y - pad, dw + pad * 2, dh + pad * 2, 6);
        ctx.stroke();
        ctx.restore();
      }
      drawTileFace(x, y, dw, dh, dt.tile, isLast);
    }
  }

  // 明牌布局：按组排列（3个/4个一组，不拆散），左上/右上，放满换行
  function drawMelds() {
    if (!_state.melds) return;
    var seats = _state.melds.length;
    var tw = Math.round(TW * 0.36), th = Math.round(TH * 0.36);
    var gap = 2;
    var groupGap = 8;
    var maxPerRow = 6; // 每行最多 6 张（约 2 组）
    for (var s = 0; s < seats; s++) {
      var melds = _state.melds[s];
      if (!melds || melds.length === 0) continue;
      var pos = seatPos(s);
      // 解析每组
      var groups = [];
      for (var m = 0; m < melds.length; m++) {
        var md = melds[m];
        var cnt = md.tiles ? md.tiles.length : (md.type === 'kong' ? 4 : 3);
        groups.push({ md: md, count: cnt });
      }
      if (pos === 'bottom') {
        // 自己：手牌上方横排居中，按组排列
        var bTotal = 0;
        for (var bi = 0; bi < groups.length; bi++) bTotal += groups[bi].count;
        var bRowW = bTotal * (tw + gap) + (groups.length - 1) * groupGap;
        var bPlaced = 0;
        for (var bg = 0; bg < groups.length; bg++) {
          for (var bk = 0; bk < groups[bg].count; bk++) {
            var bx = W / 2 - bRowW / 2 + bPlaced * (tw + gap) + bg * groupGap;
            var by = H - TH - 28 - th;
            var bt = (groups[bg].md.tiles && groups[bg].md.tiles[bk]) || groups[bg].md.tile;
            drawTileFace(bx, by, tw, th, bt, false);
            bPlaced++;
          }
        }
      } else if (pos === 'top') {
        // 对家：牌背下方横排居中，按组排列
        var tTotal = 0;
        for (var ti = 0; ti < groups.length; ti++) tTotal += groups[ti].count;
        var tRowW = tTotal * (tw + gap) + (groups.length - 1) * groupGap;
        var tPlaced = 0;
        for (var tg = 0; tg < groups.length; tg++) {
          for (var tk = 0; tk < groups[tg].count; tk++) {
            var tx = W / 2 - tRowW / 2 + tPlaced * (tw + gap) + tg * groupGap;
            var ty = 30 + Math.round(TH * 0.5) + 6;
            var tt = (groups[tg].md.tiles && groups[tg].md.tiles[tk]) || groups[tg].md.tile;
            drawTileFace(tx, ty, tw, th, tt, false);
            tPlaced++;
          }
        }
      } else if (pos === 'right') {
        // 右家：右上角，按组排列，放满换行
        var rRows = [];
        var rCurRow = [];
        var rCurCount = 0;
        for (var rg = 0; rg < groups.length; rg++) {
          if (rCurCount + groups[rg].count > maxPerRow && rCurRow.length > 0) {
            rRows.push(rCurRow);
            rCurRow = [];
            rCurCount = 0;
          }
          rCurRow.push(groups[rg]);
          rCurCount += groups[rg].count;
        }
        if (rCurRow.length > 0) rRows.push(rCurRow);
        // 绘制：从右上角开始，向下排列
        var rStartX = W - 12;
        var rStartY = 28;
        for (var rri = 0; rri < rRows.length; rri++) {
          var row = rRows[rri];
          var rowTiles = 0;
          for (var rgi = 0; rgi < row.length; rgi++) rowTiles += row[rgi].count;
          var rowW = rowTiles * (tw + gap) + (row.length - 1) * groupGap;
          var rPlaced = 0;
          for (var rgi2 = 0; rgi2 < row.length; rgi2++) {
            for (var gk = 0; gk < row[rgi2].count; gk++) {
              var rx = rStartX - rowW + rPlaced * (tw + gap) + rgi2 * groupGap;
              var ry = rStartY + rri * (th + gap + 4);
              var rt = (row[rgi2].md.tiles && row[rgi2].md.tiles[gk]) || row[rgi2].md.tile;
              drawTileFace(rx, ry, tw, th, rt, false);
              rPlaced++;
            }
          }
        }
      } else {
        // 左家：左上角，按组排列，放满换行
        var lRows = [];
        var lCurRow = [];
        var lCurCount = 0;
        for (var lg = 0; lg < groups.length; lg++) {
          if (lCurCount + groups[lg].count > maxPerRow && lCurRow.length > 0) {
            lRows.push(lCurRow);
            lCurRow = [];
            lCurCount = 0;
          }
          lCurRow.push(groups[lg]);
          lCurCount += groups[lg].count;
        }
        if (lCurRow.length > 0) lRows.push(lCurRow);
        // 绘制：从左上角开始，向下排列
        var lStartX = 12;
        var lStartY = 28;
        for (var lri = 0; lri < lRows.length; lri++) {
          var lRow = lRows[lri];
          var lPlaced = 0;
          for (var lgi = 0; lgi < lRow.length; lgi++) {
            for (var lgk = 0; lgk < lRow[lgi].count; lgk++) {
              var lx = lStartX + lPlaced * (tw + gap) + lgi * groupGap;
              var ly = lStartY + lri * (th + gap + 4);
              var lt = (lRow[lgi].md.tiles && lRow[lgi].md.tiles[lgk]) || lRow[lgi].md.tile;
              drawTileFace(lx, ly, tw, th, lt, false);
              lPlaced++;
            }
          }
        }
      }
    }
  }

  // ---- 碰杠吃胡动画效果 ----
  var CLAIM_COLORS = {
    pung: { bg: 'rgba(58,143,212,.9)', text: '#fff' },
    kong: { bg: 'rgba(155,109,222,.9)', text: '#fff' },
    chow: { bg: 'rgba(62,184,112,.9)', text: '#fff' },
    win:  { bg: 'rgba(224,80,80,.95)', text: '#fff' },
  };
  function drawClaimEffects() {
    if (_claimEffects.length === 0) return;
    var now = Date.now();
    var stillAlive = [];
    for (var i = 0; i < _claimEffects.length; i++) {
      var e = _claimEffects[i];
      var age = (now - e.birth) / 1000;
      if (age > 2.0) continue; // 2 秒后消失
      stillAlive.push(e);
      var progress = age / 2.0; // 0→1
      var alpha = 1 - progress;  // 渐隐
      var riseY = progress * 40; // 上浮
      var scale = 1 + progress * 0.3; // 放大
      // 效果位置：在该玩家牌背附近
      var pos = seatPos(e.player);
      var ex, ey;
      if (pos === 'bottom') { ex = W / 2; ey = H - TH - 50 - riseY; }
      else if (pos === 'top') { ex = W / 2; ey = 30 + Math.round(TH * 0.5) + 20 + riseY; }
      else if (pos === 'right') { ex = W - 80; ey = H / 2 - riseY; }
      else { ex = 80; ey = H / 2 - riseY; }
      var col = CLAIM_COLORS[e.type] || CLAIM_COLORS.pung;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(ex, ey);
      ctx.scale(scale, scale);
      // 圆角背景
      var padX = 14, padY = 8;
      var fontSize = 22;
      ctx.font = 'bold ' + fontSize + 'px system-ui,"Microsoft YaHei",sans-serif';
      var metrics = ctx.measureText(e.label);
      var bw = metrics.width + padX * 2;
      var bh = fontSize + padY * 2;
      ctx.fillStyle = col.bg;
      roundRect(-bw / 2, -bh / 2, bw, bh, 12);
      ctx.fill();
      // 发光外圈
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * alpha) + ')';
      ctx.lineWidth = 2;
      roundRect(-bw / 2, -bh / 2, bw, bh, 12);
      ctx.stroke();
      // 文字
      ctx.fillStyle = col.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.label, 0, 1);
      ctx.restore();
    }
    _claimEffects = stillAlive;
  }

  // ---- 当前玩家指示：明显发光边框 + 外面空白处显示名字 ----
  function drawTurnIndicator() {
    if (!_state || _state.phase === 'over') return;
    var cp = _state.currentPlayer;
    if (cp === undefined || cp === null) return;
    var pos = seatPos(cp);
    var t = (Date.now() % 1000) / 1000;
    var glow = 0.5 + 0.5 * Math.sin(t * Math.PI * 2); // 0..1 呼吸
    // 在该玩家区域画发光边框
    var pad = 6;
    var bx, by, bw, bh;
    if (pos === 'bottom') {
      bx = W / 2 - 14 * (TW + 4) / 2; by = H - TH - 22; bw = 14 * (TW + 4); bh = TH + 8;
    } else if (pos === 'top') {
      bx = W / 2 - 14 * (Math.round(TW * 0.5) + 2) / 2; by = 26; bw = 14 * (Math.round(TW * 0.5) + 2); bh = Math.round(TH * 0.5) + 8;
    } else if (pos === 'right') {
      var rCount = handCount(cp);
      var rRows = Math.ceil(rCount / 2);
      var rTileH = rRows * (Math.round(TH * 0.5) + 2);
      bx = W - 20 - 2 * (Math.round(TW * 0.5) + 2) - pad;
      by = (H - rTileH) / 2 - pad;
      bw = 2 * (Math.round(TW * 0.5) + 2) + pad * 2;
      bh = rTileH + pad * 2;
    } else {
      var lCount = handCount(cp);
      var lRows = Math.ceil(lCount / 2);
      var lTileH = lRows * (Math.round(TH * 0.5) + 2);
      bx = 20 - pad;
      by = (H - lTileH) / 2 - pad;
      bw = 2 * (Math.round(TW * 0.5) + 2) + pad * 2;
      bh = lTileH + pad * 2;
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(255,200,' + Math.round(60 + 100 * glow) + ',' + (0.6 + 0.4 * glow) + ')';
    ctx.lineWidth = 3 + 2 * glow;
    ctx.shadowColor = 'rgba(255,200,60,' + (0.5 * glow) + ')';
    ctx.shadowBlur = 12 + 8 * glow;
    roundRect(bx, by, bw, bh, 8);
    ctx.stroke();
    ctx.restore();
  }

  // ---- 三家对手：名字放在牌背前面 ----
  function drawPlayerNames() {
    if (!_state || !_state.hands) return;
    var n = _state.hands.length;
    var fontSize = 12;
    ctx.font = 'bold ' + fontSize + 'px system-ui,"Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < n; i++) {
      if (i === _playerIndex) continue;
      var pos = seatPos(i);
      var isActive = _state.currentPlayer === i;
      var isWinner = (_state.winners || []).includes(i);
      var name = '玩家' + (i + 1);
      if (window.gamePlayers && window.gamePlayers[i]) name = window.gamePlayers[i].name;
      var count = handCount(i);
      var label = name + ' (' + count + '张)';
      if (isWinner) label = '🏆 ' + name;
      var textW = ctx.measureText(label).width;
      var padX = 8, padY = 4;
      var bw = textW + padX * 2;
      var bh = fontSize + padY * 2;
      var nx, ny;
      if (pos === 'top') {
        // 对家：名字在顶部中央、牌背上方
        nx = W / 2;
        ny = 10;
      } else if (pos === 'right') {
        // 右家：名字在牌背左侧（靠中央）
        var rTileRows = Math.ceil(count / 2);
        var rTileH = rTileRows * (Math.round(TH * 0.5) + 2);
        var rTileTop = (H - rTileH) / 2;
        nx = W - 20 - 2 * (Math.round(TW * 0.5) + 2) - bw / 2 - 6;
        ny = rTileTop - bh / 2 - 4;
      } else {
        // 左家：名字在牌背右侧（靠中央）
        var lTileRows = Math.ceil(count / 2);
        var lTileH = lTileRows * (Math.round(TH * 0.5) + 2);
        var lTileTop = (H - lTileH) / 2;
        nx = 20 + 2 * (Math.round(TW * 0.5) + 2) + bw / 2 + 6;
        ny = lTileTop - bh / 2 - 4;
      }
      ctx.save();
      if (isWinner) ctx.fillStyle = 'rgba(224,80,80,.9)';
      else if (isActive) ctx.fillStyle = 'rgba(200,164,92,.85)';
      else ctx.fillStyle = 'rgba(0,0,0,.5)';
      roundRect(nx - bw / 2, ny - bh / 2, bw, bh, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, nx, ny);
      ctx.restore();
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
      // 自动判断可执行的操作，只显示能执行的按钮
      var claims = [];
      if (me !== undefined && !(_state.winners || []).includes(me)) {
        claims = getAvailableClaims();
      }
      if (claims.length > 0) {
        // 有可执行操作：显示对应按钮 + 过
        for (var c = 0; c < claims.length; c++) {
          var claim = claims[c];
          if (claim === 'win') bar.appendChild(btn('胡', 'win', 'window._mjWin()'));
          else if (claim === 'kong') bar.appendChild(btn('杠', 'kong', 'window._mjKong()'));
          else if (claim === 'pung') bar.appendChild(btn('碰', 'pung', 'window._mjPung()'));
          else if (claim === 'chow') bar.appendChild(btn('吃', 'chow', 'window._mjChow()'));
        }
        bar.appendChild(btn('过', 'pass', 'window._mjPass()'));
      } else {
        // 无操作可执行：自动跳过（不需要显示"过"按钮）
        // 但给玩家一个视觉反馈：短暂显示弃牌信息
        status.textContent = tileLabel(_state.lastDiscard) + ' — 无操作';
        // 自动 pass（1.2 秒后）
        setTimeout(function () { if (window.makeGameMove) window.makeGameMove({ type: 'pass' }); }, 1200);
      }
      return;
    }

    if (_state.phase === 'play' || _state.phase === 'win') {
      // 不重复座位条已显示的信息；仅在不轮到自己时给一个等待提示
      status.textContent = _state.currentPlayer === me ? '' : '等待其他玩家…';
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

  // ---- 客户端判断可操作的吃碰杠胡（镜像服务端逻辑）----
  function countMatching(hand, k, n) {
    var c = 0;
    for (var i = 0; i < hand.length; i++) if (hand[i].k === k && hand[i].n === n) c++;
    return c;
  }

  // 简化的胡牌判断（标准型 + 七对），与 games/lib/mahjong-core 一致
  function huCheckSimple(tiles, melds) {
    var counts = {};
    for (var i = 0; i < tiles.length; i++) {
      var key = tiles[i].k + ':' + tiles[i].n;
      counts[key] = (counts[key] || 0) + 1;
    }
    var exposedMelds = melds ? melds.length : 0;
    var keys = Object.keys(counts);
    for (var pi = 0; pi < keys.length; pi++) {
      if (counts[keys[pi]] >= 2) {
        var tc = Object.assign({}, counts);
        tc[keys[pi]] -= 2;
        if (tc[keys[pi]] === 0) delete tc[keys[pi]];
        if (canFormMelds(tc)) return true;
      }
    }
    if (exposedMelds === 0 && tiles.length === 14) {
      if (keys.length === 7) {
        var allPairs = true;
        for (var j = 0; j < keys.length; j++) {
          if (counts[keys[j]] !== 2) { allPairs = false; break; }
        }
        if (allPairs) return true;
      }
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

  // 检查是否能吃（需要手中有能与弃牌组成顺子的两张牌）
  function canChowTile(hand, tile) {
    if (tile.k === 'feng' || tile.k === 'jian') return false;
    var k = tile.k, n = tile.n;
    var has = function(num) { return hand.some(function(t){return t.k===k&&t.n===num;}); };
    if (n-2 >= 1 && has(n-2) && has(n-1)) return true;
    if (n-1 >= 1 && n+1 <= 9 && has(n-1) && has(n+1)) return true;
    if (n+2 <= 9 && has(n+1) && has(n+2)) return true;
    return false;
  }

  // 返回当前玩家对 lastDiscard 可执行的操作列表
  function getAvailableClaims() {
    var claims = [];
    var ld = _state.lastDiscard;
    if (!ld) return claims;
    var hand = _state.hands[_playerIndex];
    if (!Array.isArray(hand)) return claims;
    var mc = countMatching(hand, ld.k, ld.n);
    // 胡
    var testHand = hand.concat([ld]);
    if (huCheckSimple(testHand, _state.melds[_playerIndex])) claims.push('win');
    // 杠（手中有 3 张）
    if (mc >= 3) claims.push('kong');
    // 碰（手中有 2 张）
    if (mc >= 2) claims.push('pung');
    // 吃（广东规则 + 能组成顺子）
    if (canChow() && canChowTile(hand, ld)) claims.push('chow');
    return claims;
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
