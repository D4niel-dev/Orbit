// src/js/components/toast.js

window.Toast = {
  init() {
    // ⚠⚠ INIT RUNS MORE THAN ONCE, AND THIS USED TO MINT A SECOND CONTAINER WITH THE
    // SAME ID. Measured: two `#toast-container` elements in the DOM, `getElementById`
    // returning the FIRST (empty) one while `Toast.container` pointed at the second.
    // So the toasts worked and anything that read the DOM to confirm feedback saw
    // nothing — which is how it fooled me twice before I counted the containers.
    var existing = document.getElementById('toast-container');
    if (existing) { this.container = existing; return; }

    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = 'position:fixed;bottom:96px;right:24px;display:flex;flex-direction:column;gap:12px;z-index:9999;pointer-events:none;'  // 96px clears the composer: at 24px the stack sat over the send button, and the close button swallowed the click;
    document.body.appendChild(this.container);
  },

  show(title, message, typeOrAvatar = null, duration = 5000) {
    if (!this.container) return;

    var avatarUrl = null;
    var icon = 'bell';
    if (typeOrAvatar && typeof typeOrAvatar === 'string') {
      if (typeOrAvatar.startsWith('http') || typeOrAvatar.startsWith('data:')) {
        avatarUrl = typeOrAvatar;
      } else {
        var icons = { info: 'info', success: 'check-circle', warning: 'alert-triangle', error: 'alert-circle' };
        icon = icons[typeOrAvatar] || 'bell';
      }
    }

    var toast = document.createElement('div');
    toast.style.cssText = 'background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:12px;box-shadow:var(--shadow-xl);padding:16px;display:flex;align-items:center;gap:16px;min-width:300px;max-width:400px;pointer-events:auto;transform:translateX(120%);transition:transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;opacity:0;';

    var avatarHtml = avatarUrl
      ? '<img src="' + window.Sanitize.escapeHtml(avatarUrl) + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">'
      : '<div style="width:40px;height:40px;border-radius:50%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);"><i data-lucide="' + icon + '" style="width:20px;"></i></div>';

    var escapedTitle = window.Sanitize.escapeHtml(title);
    var escapedMessage = window.Sanitize.escapeHtml(message);
    if (escapedMessage.length > 60) escapedMessage = escapedMessage.substring(0, 60) + '...';

    toast.innerHTML =
      avatarHtml +
      '<div style="flex:1;">' +
        '<div style="font-weight:600;font-size:14px;color:var(--text-primary);margin-bottom:4px;">' + escapedTitle + '</div>' +
        '<div style="font-size:13px;color:var(--text-secondary);line-height:1.4;">' + escapedMessage + '</div>' +
      '</div>' +
      '<button class="toast-close" style="color:var(--text-muted);padding:4px;"><i data-lucide="x" style="width:16px;"></i></button>';

    this.container.appendChild(toast);
    lucide.createIcons({ root: toast });

    // Animate in
    requestAnimationFrame(function() {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    var isDismissed = false;
    var dismiss = function() {
      if (isDismissed) return;
      isDismissed = true;
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      setTimeout(function() {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    
    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  }
};
