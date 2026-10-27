// src/js/components/image-viewer.js

window.ImageViewer = {
  currentImg: null,
  zoomLevel: 1,
  galleryImages: [],
  currentIndex: 0,

  init() {
    this.container = document.getElementById('image-viewer-modal');
    if (!this.container) return;

    this.container.style.cssText = `
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      z-index: 9999;
      flex-direction: column;
    `;

    this.render();
    this.attachEvents();
  },

  render() {
    this.container.innerHTML = `
      <div style="height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 var(--spacing-lg); background: linear-gradient(rgba(0,0,0,0.8), transparent); color: white;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="icons/app/orbit.ico" style="width: 24px; height: 24px; object-fit: contain;">
          <div style="font-family: var(--font-display); font-weight: 600;" id="iv-title">Image Preview</div>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <button id="iv-btn-zoom-out" style="background:transparent; border:none; color:white; cursor:pointer;" title="Zoom Out"><i data-lucide="zoom-out"></i></button>
          <button id="iv-btn-zoom-in" style="background:transparent; border:none; color:white; cursor:pointer;" title="Zoom In"><i data-lucide="zoom-in"></i></button>
          <button id="iv-btn-save" style="background:transparent; border:none; color:white; cursor:pointer;" title="Quick Save"><i data-lucide="save"></i></button>
          <button id="iv-btn-download" style="background:transparent; border:none; color:white; cursor:pointer;" title="Download"><i data-lucide="download"></i></button>
          <button id="iv-btn-forward" style="background:transparent; border:none; color:white; cursor:pointer;" title="Resend to Active Chat"><i data-lucide="forward"></i></button>
          <button id="iv-btn-report" style="background:transparent; border:none; color:white; cursor:pointer;" title="Hide this image and its exact copies"><i data-lucide="flag"></i></button>
          <button id="iv-btn-close" style="background:transparent; border:none; color:white; cursor:pointer; margin-left: 16px;" title="Close"><i data-lucide="x"></i></button>
        </div>
      </div>
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative;" id="iv-canvas-area">
        <button id="iv-btn-prev" style="position:absolute; left: 20px; top: 50%; transform: translateY(-50%); background:rgba(0,0,0,0.5); border:none; border-radius:50%; color:white; width:48px; height:48px; display:none; align-items:center; justify-content:center; cursor:pointer; z-index: 10; transition: background 0.2s;"><i data-lucide="chevron-left"></i></button>
        <img id="iv-image" src="" style="max-width: 90%; max-height: 90%; object-fit: contain; transition: transform 0.2s ease;">
        <button id="iv-btn-next" style="position:absolute; right: 20px; top: 50%; transform: translateY(-50%); background:rgba(0,0,0,0.5); border:none; border-radius:50%; color:white; width:48px; height:48px; display:none; align-items:center; justify-content:center; cursor:pointer; z-index: 10; transition: background 0.2s;"><i data-lucide="chevron-right"></i></button>
      </div>
      <div id="iv-filmstrip-container" style="height: 80px; display: none; align-items: center; gap: 8px; padding: 0 16px; background: rgba(0,0,0,0.5); overflow-x: auto; scroll-behavior: smooth;">
      </div>
    `;
    lucide.createIcons({ root: this.container });
  },

  attachEvents() {
    var self = this;
    
    document.getElementById('iv-btn-close').addEventListener('click', () => self.close());
    
    document.getElementById('iv-btn-zoom-in').addEventListener('click', () => {
      self.zoomLevel += 0.25;
      self.updateZoom();
    });
    
    document.getElementById('iv-btn-zoom-out').addEventListener('click', () => {
      self.zoomLevel = Math.max(0.25, self.zoomLevel - 0.25);
      self.updateZoom();
    });

    // Report this image: hash it, put the hash on the local list, and re-render so the
    // thumbnail is masked. ⚠ This is pillar 2's FILTER, not pillar 1's report — it makes
    // no claim about anybody and sends nothing; it only hides these exact bytes from the
    // person who asked. Saying so in the toast matters, because "Report" in a messenger
    // normally means "tell someone".
    document.getElementById('iv-btn-report').addEventListener('click', function () {
      if (!self.currentImg || !window.OrbitContentFilter) return;
      var F = window.OrbitContentFilter;
      var key = self.currentImg.id || self.currentImg.url;
      F.ensureHash({ id: key, url: self.currentImg.url }).then(function (r) {
        if (!r.hash) {
          if (window.Toast) window.Toast.show('Could not hide it', 'The file could not be read.', 'error');
          return;
        }
        F.flag(r.hash, { name: self.currentImg.name, mimeType: self.currentImg.mimeType });
        // Seed the renderer's cache under the attachment id too, so the grid masks this
        // thumbnail immediately instead of re-hashing the file to discover it.
        if (self.currentImg.id) F.remember(self.currentImg.id, r.hash);
        self.close();
        if (window.ChatPanel) window.ChatPanel.renderChat(window.store.getState());
        if (window.Toast) {
          window.Toast.show('Hidden on this device',
            'Exact copies of this file will be hidden too. Nothing was sent to anyone.',
            'success', 5000);
        }
      }).catch(function () {
        if (window.Toast) window.Toast.show('Could not hide it', 'The file could not be read.', 'error');
      });
    });

    document.getElementById('iv-btn-save').addEventListener('click', async () => {
      if (!self.currentImg) return;
      try {
        var resp = await fetch(self.currentImg.url);
        var blob = await resp.blob();
        if (window.showSaveFilePicker) {
          var handle = await window.showSaveFilePicker({
            suggestedName: self.currentImg.name || 'image.' + (blob.type.split('/')[1] || 'png'),
            types: [{ accept: { 'image/*': ['.' + (blob.type.split('/')[1] || 'png')] } }]
          });
          var writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } else {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = self.currentImg.name || 'image.' + (blob.type.split('/')[1] || 'png');
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
        }
      } catch(e) {
        if (e.name === 'AbortError') return;
        console.warn('[ImageViewer] Save failed:', e);
      }
    });

    document.getElementById('iv-btn-download').addEventListener('click', async () => {
      if (!self.currentImg) return;
      // Use fetch+blob for cross-origin/orbit-db URLs
      try {
        var resp = await fetch(self.currentImg.url);
        var blob = await resp.blob();
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = self.currentImg.name || 'image.' + (blob.type.split('/')[1] || 'png');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
      } catch(e) {
        // Fallback for blob: URLs
        var a = document.createElement('a');
        a.href = self.currentImg.url;
        a.download = self.currentImg.name || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });

    document.getElementById('iv-btn-forward').addEventListener('click', () => {
      if (!self.currentImg) return;
      // Resend to active chat
      const state = window.store.getState();
      if (!state.activeChatId) {
        if (window.Toast) window.Toast.show("Error", "No active chat selected.");
        return;
      }
      
      // Extract attachment ID from URL or generate new one
      var attId = self.currentImg.id || null;
      if (!attId) {
        var urlMatch = self.currentImg.url.match(/orbit-db:\/\/attachment\/(.+)/);
        attId = urlMatch ? urlMatch[1] : String(Date.now());
      }
      var attPath = self.currentImg.path || null;

      const newMsg = {
        id: Date.now(),
        sender: state.currentUser.userId,
        text: '',
        timestamp: new Date().toISOString(),
        attachments: [
          {
            id: attId,
            type: 'image',
            name: self.currentImg.name,
            url: self.currentImg.url,
            size: self.currentImg.size,
            path: attPath
          }
        ]
      };
      
      window.store.addMessage(state.activeChatId, newMsg);
      if (window.Toast) window.Toast.show("Success", "Image forwarded to chat.");
      self.close();
      
      // Navigate to DMS if in gallery
      if (state.activeTab !== 'dms') {
        window.store.setState({ activeTab: 'dms' });
      }
    });

    document.getElementById('iv-btn-prev').addEventListener('click', () => {
      if (self.galleryImages.length > 1) {
        self.currentIndex = (self.currentIndex - 1 + self.galleryImages.length) % self.galleryImages.length;
        self.showImage(self.galleryImages[self.currentIndex]);
      }
    });

    document.getElementById('iv-btn-next').addEventListener('click', () => {
      if (self.galleryImages.length > 1) {
        self.currentIndex = (self.currentIndex + 1) % self.galleryImages.length;
        self.showImage(self.galleryImages[self.currentIndex]);
      }
    });

    // Keyboard navigation
    this._keyHandler = function(e) {
      if (self.container.style.display !== 'flex') return;
      if (e.key === 'Escape') { self.close(); return; }
      if (e.key === 'ArrowLeft') {
        if (self.galleryImages.length > 1) {
          self.currentIndex = (self.currentIndex - 1 + self.galleryImages.length) % self.galleryImages.length;
          self.showImage(self.galleryImages[self.currentIndex]);
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        if (self.galleryImages.length > 1) {
          self.currentIndex = (self.currentIndex + 1) % self.galleryImages.length;
          self.showImage(self.galleryImages[self.currentIndex]);
        }
        return;
      }
    };
    document.addEventListener('keydown', this._keyHandler);

    // Swipe support for canvas area
    var canvasArea = document.getElementById('iv-canvas-area');
    var startX = 0;
    var startY = 0;
    canvasArea.addEventListener('mousedown', function(e) {
      startX = e.clientX;
      startY = e.clientY;
    });
    canvasArea.addEventListener('mouseup', function(e) {
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) {
        if (dx < 0) {
          document.getElementById('iv-btn-next').click();
        } else {
          document.getElementById('iv-btn-prev').click();
        }
      }
    });
    canvasArea.addEventListener('touchstart', function(e) {
      var touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    }, { passive: true });
    canvasArea.addEventListener('touchend', function(e) {
      var touch = e.changedTouches[0];
      var dx = touch.clientX - startX;
      var dy = touch.clientY - startY;
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) {
        if (dx < 0) {
          document.getElementById('iv-btn-next').click();
        } else {
          document.getElementById('iv-btn-prev').click();
        }
      }
    }, { passive: true });
  },

  updateZoom() {
    const imgEl = document.getElementById('iv-image');
    if (imgEl) {
      imgEl.style.transform = `scale(${this.zoomLevel})`;
    }
  },

  open(imgObj) {
    this.openGallery([imgObj], 0);
  },

  /**
   * Open a list of images at one of them.
   *
   * ⚠ ONE FUNNEL. `openFromMessage` had this four lines inline and the staged
   * attachments need the same thing, so it lives here now and both call it. The
   * viewer was always built for a gallery — it carries `galleryImages`, a
   * `currentIndex` and prev/next buttons — it was just never handed more than
   * one image by anything except a message.
   *
   * @param {Array} images  [{ url, name }]
   * @param {number} index  which one to land on
   */
  openGallery(images, index) {
    if (!this.container) return;
    var list = (images || []).filter(function (i) { return i && i.url; });
    if (!list.length) return;
    var at = Math.max(0, Math.min(index || 0, list.length - 1));
    this.galleryImages = list;
    this.currentIndex = at;
    this.showImage(list[at]);
    this.container.style.display = 'flex';
  },

  openFromMessage(msgId, attId, fallbackImg) {
    if (!this.container) return;
    var state = window.store ? window.store.getState() : null;
    if (!state || !state.messages) {
      if (fallbackImg && fallbackImg.url) {
        this.open(fallbackImg);
      } else {
        console.warn('[ImageViewer] No store or messages available, no fallback URL');
      }
      return;
    }
    var msgList = state.messages[state.activeChatId] || [];
    var msg = msgList.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg) {
      Object.keys(state.messages).some(function(chatId) {
        msg = (state.messages[chatId] || []).find(function(m) { return String(m.id) === String(msgId); });
        return !!msg;
      });
    }
    
    if (msg && msg.attachments) {
      var gallery = msg.attachments.filter(function(a) { return a.type === 'image'; });
      if (gallery.length > 0) {
        var index = gallery.findIndex(function(a) { return String(a.id) === String(attId); });
        this.openGallery(gallery, index !== -1 ? index : 0);
        return;
      }
      // gallery empty — fall through to fallback
    }
    
    if (fallbackImg && fallbackImg.url) {
      this.open(fallbackImg);
    }
  },

  showImage(imgObj) {
    this.currentImg = imgObj;
    this.zoomLevel = 1;
    
    var ivImg = document.getElementById('iv-image');
    if (!ivImg) {
      this.render();
      this.attachEvents();
      ivImg = document.getElementById('iv-image');
    }
    if (!ivImg) return;
    ivImg.removeAttribute('data-retried');
    ivImg.onerror = function() {
      if (!ivImg.hasAttribute('data-retried') && imgObj.url) {
        ivImg.setAttribute('data-retried', '1');
        ivImg.src = imgObj.url + (imgObj.url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
        return;
      }
      var title = document.getElementById('iv-title');
      if (title) title.innerText = 'Image failed to load';
    };
    ivImg.src = imgObj.url;
    if (window.freezeGifImages && imgObj.url && (imgObj.url.indexOf('.gif') > -1 || imgObj.url.indexOf('image/gif') > -1)) {
      ivImg.onload = function() {
        if (window.store && window.store.getState && window.store.getState().settings && window.store.getState().settings.reduceMotion) {
          var c = document.createElement('canvas');
          c.width = ivImg.naturalWidth;
          c.height = ivImg.naturalHeight;
          c.getContext('2d').drawImage(ivImg, 0, 0);
          ivImg.src = c.toDataURL('image/png');
        }
      };
    }
    var titleText = imgObj.name || 'Image Preview';
    if (this.galleryImages.length > 1) {
      titleText += ' (' + (this.currentIndex + 1) + '/' + this.galleryImages.length + ')';
    }
    document.getElementById('iv-title').innerText = titleText;
    
    document.getElementById('iv-btn-prev').style.display = this.galleryImages.length > 1 ? 'flex' : 'none';
    document.getElementById('iv-btn-next').style.display = this.galleryImages.length > 1 ? 'flex' : 'none';
    
    // Update filmstrip
    var filmstrip = document.getElementById('iv-filmstrip-container');
    if (filmstrip) {
      if (this.galleryImages.length > 1) {
        filmstrip.style.display = 'flex';
        var html = '';
        var self = this;
        this.galleryImages.forEach(function(img, idx) {
          var isSelected = idx === self.currentIndex;
          var opacity = isSelected ? '1' : '0.4';
          var border = isSelected ? '2px solid white' : '2px solid transparent';
          html += '<img src="' + window.Sanitize.escapeHtml(img.url) + '" ' +
            'style="width:56px; height:56px; object-fit:cover; border-radius:6px; cursor:pointer; opacity:' + opacity + '; border:' + border + '; transition:all 0.2s;" ' +
            'onclick="window.ImageViewer.currentIndex = ' + idx + '; window.ImageViewer.showImage(window.ImageViewer.galleryImages[' + idx + ']);" ' +
            'id="iv-thumb-' + idx + '" ' +
            'onerror="this.style.display=\'none\';">';
        });
        filmstrip.innerHTML = html;
        // Scroll selected thumbnail into view
        setTimeout(function() {
          var thumb = document.getElementById('iv-thumb-' + self.currentIndex);
          if (thumb) {
            var scrollLeft = thumb.offsetLeft - (filmstrip.clientWidth / 2) + (thumb.clientWidth / 2);
            filmstrip.scrollTo({ left: scrollLeft, behavior: 'smooth' });
          }
        }, 50);
      } else {
        filmstrip.style.display = 'none';
      }
    }

    this.updateZoom();
  },

  close() {
    if (!this.container) return;
    this.container.style.display = 'none';
    this.currentImg = null;
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    try {
      var canvasArea = document.getElementById('iv-canvas-area');
      var vidEl = canvasArea ? canvasArea.querySelector('video') : null;
      if (vidEl) {
        vidEl.pause();
        vidEl.remove();
        var imgEl = document.createElement('img');
        imgEl.id = 'iv-image';
        imgEl.src = '';
        imgEl.style.cssText = 'max-width: 90%; max-height: 90%; object-fit: contain; transition: transform 0.2s ease;';
        if (canvasArea) canvasArea.insertBefore(imgEl, canvasArea.querySelector('#iv-btn-prev').nextSibling);
      }
      var zi = document.getElementById('iv-btn-zoom-in');
      if (zi) zi.style.display = '';
      var zo = document.getElementById('iv-btn-zoom-out');
      if (zo) zo.style.display = '';
      var pp = document.getElementById('iv-btn-prev');
      if (pp) pp.style.display = '';
      var nn = document.getElementById('iv-btn-next');
      if (nn) nn.style.display = '';
    } catch(e) {
      console.warn('[ImageViewer] close error:', e);
    }
  },

  openAudio(imgObj) {
    if (!this.container) return;
    this.container.style.display = 'flex';
    try {
      var titleEl = document.getElementById('iv-title');
      if (titleEl) titleEl.innerText = imgObj.name || 'Audio';

      // Hide zoom controls (not relevant for audio)
      var zi = document.getElementById('iv-btn-zoom-in');
      if (zi) zi.style.display = 'none';
      var zo = document.getElementById('iv-btn-zoom-out');
      if (zo) zo.style.display = 'none';
      var pp = document.getElementById('iv-btn-prev');
      if (pp) pp.style.display = 'none';
      var nn = document.getElementById('iv-btn-next');
      if (nn) nn.style.display = 'none';

      var canvasArea = document.getElementById('iv-canvas-area');
      if (!canvasArea) return;

      // Hide the img element
      var imgEl = document.getElementById('iv-image');
      if (imgEl) imgEl.style.display = 'none';

      // Remove any existing video element
      var existingVid = canvasArea.querySelector('video');
      if (existingVid) existingVid.remove();

      // Remove any existing audio player wrapper
      var existingOap = canvasArea.querySelector('.oap-wrap');
      if (existingOap) existingOap.remove();

      // Create a container for the audio player
      var audioContainer = document.createElement('div');
      audioContainer.style.cssText = 'width:100%; max-width:500px; margin:0 auto; padding:20px;';
      canvasArea.appendChild(audioContainer);

      // Use the existing OrbitAudioPlayer to create the inline player
      if (window.OrbitAudioPlayer) {
        window.OrbitAudioPlayer.create(audioContainer, imgObj.url);
      } else {
        // Fallback: native audio element
        var fallbackAudio = document.createElement('audio');
        fallbackAudio.src = imgObj.url;
        fallbackAudio.controls = true;
        fallbackAudio.autoplay = true;
        fallbackAudio.style.cssText = 'width:100%; max-width:500px;';
        audioContainer.appendChild(fallbackAudio);
      }
    } catch(e) {
      console.warn('[ImageViewer] openAudio error:', e);
    }
  },

  openVideo(src, msgId) {
    if (!this.container) return;
    this.container.style.display = 'flex';
    try {
      var titleEl = document.getElementById('iv-title');
      if (titleEl) titleEl.innerText = 'Video';
      var zi = document.getElementById('iv-btn-zoom-in');
      if (zi) zi.style.display = 'none';
      var zo = document.getElementById('iv-btn-zoom-out');
      if (zo) zo.style.display = 'none';
      var pp = document.getElementById('iv-btn-prev');
      if (pp) pp.style.display = 'none';
      var nn = document.getElementById('iv-btn-next');
      if (nn) nn.style.display = 'none';
      var canvasArea = document.getElementById('iv-canvas-area');
      if (!canvasArea) return;
      var imgEl = document.getElementById('iv-image');
      if (imgEl) imgEl.style.display = 'none';
      var existingVid = canvasArea.querySelector('video');
      if (existingVid) existingVid.remove();
      var vid = document.createElement('video');
      vid.src = src;
      vid.controls = true;
      vid.autoplay = true;
      vid.style.cssText = 'max-width: 90%; max-height: 90%; border-radius: 8px;';
      canvasArea.insertBefore(vid, canvasArea.querySelector('#iv-btn-prev').nextSibling);
    } catch(e) {
      console.warn('[ImageViewer] openVideo error:', e);
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { window.ImageViewer.init(); });
} else {
  window.ImageViewer.init();
}
