// public/js/renderers/sanguosha.js
// 三国杀·身份局 — canvas renderer (circular seats, clickable hand, HP/equip)
(function() {
  window.gameRenderers = window.gameRenderers || new Map();

  function t(key) { return typeof _t === 'function' ? _t(key) : key; }

  var ROLE_LABEL = {
    lord: '主公', loyalist: '忠臣', rebel: '反贼', traitor: '内奸', hidden: '?'
  };
  var ROLE_COLOR = {
    lord: '#e6b800', loyalist: '#3498db', rebel: '#e74c3c', traitor: '#9b59b6', hidden: '#888'
  };
  var SUIT_SYMBOL = { s: '♠', h: '♥', c: '♣', d: '♦' };
  var SUIT_COLOR = { s: '#1a1a1a', h: '#e74c3c', c: '#1a1a1a', d: '#e74c3c' };
  var CARD_COLOR = {
    basic: '#f5e6c8', trick: '#d8e8f0', equip: '#e8f0d8'
  };
  // Short legends for common-but-confusing trick cards (shown in status when selected).
  var CARD_HELP = {
    '决斗': '与目标轮流出杀',
    '无中生有': '摸两张牌',
    '南蛮入侵': '需出杀否则受伤',
    '万箭齐发': '需出闪否则受伤',
    '桃园结义': '全体回1体力',
    '过河拆桥': '弃置目标1牌',
    '顺手牵羊': '获得目标1牌',
  };

  var canvas, ctx, W, H;
  var selectedCard = null;   // selected hand card id (play phase)
  var selectedTarget = -1;   // hovered/clicked seat index
  var discardSel = [];       // selected hand card ids (discard phase, multi-select)
  var gameState = null;
  var selfIdx = 0;

  function cardWidth() { return Math.max(46, Math.min(70, W * 0.07)); }
  function cardHeight() { return cardWidth() * 1.4; }
  function candidateWidth() { return Math.max(72, Math.min(110, W * 0.24)); }
  function candidateHeight() { return candidateWidth() * 1.45; }
  function candidateGap() { return 14; }

  // ---- public API ----

  window.gameRenderers.set('sanguosha', {

    init: function(container) {
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;display:block;touch-action:manipulation;';
      container.innerHTML = '';
      container.appendChild(canvas);
      ctx = canvas.getContext('2d');

      var resize = function() {
        var dpr = window.devicePixelRatio || 1;
        W = window.innerWidth - (window.innerWidth > 600 ? 80 : 24);
        H = window.innerHeight - 220;
        W = Math.max(300, Math.min(W, 900));
        H = Math.max(300, Math.min(H, 700));
        canvas.width = W * dpr; canvas.height = H * dpr;
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        if (gameState) draw();
      };
      resize();
      window.addEventListener('resize', resize);

      canvas.addEventListener('click', function(e) {
        var rect = canvas.getBoundingClientRect();
        var x = (e.clientX - rect.left) * (W / rect.width);
        var y = (e.clientY - rect.top) * (H / rect.height);
        handleClick(x, y);
      });
    },

    render: function(state, container, playerIndex, winner) {
      gameState = state;
      selfIdx = playerIndex;
      if (!ctx) return;
      // Reset selection when it's no longer our turn / phase changed
      if (!isMyTurn()) { selectedCard = null; selectedTarget = -1; discardSel = []; }
      if (gameState.phase !== 'discard') discardSel = [];
      draw();
    },
  });

  // ---- interaction ----

  function isMyTurn() {
    return gameState && gameState.winner == null && gameState.currentPlayer === selfIdx;
  }

  function handleClick(x, y) {
    if (!gameState) return;

    // choosing phase: tap one of the 3 candidate cards (any player acts on their own candidates)
    if (gameState.phase === 'choosing') {
      var cands = gameState.candidateGenerals || [];
      for (var ci = 0; ci < cands.length; ci++) {
        var box = candidateBox(ci, cands.length);
        if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
          window.makeGameMove({ type: 'select_general', general: cands[ci] });
          return;
        }
      }
      return;
    }

    if (!isMyTurn()) return;
    var seats = gameState.seats || [];

    // 1) click a seat to set target (during play phase, with a card selected)
    if (gameState.phase === 'play' && selectedCard != null) {
      for (var i = 0; i < seats.length; i++) {
        if (i === selfIdx || seats[i].dead) continue;
        var pos = seatPosition(i, seats.length);
        if (Math.hypot(x - pos.x, y - pos.y) < pos.r) {
          selectedTarget = i;
          window.makeGameMove({ type: 'play', cardId: selectedCard, targetIdx: i });
          selectedCard = null; selectedTarget = -1;
          return;
        }
      }
    }

    // 2) confirm button for a selected non-target card
    if (selectedCard != null && gameState.phase === 'play') {
      var card = (gameState.myHand || []).find(function(c) { return c.id === selectedCard; });
      if (card && !needsTarget(card)) {
        var chH = cardHeight();
        var btn = { x: W / 2 - 40, y: H - chH - 16 - 50, w: 80, h: 32 };
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          window.makeGameMove({ type: 'play', cardId: selectedCard });
          selectedCard = null; selectedTarget = -1;
          return;
        }
      }
    }

    // 3) click a hand card to select it
    if (gameState.phase === 'play' || gameState.phase === 'discard') {
      var hand = (gameState.myHand) || [];
      var cw = cardWidth(), ch = cardHeight();
      var totalW = hand.length * (cw + 6);
      var startX = (W - totalW) / 2;
      var handY = H - ch - 16;
      for (var h = 0; h < hand.length; h++) {
        var cx = startX + h * (cw + 6);
        if (x >= cx && x <= cx + cw && y >= handY && y <= handY + ch) {
          if (gameState.phase === 'discard') {
            // multi-select for discard
            var idx = discardSel.indexOf(hand[h].id);
            if (idx === -1) discardSel.push(hand[h].id);
            else discardSel.splice(idx, 1);
          } else {
            selectedCard = (selectedCard === hand[h].id) ? null : hand[h].id;
          }
          draw();
          return;
        }
      }
    }

    // 3) draw-phase button
    if (gameState.phase === 'draw') {
      var btn = centerButton();
      if (btn && x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        window.makeGameMove({ type: 'draw' });
        return;
      }
    }

    // 4) play-phase end / discard-phase actions
    if (gameState.phase === 'play') {
      var endBtn = endButton();
      if (endBtn && x >= endBtn.x && x <= endBtn.x + endBtn.w && y >= endBtn.y && y <= endBtn.y + endBtn.h) {
        window.makeGameMove({ type: 'end' });
        return;
      }
    }
    if (gameState.phase === 'discard') {
      var seat = gameState.seats[selfIdx];
      var excess = seat.hand.length - seat.hp;
      if (excess <= 0) {
        // no discard needed — click 确定 to end turn
        var adv = endButton();
        if (adv && x >= adv.x && x <= adv.x + adv.w && y >= adv.y && y <= adv.y + adv.h) {
          window.makeGameMove({ type: 'end' });
        }
      } else if (discardSel.length === excess) {
        // confirm button: send the selected cards as discard
        var btn = { x: W / 2 - 50, y: H - cardHeight() - 16 - 50, w: 100, h: 32 };
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          window.makeGameMove({ type: 'discard', cardIds: discardSel.slice() });
          discardSel = [];
        }
      }
    }
  }

  // ---- layout ----

  // Place every seat (including self) on a ring. Self is pinned at the bottom
  // (angle π/2) and the others spread counter-clockwise around the table, so the
  // four seats never collide on a phone viewport. The radius grows with the
  // viewport but is clamped so the bottom (self) seat stays above the hand row.
  function seatPosition(i, n) {
    var cx = W / 2;
    var handTop = H - cardHeight() - 16;
    var cy = H / 2 - 8;
    var maxR = handTop - 34 - 10 - cy; // bottom seat's circle must clear the hand
    var radius = Math.min(Math.min(W, H) * 0.40, maxR);
    radius = Math.max(radius, Math.min(W, H) * 0.30); // never shrink too small
    var p = (i - selfIdx + n) % n; // 0 === self
    var angle = Math.PI / 2 + (Math.PI * 2 * p) / n;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      r: 34,
    };
  }

  function centerButton() {
    return { x: W / 2 - 50, y: H / 2 - 22, w: 100, h: 44 };
  }
  function endButton() {
    return { x: W - 110, y: H / 2 - 22, w: 96, h: 44 };
  }

  // ---- drawing ----

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!gameState) return;

    drawTable();
    var seats = gameState.seats || [];
    var n = seats.length;
    for (var i = 0; i < n; i++) {
      if (i === selfIdx) continue;
      drawSeat(seats[i], i, n, false);
    }
    // draw self last (on top), using the ring position
    if (seats[selfIdx]) drawSeat(seats[selfIdx], selfIdx, n, true);

    drawCenterInfo();
    drawHand();
    drawStatus();
  }

  function drawTable() {
    var cx = W / 2, cy = H / 2;
    var grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.min(W, H) * 0.45);
    grad.addColorStop(0, '#2e5d34');
    grad.addColorStop(1, '#1a3d20');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.min(W, H) * 0.42, Math.min(W, H) * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawSeat(seat, i, n, isSelf) {
    var pos = seatPosition(i, n);
    var isCurrent = gameState.currentPlayer === i;
    var isLord = seat.role === 'lord';
    var roleLabel = isSelf ? '你' : (ROLE_LABEL[seat.role] || seat.role);
    var roleCol = ROLE_COLOR[seat.role] || '#888';

    // seat circle
    ctx.save();
    if (seat.dead) ctx.globalAlpha = 0.35;
    if (isCurrent) {
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = seat.dead ? '#555' : '#2c2c2c';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = isCurrent ? 3.5 : (isLord ? 3 : 2);
    ctx.strokeStyle = isCurrent ? '#ffd700' : (isLord ? '#e6b800' : roleCol);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // player name (small)
    ctx.fillStyle = '#cfd8dc';
    ctx.font = 'bold 10px system-ui,sans-serif';
    var name = isSelf ? '你' : (window.getPlayerName ? window.getPlayerName(i) : ('P' + (i + 1)));
    ctx.fillText(name, pos.x, pos.y - 24);

    // general (武将) — the main label
    ctx.fillStyle = isLord ? '#ffd700' : '#fff';
    ctx.font = 'bold 14px "Ma Shan Zheng","KaiTi",system-ui,sans-serif';
    ctx.fillText(seat.general || '…', pos.x, pos.y - 8);

    // role
    ctx.font = '10px system-ui,sans-serif';
    ctx.fillStyle = roleCol;
    ctx.fillText(roleLabel, pos.x, pos.y + 8);

    // HP pips
    drawHpPips(pos.x, pos.y + 20, seat.hp, seat.maxHp);

    // hand count
    ctx.fillStyle = '#cfd8dc';
    ctx.font = '10px system-ui,sans-serif';
    ctx.fillText(seat.handCount + '牌', pos.x, pos.y + 34);

    // equipment
    if (seat.equip) {
      var eq = [];
      if (seat.equip.weapon) eq.push(seat.equip.weapon.name);
      if (seat.equip.armor) eq.push(seat.equip.armor.name);
      if (eq.length) {
        ctx.font = '9px system-ui,sans-serif';
        ctx.fillStyle = '#a5d6a7';
        ctx.fillText(eq.join(' '), pos.x, pos.y + 46);
      }
    }

    // target highlight
    if (selectedTarget === i && selectedCard != null) {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pos.r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawHpPips(x, y, hp, maxHp) {
    var pipW = 7, gap = 2;
    var totalW = maxHp * pipW + (maxHp - 1) * gap;
    var sx = x - totalW / 2;
    for (var i = 0; i < maxHp; i++) {
      ctx.fillStyle = i < hp ? '#e74c3c' : 'rgba(255,255,255,0.2)';
      ctx.fillRect(sx + i * (pipW + gap), y, pipW, 5);
    }
  }

  function drawCenterInfo() {
    var cx = W / 2, cy = H / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (gameState.winner != null) {
      var w = gameState.winner;
      var myRole = (gameState.seats[selfIdx] || {}).role;
      var iWon = (w === 'lord' && (myRole === 'lord' || myRole === 'loyalist')) ||
                 (w === 'rebel' && myRole === 'rebel') ||
                 (w === 'traitor' && myRole === 'traitor');
      ctx.fillStyle = iWon ? '#ffd700' : '#e74c3c';
      ctx.font = 'bold 28px system-ui,sans-serif';
      ctx.fillText(iWon ? '胜利!' : '失败', cx, cy - 10);
      ctx.font = '16px system-ui,sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('获胜方: ' + (ROLE_LABEL[w] || w), cx, cy + 18);
      return;
    }

    // choosing phase: candidate cards occupy the center — keep it clean here (count shown in status)
    if (gameState.phase === 'choosing') return;

    // phase indicator
    var phaseLabel = { draw: '摸牌阶段', play: '出牌阶段', discard: '弃牌阶段' };
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 18px system-ui,sans-serif';
    ctx.fillText(phaseLabel[gameState.phase] || gameState.phase, cx, cy - 10);

    ctx.font = '13px system-ui,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    if (gameState.phase === 'draw') {
      ctx.fillText('点击抽牌', cx, cy + 14);
      drawButton(centerButton(), '抽 牌', '#27ae60');
    } else if (gameState.phase === 'play') {
      var whose = gameState.currentPlayer === selfIdx ? '你的回合' : ('P' + (gameState.currentPlayer + 1) + ' 的回合');
      ctx.fillText(whose, cx, cy + 14);
      drawButton(endButton(), '结束出牌', '#c0392b');
    } else if (gameState.phase === 'discard') {
      var seat = gameState.seats[selfIdx];
      var excess = seat.hand.length - seat.hp;
      if (excess > 0) {
        ctx.fillText('需弃 ' + excess + ' 张牌 (已选 ' + discardSel.length + ')', cx, cy + 14);
        if (discardSel.length === excess) {
          drawButton({ x: W / 2 - 50, y: H - cardHeight() - 16 - 50, w: 100, h: 32 }, '确认弃牌', '#c0392b');
        }
      } else {
        ctx.fillText('无需弃牌', cx, cy + 14);
        drawButton(endButton(), '确定', '#27ae60');
      }
    }

    // heap count
    ctx.font = '12px system-ui,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('牌堆: ' + gameState.heap, cx, cy + 36);
  }

  function drawButton(b, label, color) {
    if (!b) return;
    ctx.fillStyle = color;
    roundRect(b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
  }

  function candidateBox(index, count) {
    var cw = candidateWidth(), ch = candidateHeight();
    var gap = candidateGap();
    var totalW = count * cw + (count - 1) * gap;
    var startX = (W - totalW) / 2;
    var y = (H - ch) / 2 - 16;
    return { x: startX + index * (cw + gap), y: y, w: cw, h: ch };
  }

  // Choosing phase: show the player's 3 candidate general cards.
  function drawChoose() {
    var cands = gameState.candidateGenerals || [];
    if (!cands.length) return;
    var chosenGeneral = gameState.seats[selfIdx] ? gameState.seats[selfIdx].general : null;
    var ch = candidateHeight();
    var y = (H - ch) / 2 - 16;
    for (var i = 0; i < cands.length; i++) {
      var box = candidateBox(i, cands.length);
      drawCandidateCard(box.x, box.y, box.w, box.h, cands[i], chosenGeneral === cands[i]);
    }
    // prompt above the cards
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 16px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('请选择武将', W / 2, y - 24);
  }

  function drawCandidateCard(x, y, w, h, general, selected) {
    ctx.save();
    if (selected) {
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = '#f5e6c8';
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.strokeStyle = selected ? '#ffd700' : 'rgba(0,0,0,0.3)';
    ctx.stroke();
    // general name (large)
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold ' + Math.round(w * 0.3) + 'px "Ma Shan Zheng","KaiTi",system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(general, x + w / 2, y + h / 2);
    ctx.font = '11px system-ui,sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText('点此选择', x + w / 2, y + h - 14);
    ctx.restore();
  }

  function drawHand() {
    // choosing phase: show candidate cards, not hand
    if (gameState.phase === 'choosing') { drawChoose(); return; }
    var hand = gameState.myHand || [];
    if (!hand.length) return;
    var cw = cardWidth(), ch = cardHeight();
    var totalW = hand.length * (cw + 6);
    var startX = (W - totalW) / 2;
    var y = H - ch - 16;

    for (var i = 0; i < hand.length; i++) {
      var cx = startX + i * (cw + 6);
      var c = hand[i];
      var selected = (selectedCard === c.id) ||
                     (gameState.phase === 'discard' && discardSel.indexOf(c.id) !== -1);
      var lift = selected ? -14 : 0;
      drawCard(cx, y + lift, cw, ch, c, selected);
    }

    // confirm play button when a card needs a target
    if (selectedCard != null && gameState.phase === 'play') {
      var card = hand.find(function(c) { return c.id === selectedCard; });
      if (card && needsTarget(card)) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.font = '13px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('点击目标玩家', W / 2, y - 24);
      } else if (card) {
        drawButton({ x: W / 2 - 40, y: y - 50, w: 80, h: 32 }, '出牌', '#27ae60');
      }
    }
  }

  function needsTarget(card) {
    return card.name === '杀' || card.name === '过河拆桥' ||
           card.name === '顺手牵羊' || card.name === '决斗';
  }

  function drawCard(x, y, w, h, c, selected) {
    ctx.save();
    if (selected) {
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 12;
    }
    ctx.fillStyle = CARD_COLOR[c.type] || '#f5e6c8';
    roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = selected ? 2.5 : 1;
    ctx.strokeStyle = selected ? '#ffd700' : 'rgba(0,0,0,0.3)';
    ctx.stroke();

    // suit + rank top-left
    var col = SUIT_COLOR[c.suit] || '#1a1a1a';
    ctx.fillStyle = col;
    ctx.font = 'bold ' + (h * 0.22) + 'px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText((SUIT_SYMBOL[c.suit] || '') + c.rank, x + 4, y + 4);

    // name (vertical-ish, centered)
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold ' + (h * 0.18) + 'px "Ma Shan Zheng","KaiTi",system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.name, x + w / 2, y + h / 2 + 4);
    ctx.restore();
  }

  function drawStatus() {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = '12px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var king = gameState.king || {};
    var lines = ['主公: P' + ((king.seat || 0) + 1), '回合: ' + (gameState.turn + 1)];
    if (gameState.phase === 'choosing') {
      var chosenCount = (gameState.seats || []).filter(function(s) { return s.chosen; }).length;
      lines.push('正在选将: ' + chosenCount + '/' + (gameState.seats || []).length);
    }
    if (gameState.phase === 'discard') {
      var seat = gameState.seats[selfIdx];
      lines.push('手牌 ' + seat.hand.length + '/' + seat.hp);
    }
    // show a one-line legend for the selected trick card
    if (selectedCard != null) {
      var sel = (gameState.myHand || []).find(function(c) { return c.id === selectedCard; });
      if (sel && CARD_HELP[sel.name]) lines.push(sel.name + ': ' + CARD_HELP[sel.name]);
    }
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 10, 10 + i * 16);
    }
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

  // expose callback for non-target card confirm button
  window._sgsPlayConfirm = function() {
    if (!gameState || !isMyTurn()) return;
    var card = (gameState.myHand || []).find(function(c) { return c.id === selectedCard; });
    if (!card) return;
    if (needsTarget(card)) return; // must pick target on canvas
    window.makeGameMove({ type: 'play', cardId: selectedCard });
    selectedCard = null;
  };

})();
