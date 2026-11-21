(function () {
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  function card(v) {
    var thumb = 'https://img.youtube.com/vi/' + v.youtube_id + '/hqdefault.jpg';
    var title = v.title || (v.kind === 'short' ? 'YouTube Short' : 'YouTube video');
    return '<div class="card svc yt-card' + (v.kind === 'short' ? ' short' : '') + '">' +
      '<div class="yt-thumb" data-yt="' + esc(v.youtube_id) + '" data-kind="' + esc(v.kind) + '" role="button" tabindex="0" aria-label="Play ' + esc(title) + '">' +
      '<img src="' + thumb + '" alt="' + esc(title) + '" loading="lazy"><span class="yt-play">&#9654;</span></div>' +
      '<h3 style="margin:12px 0 6px;font-size:1.05rem">' + esc(title) + '</h3>' +
      '<div class="actions"><a class="btn sm" href="contact.html">Book a consultation</a> ' +
      '<a style="font-size:.9rem;align-self:center" href="https://www.youtube.com/' + (v.kind === 'short' ? 'shorts/' : 'watch?v=') + esc(v.youtube_id) + '" target="_blank" rel="noopener">Watch on YouTube</a></div></div>';
  }

  function play(id, kind) {
    var style = kind === 'short' ? ' style="width:min(360px,90vw);height:min(640px,80vh)"' : '';
    openLightbox('<iframe' + style + ' src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>');
  }

  window.renderVideos = function (el, list, emptyText) {
    el.innerHTML = list.length ? list.map(card).join('') : '<p class="muted">' + (emptyText || 'Videos coming soon.') + '</p>';
    el.querySelectorAll('.yt-thumb').forEach(function (t) {
      var go = function () { play(t.dataset.yt, t.dataset.kind); };
      t.addEventListener('click', go);
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  };

  // Compact list for the sidebar: thumbnail and title only
  window.renderVideosCompact = function (el, list, emptyText) {
    el.innerHTML = list.length ? list.map(function (v) {
      var title = v.title || (v.kind === 'short' ? 'YouTube Short' : 'YouTube video');
      return '<div class="yt-mini"><div class="yt-thumb" data-yt="' + esc(v.youtube_id) + '" data-kind="' + esc(v.kind) + '" role="button" tabindex="0" aria-label="Play ' + esc(title) + '">' +
        '<img src="https://img.youtube.com/vi/' + esc(v.youtube_id) + '/mqdefault.jpg" alt="" loading="lazy"><span class="yt-play">&#9654;</span></div><p>' + esc(title) + '</p></div>';
    }).join('') : '<p class="muted" style="margin:0">' + (emptyText || 'Videos coming soon.') + '</p>';
    el.querySelectorAll('.yt-thumb').forEach(function (t) {
      var go = function () { play(t.dataset.yt, t.dataset.kind); };
      t.addEventListener('click', go);
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  };
})();
