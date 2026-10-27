const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('orbitAPI', {
  // Electron 32 REMOVED File.path. Anything reading it now gets undefined, and a
  // filename with no directory is not something the transfer can open — which is
  // why attaching a file silently produced nothing. webUtils.getPathForFile is the
  // documented replacement, and it has to be called here in the renderer via the
  // preload rather than from the main process.
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch (e) {
      return '';
    }
  },
  send:     (channel, data)   => ipcRenderer.send(channel, data),
  sendSync: (channel, ...args)=> ipcRenderer.sendSync(channel, ...args),
  on:       (channel, cb)     => ipcRenderer.on(channel, (e, data) => cb(data)),
  invoke:   (channel, data)   => ipcRenderer.invoke(channel, data),
  log:      (...args)         => ipcRenderer.send('log', ...args),
  platform: process.platform,
  // CPU arch, so the update check hands an Intel Mac the x64 build rather than
  // the arm64 one (both .dmg files exist on every release).
  arch: process.arch,
  // Legacy field: process.env.npm_package_version is only set when the app is
  // launched through an npm script, so in a packaged build this silently falls
  // back to a hardcoded string. getAppVersion() below is the real source.
  version:  process.env.npm_package_version ?? '0.1.2-beta',
  // Authoritative version from app.getVersion() in the main process. Lazy on
  // purpose: the IPC handler is registered just after loadFile(), so calling it
  // during preload could race it. Everything calls it post-boot.
  getAppVersion: () => ipcRenderer.sendSync('app-version'),
  // Opens an https GitHub URL in the user's browser. Returns true if the main
  // process accepted it — every other scheme/host is rejected there.
  openExternal: (url) => ipcRenderer.sendSync('open-external', url),
  // Fetches a GitHub URL from the main process (the renderer's CSP blocks
  // direct calls). Resolves to { ok, status, body, error? }.
  updateFetch: (url) => ipcRenderer.invoke('update-fetch', url),
  // Downloads a release asset into ~/Downloads/Orbit Updates and verifies it
  // against the release's SHA256SUMS.txt. Resolves to
  // { ok, path, name, size, sha256, verified } or { ok:false, error|cancelled }.
  downloadUpdate: (payload) => ipcRenderer.invoke('update-download', payload),
  cancelUpdateDownload: () => ipcRenderer.send('update-download-cancel'),
  // Progress events while a download runs. Returns an unsubscribe function.
  onUpdateDownloadProgress: (cb) => {
    const handler = (e, data) => cb(data);
    ipcRenderer.on('update-download-progress', handler);
    return () => ipcRenderer.removeListener('update-download-progress', handler);
  },
  // Only files downloaded by the main process are accepted by these.
  openDownloadedFile: (file) => ipcRenderer.invoke('update-open-file', file),
  revealDownloadedFile: (file) => ipcRenderer.invoke('update-reveal-file', file),
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  
  // Storage & SysInfo
  storeGet: (key) => ipcRenderer.sendSync('store-get', key),
  storeSet: (key, val) => ipcRenderer.sendSync('store-set', key, val),
  storeDelete: (key) => ipcRenderer.sendSync('store-delete', key),
  getHostname: () => ipcRenderer.sendSync('get-hostname'),
  getUuid: () => ipcRenderer.sendSync('get-uuid'),
  getLocalIPv4s: () => ipcRenderer.invoke('get-local-ips'),
  
  // Networking
  networkStart: (identity, reconnectEnabled, reconnectIntervalMs) => ipcRenderer.sendSync('network-start', identity, reconnectEnabled, reconnectIntervalMs),
  networkStop: () => ipcRenderer.send('network-stop'),
  networkSend: (toPeerId, toIp, type, payload) => ipcRenderer.sendSync('network-send', toPeerId, toIp, type, payload),
  broadcastBeacon: (identity) => ipcRenderer.send('broadcast-beacon', identity),
  networkSendFile: (toPeerId, toIp, filePath, fileName) => ipcRenderer.invoke('network-send-file', toPeerId, toIp, filePath, fileName),
  connect: (ip, port) => ipcRenderer.send('network-connect', ip, port || 46000),
  cancelTransfer: (fileId) => ipcRenderer.send('cancel-transfer', fileId),
  checkDiskSpace: () => ipcRenderer.invoke('check-disk-space'),
  networkSetReconnect: (enabled, intervalMs) => ipcRenderer.sendSync('network-set-reconnect', enabled, intervalMs),

  // ── WAN routing (v1.0.0 Part 1) ──────────────────────────────────────────
  // ⚠ These are NEW METHODS, not a wrapper around the existing ones. `window.orbitAPI` is
  // frozen and its window property is non-writable, so the send funnel cannot be patched
  // from the renderer — main has to learn which peers have a live WebRTC channel and fall
  // back to it when TCP has no route. See the note on 'network-send' in main.js.
  wanRegister: (peerId) => ipcRenderer.send('wan-register', peerId),
  wanUnregister: (peerId) => ipcRenderer.send('wan-unregister', peerId),
  // Main hands a packet back when TCP had no route but a WAN channel exists.
  onWanSend: (cb) => ipcRenderer.on('wan-send', (event, peerId, type, payload) => cb(peerId, type, payload)),

  // OS Integration
  showNotification: (title, body, icon) => ipcRenderer.send('show-notification', title, body, icon),
  toggleDevtools: () => ipcRenderer.send('toggle-devtools'),
  writeClipboard: (text) => ipcRenderer.sendSync('write-clipboard', text),

  // E2EE
  // e2eeEncrypt resolves to { v:2, ciphertext, nonce } for a unified peer or
  // { v:1, packed } for a legacy peer — never a bare string.
  e2eeGetPublicKey: () => ipcRenderer.sendSync('e2ee-get-public-key'),
  e2eeEncrypt: (plaintext, peerPublicKey) => ipcRenderer.sendSync('e2ee-encrypt', plaintext, peerPublicKey),
  e2eeDecrypt: (ciphertext, peerPublicKey) => ipcRenderer.sendSync('e2ee-decrypt', ciphertext, peerPublicKey),
  e2eeDecryptV2: (ciphertext, nonce, peerPublicKey) => ipcRenderer.sendSync('e2ee-decrypt-v2', ciphertext, nonce, peerPublicKey),

  // Account Switcher
  dbGetAllUsers: () => ipcRenderer.sendSync('db-get-all-users'),
  dbDeleteUser: (userId) => ipcRenderer.sendSync('db-delete-user', userId),
  relaunchApp: () => ipcRenderer.send('relaunch-app'),

  // PIN / 2FA
  pinVerify: (pin) => ipcRenderer.sendSync('pin-verify', pin),
  pinSet: (pin) => ipcRenderer.sendSync('pin-set', pin),
  pinDisable: (currentPin) => ipcRenderer.sendSync('pin-disable', currentPin),
  pinStatus: () => ipcRenderer.sendSync('pin-status'),
  pinForgot: () => ipcRenderer.send('pin-forgot'),

  // Database
  dbGetAllStartupData: (userId) => ipcRenderer.sendSync('db-get-all-startup-data', userId),
  dbGetLocalUser: () => ipcRenderer.sendSync('db-get-local-user'),
  dbGetUser: (userId) => ipcRenderer.sendSync('db-get-user', userId),
  dbSaveUser: (user) => ipcRenderer.sendSync('db-save-user', user),
  dbGetFriends: () => ipcRenderer.sendSync('db-get-friends'),
  dbSaveFriend: (friend) => ipcRenderer.sendSync('db-save-friend', friend),
  dbGetMessages: (chatId) => ipcRenderer.sendSync('db-get-messages', chatId),
  dbAllMessagesRaw: () => ipcRenderer.sendSync('db-all-messages-raw'),
  dbSearchMessages: (query, options) => ipcRenderer.sendSync('db-search-messages', query, options),
  dbAddMessage: (chatId, msg) => ipcRenderer.sendSync('db-add-message', chatId, msg),
  dbDeleteMessage: (chatId, msgId) => ipcRenderer.sendSync('db-delete-message', chatId, msgId),
  dbEditMessage: (chatId, msgId, newText) => ipcRenderer.sendSync('db-edit-message', chatId, msgId, newText),
  dbSaveAttachment: (msgId, attachment) => ipcRenderer.sendSync('db-save-attachment', msgId, attachment),
  dbGetAttachment: (attachmentId) => ipcRenderer.sendSync('db-get-attachment', attachmentId),
  dbDeleteAttachment: (attachmentId) => ipcRenderer.sendSync('db-delete-attachment', attachmentId),
  dbClearAttachments: () => ipcRenderer.sendSync('db-clear-attachments'),
  dbGetSetting: (key, def) => ipcRenderer.sendSync('db-get-setting', key, def),
  dbSetSetting: (key, val) => ipcRenderer.sendSync('db-set-setting', key, val),
  dbHealthCheck: () => ipcRenderer.sendSync('db-health-check'),
  dbRepair: () => ipcRenderer.sendSync('db-repair'),
  dbCheckAttachmentIntegrity: () => ipcRenderer.sendSync('db-check-attachment-integrity'),
  backupCreate: (format) => ipcRenderer.invoke('backup-create', format),
  backupRestore: () => ipcRenderer.invoke('backup-restore'),
  backupValidate: (filePath) => ipcRenderer.invoke('backup-validate', filePath),
  // The backup package WITHOUT writing it to disk — used by the account
  // transfer, which sends it over the socket instead of to a file.
  accountBundle: () => ipcRenderer.invoke('account-bundle'),

  // Groups
  dbGetGroups: () => ipcRenderer.sendSync('db-get-groups'),
  dbGetGroup: (groupId) => ipcRenderer.sendSync('db-get-group', groupId),
  dbSaveGroup: (group) => ipcRenderer.sendSync('db-save-group', group),
  dbAddGroupMember: (groupId, user) => ipcRenderer.sendSync('db-add-group-member', groupId, user),
  dbRemoveGroupMember: (groupId, userId) => ipcRenderer.sendSync('db-remove-group-member', groupId, userId),
  dbGetGroupMembers: (groupId) => ipcRenderer.sendSync('db-get-group-members', groupId),
  dbSetMemberRole: (groupId, userId, role) => ipcRenderer.sendSync('db-set-member-role', groupId, userId, role),
  dbDeleteGroup: (groupId) => ipcRenderer.sendSync('db-delete-group', groupId),
  dbDeleteFriend: (userId) => ipcRenderer.sendSync('db-delete-friend', userId),
  dbUpdateGroupField: (groupId, field, value) => ipcRenderer.sendSync('db-update-group-field', groupId, field, value),
  dbGetGroupByInvite: (code) => ipcRenderer.sendSync('db-get-group-by-invite', code),
  saveAvatar: (groupId, base64Data) => ipcRenderer.invoke('save-avatar', groupId, base64Data),

  // Read State
  dbGetReadState: (chatId) => ipcRenderer.sendSync('db-get-read-state', chatId),
  dbSetReadState: (chatId, lastReadMsgId) => ipcRenderer.sendSync('db-set-read-state', chatId, lastReadMsgId),
  dbAddMention: (chatId, msgId, senderId) => ipcRenderer.sendSync('db-add-mention', chatId, msgId, senderId),
  dbGetMentions: (chatId) => ipcRenderer.sendSync('db-get-mentions', chatId),
  dbClearMentions: (chatId) => ipcRenderer.sendSync('db-clear-mentions', chatId)
});
