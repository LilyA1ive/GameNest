(function() {
  window.gameRenderers = window.gameRenderers || new Map();
  window.gameRenderers.set('heat', {
    init: function(container) {
      container.innerHTML = `
        <style>
          .heat-container {
            background: #0c0808;
            color: #f2e2e2;
            font-family: system-ui, -apple-system, sans-serif;
            padding: 20px;
            border-radius: 10px;
            max-width: 750px;
            margin: 0 auto;
            box-sizing: border-box;
          }
          .heat-select, .heat-play, .heat-over {
            display: none;
          }
          .heat-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-top: 15px;
          }
          @media (max-width: 600px) {
            .heat-grid { grid-template-columns: repeat(2, 1fr); }
          }
          .heat-tile {
            background: #1c1111;
            border: 1px solid #7a1f1f;
            border-radius: 8px;
            padding: 15px;
            cursor: pointer;
            text-align: center;
            transition: all 0.2s ease;
          }
          .heat-tile:hover {
            background: #2b1717;
            border-color: #b3402e;
          }
          .heat-tile-emoji {
            font-size: 28px;
            margin-bottom: 6px;
          }
          .heat-tile-name {
            font-size: 15px;
            font-weight: bold;
            color: #b3402e;
            margin-bottom: 4px;
          }
          .heat-tile-ds {
            font-size: 11px;
            color: #b89898;
          }
          .heat-header {
            font-size: 18px;
            font-weight: bold;
            color: #b3402e;
            margin-bottom: 15px;
            border-bottom: 2px solid #7a1f1f;
            padding-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .heat-bars {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 15px;
          }
          .heat-bar-row {
            display: flex;
            align-items: center;
          }
          .heat-bar-label {
            width: 90px;
            font-size: 13px;
            color: #b89898;
          }
          .heat-bar-outer {
            flex: 1;
            background: #211414;
            height: 18px;
            border-radius: 9px;
            overflow: hidden;
            position: relative;
            border: 1px solid #4a1515;
          }
          .heat-bar-inner {
            background: linear-gradient(90deg, #7a1f1f, #b3402e);
            height: 100%;
            width: 0%;
            transition: width 0.3s ease;
          }
          .heat-bar-num {
            position: absolute;
            right: 8px;
            top: 0;
            line-height: 16px;
            font-size: 11px;
            font-weight: bold;
            color: #fff;
          }
          .heat-hands {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 15px;
          }
          @media (max-width: 600px) {
            .heat-hands { grid-template-columns: 1fr; }
          }
          .heat-hand-title {
            font-size: 14px;
            font-weight: bold;
            color: #b3402e;
            margin-bottom: 8px;
          }
          .heat-cards-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .heat-card {
            background: #1c1111;
            border: 1px solid #7a1f1f;
            border-radius: 6px;
            padding: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .heat-card.disabled {
            pointer-events: none;
            opacity: 0.5;
          }
          .heat-card:not(.disabled):hover {
            background: #2b1717;
            border-color: #b3402e;
          }
          .heat-card.highlight {
            border: 1px solid #b3402e;
            background: #361717;
            box-shadow: 0 0 8px rgba(179, 64, 46, 0.4);
          }
          .heat-card-name {
            font-size: 13px;
            font-weight: bold;
            color: #fff;
          }
          .heat-card-meta {
            font-size: 12px;
            color: #b89898;
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .heat-card-tag {
            font-size: 10px;
            background: #471717;
            padding: 2px 4px;
            border-radius: 3px;
            color: #f2a2a2;
          }
          .heat-log {
            background: #140d0d;
            border: 1px solid #361717;
            border-radius: 6px;
            padding: 10px;
            max-height: 180px;
            overflow-y: auto;
            margin-bottom: 15px;
          }
          .heat-log-line {
            font-size: 12px;
            margin-bottom: 4px;
            line-height: 1.4;
          }
          .heat-log-you { color: #f0c0c0; }
          .heat-log-me { color: #f0a0a0; }
          .heat-log-sys { text-align: center; font-style: italic; color: #b3402e; }
          .heat-result-block {
            background: #331111;
            border: 1px dashed #b3402e;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
            margin-top: 15px;
          }
          .heat-result-large {
            font-size: 18px;
            font-weight: bold;
            color: #ff5c5c;
            margin-bottom: 5px;
          }
          .heat-result-small {
            font-size: 12px;
            color: #d6b2b2;
            font-style: italic;
          }
        </style>
        <div class="heat-select"></div>
        <div class="heat-play"></div>
        <div class="heat-over"></div>
      `;
    },

    render: function(state, container, playerIndex, winner) {
      const selectSec = container.querySelector('.heat-select');
      const playSec = container.querySelector('.heat-play');
      const overSec = container.querySelector('.heat-over');

      if (!selectSec || !playSec || !overSec) return;

      selectSec.style.display = 'none';
      playSec.style.display = 'none';
      overSec.style.display = 'none';

      const metaP = state.meta ? (state.meta.p || state.meta.P) : null;

      if (state.phase === 'select') {
        selectSec.style.display = 'block';
        if (metaP) {
          const keys = Object.keys(metaP);
          const tilesHtml = keys.map(key => {
            const tile = metaP[key];
            return `
              <div class="heat-tile" onclick="window.makeGameMove({select: '${key}'})">
                <div class="heat-tile-emoji">${tile.em || '🔥'}</div>
                <div class="heat-tile-name">${tile.name || ''}</div>
                <div class="heat-tile-ds">${tile.ds || ''}</div>
              </div>
            `;
          }).join('');

          selectSec.innerHTML = `
            <div class="heat-container">
              <div class="heat-header" style="justify-content: center; border-bottom: none; margin-bottom: 5px;">💖 选择姿势以开始 💖</div>
              <div class="heat-grid">${tilesHtml}</div>
            </div>
          `;
        }
      } else if (state.phase === 'play' || state.phase === 'over') {
        // Result lines are drawn inside the play screen (spec §3.4: SAY.big/org on the
        // end screen); room-client's generic overlay handles play-again separately.
        playSec.style.display = 'block';
        var activeSec = playSec;

        if (metaP && state.position && metaP[state.position]) {
          const pos = metaP[state.position];

          // Bars
          const meV = state.meV || 0;
          const youV = state.youV || 0;
          const barsHtml = `
            <div class="heat-bars">
              <div class="heat-bar-row">
                <div class="heat-bar-label">我的快感</div>
                <div class="heat-bar-outer">
                  <div class="heat-bar-inner" style="width: ${Math.min(100, meV)}%;"></div>
                  <div class="heat-bar-num">${meV}</div>
                </div>
              </div>
              <div class="heat-bar-row">
                <div class="heat-bar-label">你的快感</div>
                <div class="heat-bar-outer">
                  <div class="heat-bar-inner" style="width: ${Math.min(100, youV)}%;"></div>
                  <div class="heat-bar-num">${youV}</div>
                </div>
              </div>
            </div>
          `;

          // Hand
          const yourDisabled = (state.pendingHuman !== null || state.phase !== 'play' || winner !== null || state.winner !== null);
          const yourHandHtml = (pos.male || []).map((card, i) => {
            const cls = yourDisabled ? 'heat-card disabled' : 'heat-card';
            const clickAttr = yourDisabled ? '' : `onclick="window.makeGameMove({card: ${i}})"`;
            return `
              <div class="${cls}" ${clickAttr}>
                <div class="heat-card-name">${card[0]}</div>
                <div class="heat-card-meta">${card[1]} <span class="heat-card-tag">${card[2]}</span></div>
              </div>
            `;
          }).join('');

          // Lily Hand
          const lilyHandHtml = (pos.female || []).map((card, i) => {
            const isPicked = (state.lastMe === i);
            const cls = isPicked ? 'heat-card highlight' : 'heat-card disabled';
            const pickedLabel = isPicked ? '<span style="color: #ff5c5c; font-size: 11px; margin-right: 4px;">她选中</span>' : '';
            return `
              <div class="${cls}" style="pointer-events: none;">
                <div class="heat-card-name">${pickedLabel}${card[0]}</div>
                <div class="heat-card-meta">${card[1]} <span class="heat-card-tag">${card[2]}</span></div>
              </div>
            `;
          }).join('');

          // Log
          const last8 = state.lines ? state.lines.slice(-8) : [];
          const logHtml = last8.map(line => {
            let text = line.text || '';
            if (line.gain !== undefined) {
              text += ` (+${line.gain})`;
            }
            if (line.who === 'you') {
              return `<div class="heat-log-line heat-log-you"><strong>你:</strong> ${text}</div>`;
            } else if (line.who === 'me') {
              return `<div class="heat-log-line heat-log-me"><strong>Lily:</strong> ${text}</div>`;
            } else {
              return `<div class="heat-log-line heat-log-sys">${text}</div>`;
            }
          }).join('');

          // Result block
          let resultHtml = '';
          if (state.phase === 'over' || winner !== null || state.winner !== null) {
            const lastTwo = state.lines ? state.lines.slice(-2) : [];
            if (lastTwo.length >= 2) {
              resultHtml = `
                <div class="heat-result-block">
                  <div class="heat-result-large">${lastTwo[0].text}</div>
                  <div class="heat-result-small">${lastTwo[1].text}</div>
                </div>
              `;
            }
          }

          activeSec.innerHTML = `
            <div class="heat-container">
              <div class="heat-header">
                <span>${pos.em || '🔥'}</span>
                <span>${pos.name || ''}</span>
                <span style="font-size: 12px; font-weight: normal; color: #b89898; margin-left: auto;">${pos.ds || ''}</span>
              </div>
              ${barsHtml}
              <div class="heat-hands">
                <div>
                  <div class="heat-hand-title">你的手牌</div>
                  <div class="heat-cards-list">${yourHandHtml}</div>
                </div>
                <div>
                  <div class="heat-hand-title">Lily 的手牌</div>
                  <div class="heat-cards-list">${lilyHandHtml}</div>
                </div>
              </div>
              <div class="heat-hand-title">情事记录</div>
              <div class="heat-log">${logHtml}</div>
              ${resultHtml}
            </div>
          `;
        }
      }
    }
  });
})();
