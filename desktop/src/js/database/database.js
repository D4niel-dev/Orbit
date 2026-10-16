const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const migrations = require('./migrations');
const Store = require('electron-store'); 
const dlog = require('../log');

class OrbitDatabase {
  constructor(userDataPath) {
    this.dbPath = path.join(userDataPath, 'orbit.db');
    this.userDataPath = userDataPath;
    this.tempDirPath = path.join(userDataPath, 'temp');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    // Run migrations
    migrations.run(this.db);
    
    // Initialize prepared statements
    this.initStatements();
    
    // Check if we need to migrate from electron-store
    this.migrateFromElectronStore();
    // Force re-migrate avatars since they were dropped in v1
    this.migrateFromElectronStore(true);

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDirPath)) {
      try { fs.mkdirSync(this.tempDirPath, { recursive: true }); } catch(e) {}
    }
  }

  initStatements() {
    this.stmts = {
      // Users
      getUser: this.db.prepare('SELECT * FROM users WHERE userId = ?'),
      getLocalUser: this.db.prepare('SELECT * FROM users LIMIT 1'),
      getAllUsers: this.db.prepare('SELECT * FROM users ORDER BY username'),
      deleteUser: this.db.prepare('DELETE FROM users WHERE userId = ?'),
      saveUser: this.db.prepare('INSERT OR REPLACE INTO users (userId, username, usertag, status, avatar, banner, bio, profileFrame) VALUES (@userId, @username, @usertag, @status, @avatar, @banner, @bio, @profileFrame)'),
      
      // Friends
      getFriends: this.db.prepare('SELECT * FROM friends'),
      saveFriend: this.db.prepare('INSERT OR REPLACE INTO friends (userId, username, usertag, status, avatar, bio, accountOwnerId) VALUES (@userId, @username, @usertag, @status, @avatar, @bio, @accountOwnerId)'),
      deleteFriend: this.db.prepare('DELETE FROM friends WHERE userId = ?'),
      
      // Messages
      getMessages: this.db.prepare('SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp ASC'),
      getAllMessagesRaw: this.db.prepare('SELECT * FROM messages'),
      addMessage: this.db.prepare('INSERT INTO messages (id, chatId, sender, text, timestamp, replyTo, call) VALUES (@id, @chatId, @sender, @text, @timestamp, @replyTo, @call)'),
      editMessage: this.db.prepare('UPDATE messages SET text = ? WHERE id = ? AND chatId = ?'),
      deleteMessage: this.db.prepare('DELETE FROM messages WHERE id = ? AND chatId = ?'),
      
      // Attachments
      saveAttachment: this.db.prepare('INSERT OR REPLACE INTO attachments (id, messageId, type, name, size, data, hash, localPath) VALUES (@id, @messageId, @type, @name, @size, @data, @hash, @localPath)'),
      getAttachmentsForMessage: this.db.prepare('SELECT id, type, name, size, localPath FROM attachments WHERE messageId = ?'),
      getAttachmentData: this.db.prepare('SELECT type, name, data, localPath FROM attachments WHERE id = ?'),
      getAttachmentThumbnail: this.db.prepare('SELECT type, name, thumbnail, localPath FROM attachments WHERE id = ?'),
      deleteAttachment: this.db.prepare('DELETE FROM attachments WHERE id = ?'),
      
      // Groups
      getGroups: this.db.prepare('SELECT g.*, COUNT(gm.userId) as memberCount FROM groups g LEFT JOIN group_members gm ON g.groupId = gm.groupId GROUP BY g.groupId ORDER BY g.pinned DESC, g.createdAt DESC'),
      getGroup: this.db.prepare('SELECT * FROM groups WHERE groupId = ?'),
      // ⚠ `avatarDataUrl` BELONGS IN THIS LIST. It was missing, and this is
      // `INSERT OR REPLACE` — so the column was never written when a group was
      // created from the "new group" modal (which sets the avatar as a data URL
      // and nothing else), and any value already there was reset to NULL on the
      // next save. The avatar showed for the rest of the session, because the
      // in-memory group object still had it, and was gone after a restart.
      // Reproduced: create a group with an image, restart, `avatarDataUrl` MISSING.
      saveGroup: this.db.prepare('INSERT OR REPLACE INTO groups (groupId, groupName, ownerId, createdAt, avatarPath, avatarDataUrl, description, pinned, notificationMuted, inviteCode, avatarUpdatedAt, accountOwnerId) VALUES (@groupId, @groupName, @ownerId, @createdAt, @avatarPath, @avatarDataUrl, @description, @pinned, @notificationMuted, @inviteCode, @avatarUpdatedAt, @accountOwnerId)'),
      deleteGroup: this.db.prepare('DELETE FROM groups WHERE groupId = ?'),
      // no updateGroupField prepared statement — uses dynamic sql via method
      getGroupByInviteCode: this.db.prepare('SELECT * FROM groups WHERE inviteCode = ?'),
      addGroupMember: this.db.prepare('INSERT OR REPLACE INTO group_members (groupId, userId, username, usertag, status, avatar, ip, joinedAt, role, accountOwnerId) VALUES (@groupId, @userId, @username, @usertag, @status, @avatar, @ip, @joinedAt, @role, @accountOwnerId)'),
      removeGroupMember: this.db.prepare('DELETE FROM group_members WHERE groupId = ? AND userId = ?'),
      getGroupMembers: this.db.prepare('SELECT * FROM group_members WHERE groupId = ?'),
      setMemberRole: this.db.prepare('UPDATE group_members SET role = ? WHERE groupId = ? AND userId = ?'),
      
      // Settings
      getSetting: this.db.prepare('SELECT value FROM settings WHERE key = ?'),
      setSetting: this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)'),

      // Read state
      getReadState: this.db.prepare('SELECT * FROM read_state WHERE chatId = ?'),
      getAllReadStates: this.db.prepare('SELECT * FROM read_state'),
      setReadState: this.db.prepare('INSERT OR REPLACE INTO read_state (chatId, lastReadMsgId, lastReadTimestamp) VALUES (@chatId, @lastReadMsgId, @lastReadTimestamp)'),

      // Mentions
      addMention: this.db.prepare('INSERT INTO mentions (chatId, msgId, senderId, timestamp) VALUES (@chatId, @msgId, @senderId, @timestamp)'),
      getMentions: this.db.prepare('SELECT * FROM mentions WHERE chatId = ? ORDER BY id'),
      clearMentions: this.db.prepare('DELETE FROM mentions WHERE chatId = ?'),
      clearAllMentions: this.db.prepare('DELETE FROM mentions')
    };
  }

  // --- Users ---
  getUser(userId) {
    const user = this.stmts.getUser.get(userId);
    if (!user) return null;
    return this.parseUser(user);
  }
  
  getLocalUser() {
    const user = this.stmts.getLocalUser.get();
    if (!user) return null;
    return this.parseUser(user);
  }

  getAllUsers() {
    const rows = this.stmts.getAllUsers.all();
    return rows.map(r => this.parseUser(r));
  }

  deleteUser(userId) {
    this.stmts.deleteUser.run(userId);
  }
  
  saveUser(user) {
    this.stmts.saveUser.run({
      userId: user.id || user.userId,
      username: user.username,
      usertag: user.usertag,
      status: user.status,
      avatar: (user.avatar instanceof Buffer || typeof user.avatar === 'string') ? user.avatar : null,
      banner: (user.banner instanceof Buffer || typeof user.banner === 'string') ? user.banner : null,
      bio: user.bio || '',
      profileFrame: user.profileFrame != null ? user.profileFrame : 0
    });
  }

  parseUser(row) {
    return {
       ...row,
       // We can return base64 strings if needed, but for now we just return the raw object
    };
  }

  // --- Friends ---
  getFriends() {
    return this.stmts.getFriends.all().map(f => {
      // Clean up buffers if needed or keep as is. Usually frontend doesn't need huge buffers in friends list unless it's base64 encoded.
      // For simplicity, we just return the row. If avatar is buffer, we might want to skip it or provide a URL.
      // Let's assume for now we don't have large buffers in friends yet.
      return f;
    });
  }

  saveFriend(friend) {
    this.stmts.saveFriend.run({
      userId: friend.userId,
      username: friend.username,
      usertag: friend.usertag,
      status: friend.status,
      avatar: (friend.avatar instanceof Buffer || typeof friend.avatar === 'string') ? friend.avatar : null,
      bio: friend.bio || '',
      accountOwnerId: friend.accountOwnerId || friend.ownerId || null
    });
  }

  deleteFriend(userId) {
    this.stmts.deleteFriend.run(userId);
  }

  deleteGroup(groupId) {
    this.stmts.deleteGroup.run(groupId);
  }

  // --- Groups ---
  getGroups() {
    return this.stmts.getGroups.all().map(g => {
      g.members = this.stmts.getGroupMembers.all(g.groupId);
      return g;
    });
  }

  getGroup(groupId) {
    const group = this.stmts.getGroup.get(groupId);
    if (!group) return null;
    group.members = this.stmts.getGroupMembers.all(groupId);
    return group;
  }

  saveGroup(group) {
    this.stmts.saveGroup.run({
      groupId: group.groupId,
      groupName: group.groupName,
      ownerId: group.ownerId,
      createdAt: group.createdAt || new Date().toISOString(),
      avatarPath: group.avatarPath || null,
      avatarDataUrl: group.avatarDataUrl || null,
      description: group.description || '',
      pinned: group.pinned ? 1 : 0,
      notificationMuted: group.notificationMuted ? 1 : 0,
      inviteCode: group.inviteCode || null,
      avatarUpdatedAt: group.avatarUpdatedAt || 0,
      accountOwnerId: group.accountOwnerId || group.ownerId || null
    });
    if (group.members && Array.isArray(group.members)) {
      group.members.forEach(m => this.addGroupMember(group.groupId, m));
    }
  }

  updateGroupField(groupId, field, value) {
    var allowed = ['groupName', 'avatar', 'avatarDataUrl', 'avatarPath', 'avatarUpdatedAt', 'description', 'inviteCode', 'ownerId', 'pinned', 'notificationMuted', 'pinnedMessages'];
    if (allowed.indexOf(field) === -1) throw new Error('Invalid field: ' + field);
    this.db.prepare(`UPDATE groups SET ${field} = ? WHERE groupId = ?`).run(value, groupId);
  }

  getGroupByInviteCode(code) {
    const group = this.stmts.getGroupByInviteCode.get(code);
    if (!group) return null;
    group.members = this.stmts.getGroupMembers.all(group.groupId);
    return group;
  }

  addGroupMember(groupId, user) {
    this.stmts.addGroupMember.run({
      groupId: groupId,
      userId: user.userId,
      username: user.username,
      usertag: user.usertag || '',
      status: user.status || 'online',
      avatar: user.avatar || null,
      ip: user.ip || null,
      joinedAt: user.joinedAt || new Date().toISOString(),
      role: user.role || 'member',
      accountOwnerId: user.accountOwnerId || null
    });
  }

  removeGroupMember(groupId, userId) {
    this.stmts.removeGroupMember.run(groupId, userId);
  }

  getGroupMembers(groupId) {
    return this.stmts.getGroupMembers.all(groupId);
  }

  setMemberRole(groupId, userId, role) {
    this.stmts.setMemberRole.run(role, groupId, userId);
  }

  // --- Read State ---
  getReadState(chatId) {
    return this.stmts.getReadState.get(chatId) || null;
  }

  getAllReadStates() {
    const rows = this.stmts.getAllReadStates.all();
    const map = {};
    for (const row of rows) {
      map[row.chatId] = { lastReadMsgId: row.lastReadMsgId, lastReadTimestamp: row.lastReadTimestamp };
    }
    return map;
  }

  getAllStartupData(userId) {
    return this.db.transaction(() => {
      var friends = this.getFriends();
      var groups = this.getGroups();
      var messages = this.getRecentMessagesByChat(50);

      if (userId) {
        // Filter messages per-account using per-user chat ID tracking
        var userChatIds = this.getSetting('userChatIds', {})[userId];
        if (userChatIds && Array.isArray(userChatIds) && userChatIds.length > 0) {
          var validSet = {};
          userChatIds.forEach(function(id) { validSet[id] = true; });
          var filteredMessages = {};
          Object.keys(messages).forEach(function(chatId) {
            if (validSet[chatId]) filteredMessages[chatId] = messages[chatId];
          });
          messages = filteredMessages;
        } else {
          // No chat IDs tracked for this user yet — show nothing
          messages = {};
        }
      }

      return {
        settings: this.getSetting('settings', {}),
        networkSettings: this.getSetting('networkSettings', {}),
        friends: friends,
        messages: messages,
        groups: groups,
        uiState: this.getSetting('uiState', { activeTab: 'dms', activeChatId: 'local-echo' }),
        mutedChats: this.getSetting('mutedChats', {}),
        readStates: this.getAllReadStates(),
        blockedUsers: this.getSetting('blockedUsers', [])
      };
    })();
  }

  setReadState(chatId, lastReadMsgId) {
    this.stmts.setReadState.run({
      chatId: chatId,
      lastReadMsgId: lastReadMsgId,
      lastReadTimestamp: new Date().toISOString()
    });
  }

  addMention(chatId, msgId, senderId) {
    this.stmts.addMention.run({
      chatId: chatId,
      msgId: msgId,
      senderId: senderId,
      timestamp: new Date().toISOString()
    });
  }

  getMentions(chatId) {
    return this.stmts.getMentions.all(chatId);
  }

  clearMentions(chatId) {
    this.stmts.clearMentions.run(chatId);
  }

  clearAllMentions() {
    this.stmts.clearAllMentions.run();
  }
  
  // --- Messages ---
  getMessages(chatId) {
    const msgs = this.stmts.getMessages.all(chatId);
    return msgs.map(m => {
      const atts = this.stmts.getAttachmentsForMessage.all(m.id);
      const attachments = atts.map(a => ({
        id: a.id,
        type: a.type,
        name: a.name,
        size: a.size,
        url: a.localPath ? `orbit-file://${encodeURIComponent(a.localPath)}` : `orbit-db://attachment/${a.id}`
      }));
      
      var callObj;
      if (m.call) { try { callObj = JSON.parse(m.call); } catch (e) { callObj = undefined; } }

      return {
        id: m.id,
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp,
        replyTo: m.replyTo != null ? m.replyTo : undefined,
        call: callObj,
        attachments: attachments.length > 0 ? attachments : undefined
      };
    });
  }

  getAllMessagesRaw() {
    const rawMsgs = this.stmts.getAllMessagesRaw.all();
    const result = {};
    rawMsgs.forEach(m => {
      if (!result[m.chatId]) result[m.chatId] = [];
      const atts = this.stmts.getAttachmentsForMessage.all(m.id);
      const attachments = atts.map(a => ({
        id: a.id,
        type: a.type,
        name: a.name,
        size: a.size,
        url: a.localPath ? `orbit-file://${encodeURIComponent(a.localPath)}` : `orbit-db://attachment/${a.id}`
      }));
      
      result[m.chatId].push({
        id: m.id,
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp,
        replyTo: m.replyTo != null ? m.replyTo : undefined,
        attachments: attachments.length > 0 ? attachments : undefined
      });
    });
    return result;
  }

  getRecentMessagesByChat(limit) {
    if (limit == null) limit = 50;
    const stmt = this.db.prepare('SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY chatId ORDER BY timestamp DESC) as rn FROM messages) WHERE rn <= ?');
    const rawMsgs = stmt.all(limit);
    const result = {};
    rawMsgs.forEach(m => {
      if (!result[m.chatId]) result[m.chatId] = [];
      const atts = this.stmts.getAttachmentsForMessage.all(m.id);
      const attachments = atts.map(a => ({
        id: a.id,
        type: a.type,
        name: a.name,
        size: a.size,
        url: a.localPath ? `orbit-file://${encodeURIComponent(a.localPath)}` : `orbit-db://attachment/${a.id}`
      }));
      
      result[m.chatId].push({
        id: m.id,
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp,
        replyTo: m.replyTo != null ? m.replyTo : undefined,
        attachments: attachments.length > 0 ? attachments : undefined
      });
    });
    return result;
  }

  addMessage(chatId, msg) {
    const pendingThumbnails = [];

    this.db.transaction(() => {
      try {
        this.stmts.addMessage.run({
          id: msg.id.toString(),
          chatId: chatId,
          sender: msg.sender,
          text: msg.text || '',
          timestamp: msg.timestamp || new Date().toISOString(),
          replyTo: msg.replyTo != null ? String(msg.replyTo) : null,
          // Call history rides as JSON — a finished call is a message with a `call`
          // object and no text, so without this it persisted as a blank line.
          call: msg.call ? JSON.stringify(msg.call) : null
        });
      } catch (e) {
        if (e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e;
      }
      
      if (msg.attachments && msg.attachments.length > 0) {
        const settings = this.getSetting('settings', {});
        const isPrivacyMode = settings.privacyMode === true;

        msg.attachments.forEach(att => {
          const attId = att.id || require('crypto').randomUUID();
          
          let bufferData = Buffer.alloc(0);
          let localPath = att.localPath || null;

          if (isPrivacyMode) {
            if (att.path && fs.existsSync(att.path)) {
              localPath = path.join(this.tempDirPath || require('os').tmpdir(), 'orbit_att_' + attId + '_' + (att.name || 'file'));
              try {
                const dir = path.dirname(localPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.copyFileSync(att.path, localPath);
              } catch(e) {
                console.error('Failed to copy attachment to temp dir:', e.message);
                localPath = null;
              }
            } else if (att.data) {
              localPath = path.join(this.tempDirPath || require('os').tmpdir(), 'orbit_att_' + attId + '_' + (att.name || 'file'));
              try {
                const dir = path.dirname(localPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(localPath, att.data);
              } catch(e) {
                console.error('Failed to write attachment to temp dir:', e.message);
                localPath = null;
              }
            } else if (att.url && att.url.startsWith('data:')) {
              const commaIdx = att.url.indexOf(';base64,');
              if (commaIdx > -1) {
                try {
                  const base64Data = att.url.substring(commaIdx + 8);
                  const decoded = Buffer.from(base64Data, 'base64');
                  if (decoded.length > 0) {
                    localPath = path.join(this.tempDirPath || require('os').tmpdir(), 'orbit_att_' + attId + '_' + (att.name || 'file'));
                    const dir = path.dirname(localPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(localPath, decoded);
                  }
                } catch(e) {
                  console.error('Failed to write data URL attachment to temp dir:', e.message);
                  localPath = null;
                }
              }
            }
          } else {
            if (att.data) {
              if (Buffer.isBuffer(att.data) && att.data.length > 0) {
                bufferData = att.data;
              } else if (att.data instanceof ArrayBuffer && att.data.byteLength > 0) {
                bufferData = Buffer.from(att.data);
              } else if (typeof att.data === 'object' && att.data !== null && typeof att.data.length === 'number' && att.data.length > 0) {
                try { bufferData = Buffer.from(att.data); } catch(e) { /* ignore */ }
              }
            }
            if (bufferData.length === 0 && att.path && fs.existsSync(att.path)) {
               try {
                 bufferData = fs.readFileSync(att.path);
               } catch(e) {
                 console.error('Failed to read attachment from path ' + att.path + ':', e.message);
               }
            }
            if (bufferData.length === 0 && att.url && att.url.startsWith('data:')) {
              try {
                const commaIdx = att.url.indexOf(';base64,');
                if (commaIdx > -1) {
                  const base64Str = att.url.substring(commaIdx + 8);
                  bufferData = Buffer.from(base64Str, 'base64');
                  if (bufferData.length === 0) {
                    console.warn('Decoded data URL is empty for attachment ' + attId + ' (name=' + att.name + ', url length=' + att.url.length + ')');
                  }
                } else {
                  const rawIdx = att.url.indexOf(',');
                  if (rawIdx > -1) {
                    bufferData = Buffer.from(decodeURIComponent(att.url.substring(rawIdx + 1)), 'binary');
                  }
                }
              } catch(e) {
                console.error('Failed to decode data URL for attachment ' + attId + ' (name=' + att.name + ', url length=' + (att.url ? att.url.length : 0) + '):', e.message);
              }
            }
          }

          // Skip saving if no data source was found (would create a broken attachment)
          if (bufferData.length === 0 && !localPath) {
            console.warn('Skipping attachment "' + att.name + '" (id=' + attId + '): no data available');
            return;
          }

          try {
            this.stmts.saveAttachment.run({
              id: attId,
              messageId: msg.id.toString(),
              type: att.type,
              name: att.name,
              size: att.size || bufferData.length,
              data: bufferData,
              hash: att.hash || null,
              localPath: localPath
            });
          } catch(e) {
             if (e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e;
          }

          if (att.type === 'image') {
            if (isPrivacyMode && localPath && fs.existsSync(localPath)) {
              pendingThumbnails.push({ filePath: localPath, attId: attId });
            } else if (bufferData && bufferData.length > 0) {
              pendingThumbnails.push({ bufferData, attId });
            }
          }
        });
      }
    })();

    // Generate thumbnails AFTER the transaction commits (sharp native
    // binary may not be installed, and we must not let it roll back saves).
    for (const job of pendingThumbnails) {
      if (job.bufferData) {
        this._generateThumbnail(job.bufferData, job.attId);
      } else if (job.filePath) {
        this._generateThumbnailFromFile(job.filePath, job.attId);
      }
    }
  }

  _generateThumbnail(bufferData, attId) {
    try {
      const sharp = require('sharp');
      sharp(bufferData)
        .resize(200, 200, { fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer()
        .then(thumbBuffer => {
          this.db.prepare('UPDATE attachments SET thumbnail = ? WHERE id = ?').run(thumbBuffer, attId);
        })
        .catch(err => console.error('Failed to generate thumbnail for ' + attId, err));
    } catch(e) {
      console.error('Thumbnail generation unavailable (sharp not installed):', e.message);
    }
  }

  _generateThumbnailFromFile(filePath, attId) {
    try {
      const sharp = require('sharp');
      sharp(filePath)
        .resize(200, 200, { fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer()
        .then(thumbBuffer => {
          this.db.prepare('UPDATE attachments SET thumbnail = ? WHERE id = ?').run(thumbBuffer, attId);
        })
        .catch(err => console.error('Failed to generate thumbnail from file for ' + attId, err));
    } catch(e) {
      console.error('Thumbnail generation from file unavailable (sharp not installed):', e.message);
    }
  }
  
  deleteMessage(chatId, msgId) {
    // Attachments will be deleted automatically due to ON DELETE CASCADE
    this.stmts.deleteMessage.run(msgId.toString(), chatId);
  }

  editMessage(chatId, msgId, newText) {
    this.stmts.editMessage.run(newText, msgId.toString(), chatId);
  }

  // --- Attachments ---
  saveAttachment(msgId, attachment) {
    const attId = attachment.id || require('crypto').randomUUID();
    
    let bufferData = Buffer.alloc(0);
    let localPath = attachment.localPath || null;
    const settings = this.getSetting('settings', {});
    const isPrivacyMode = settings.privacyMode === true;
    
    if (!isPrivacyMode) {
      if (attachment.data) {
        if (Buffer.isBuffer(attachment.data) && attachment.data.length > 0) {
          bufferData = attachment.data;
        } else if (attachment.data instanceof ArrayBuffer && attachment.data.byteLength > 0) {
          bufferData = Buffer.from(attachment.data);
        } else if (typeof attachment.data === 'object' && attachment.data !== null && typeof attachment.data.length === 'number' && attachment.data.length > 0) {
          try { bufferData = Buffer.from(attachment.data); } catch(e) {}
        }
      }
      if (bufferData.length === 0 && attachment.path && fs.existsSync(attachment.path)) {
        try { bufferData = fs.readFileSync(attachment.path); } catch(e) {}
      }
      if (bufferData.length === 0 && attachment.url && attachment.url.startsWith('data:')) {
        try {
          const commaIdx = attachment.url.indexOf(';base64,');
          if (commaIdx > -1) {
            bufferData = Buffer.from(attachment.url.substring(commaIdx + 8), 'base64');
          }
        } catch(e) {}
      }
    }

    if (bufferData.length === 0 && !localPath) {
      console.warn('Skipping attachment "' + attachment.name + '": no data available');
      return null;
    }

    this.stmts.saveAttachment.run({
      id: attId,
      messageId: msgId.toString(),
      type: attachment.type,
      name: attachment.name,
      size: attachment.size || bufferData.length,
      data: bufferData,
      hash: attachment.hash || null,
      localPath: localPath
    });
    return attId;
  }
  
  getAttachment(attachmentId) {
    return this.stmts.getAttachmentData.get(attachmentId);
  }

  getAttachmentThumbnail(attachmentId) {
    return this.stmts.getAttachmentThumbnail.get(attachmentId);
  }

  clearAllAttachments() {
    this.db.prepare('UPDATE attachments SET data = zeroblob(0), thumbnail = NULL').run();
  }

  cleanupOldAttachments(minutes) {
    // if minutes is 0, we don't delete. If no setting, user requested > 365 days (525600 min)
    if (minutes <= 0) return;
    
    // SQLite datetime('now', '-N minutes')
    const query = `
      UPDATE attachments SET data = zeroblob(0), thumbnail = NULL 
      WHERE messageId IN (
        SELECT id FROM messages 
        WHERE timestamp < datetime('now', '-${minutes} minutes')
      ) AND (data != zeroblob(0) OR thumbnail IS NOT NULL)
    `;
    this.db.prepare(query).run();
  }

  // --- Settings ---
  getSetting(key, def) {
    const row = this.stmts.getSetting.get(key);
    if (!row) return def;
    try {
      return JSON.parse(row.value);
    } catch(e) {
      return def;
    }
  }

  setSetting(key, value) {
    this.stmts.setSetting.run({
      key: key,
      value: JSON.stringify(value)
    });
  }

  // --- Migration from old JSON store ---
  migrateFromElectronStore(forceAvatarsOnly = false) {
    const migrated = this.getSetting('migrated_from_electron_store', false);
    if (migrated && !forceAvatarsOnly) return;
    
    dlog('Migrating data from electron-store to SQLite...');
    const oldStore = new Store();
    
    this.db.transaction(() => {
      // Settings
      const settings = oldStore.get('settings');
      if (settings) this.setSetting('settings', settings);
      
      const networkSettings = oldStore.get('networkSettings');
      if (networkSettings) this.setSetting('networkSettings', networkSettings);
      
      // Identity
      const identity = oldStore.get('identity');
      if (identity) {
        this.saveUser({
          id: identity.id || identity.userId || require('crypto').randomUUID(),
          username: identity.username || 'User',
          usertag: identity.usertag || '0000',
          status: identity.status || 'online',
          avatar: identity.avatar || null,
          banner: identity.banner || null,
          bio: identity.bio || ''
        });
      }
      
      // AppData (friends, messages, groups)
      const appData = oldStore.get('appData');
      if (appData) {
        if (appData.friends && Array.isArray(appData.friends)) {
          appData.friends.forEach(f => {
            this.saveFriend({
              userId: f.userId,
              username: f.username,
              usertag: f.usertag || '0000',
              status: f.status || 'offline',
              avatar: f.avatar || null,
              bio: f.bio || ''
            });
          });
        }
        
        if (!forceAvatarsOnly && appData.messages && typeof appData.messages === 'object') {
          for (const [chatId, msgs] of Object.entries(appData.messages)) {
            msgs.forEach(m => {
              this.stmts.addMessage.run({
                id: m.id.toString(),
                chatId: chatId,
                sender: m.sender,
                text: m.text || '',
                timestamp: m.timestamp,
                replyTo: m.replyTo != null ? String(m.replyTo) : null
              });
              
              if (m.attachments && Array.isArray(m.attachments)) {
                m.attachments.forEach(att => {
                  const attId = require('crypto').randomUUID();
                  
                  // If legacy URL was orbit-file://, we can try to read the file and ingest it.
                  let bufferData = Buffer.alloc(0);
                  if (att.url && att.url.startsWith('orbit-file://')) {
                     try {
                        const originalPath = decodeURIComponent(att.url.replace('orbit-file://', ''));
                        if (fs.existsSync(originalPath)) {
                           bufferData = fs.readFileSync(originalPath);
                        }
                     } catch(e) { console.error("Error migrating file", e); }
                  }

                  this.stmts.saveAttachment.run({
                    id: attId,
                    messageId: m.id.toString(),
                    type: att.type || 'file',
                    name: att.name || 'Unknown',
                    size: att.size || bufferData.length,
                    data: bufferData
                  });
                });
              }
            });
          }
        }
      }
      
      this.setSetting('migrated_from_electron_store', true);
    })();
    dlog('Migration from electron-store complete.');
  }

  // --- Attachment Integrity Check ---
  checkAttachmentIntegrity() {
    const result = { ok: true, warnings: [] };
    try {
      // Find attachments with zero-length data and no localPath (orphaned data)
      const orphaned = this.db.prepare(`
        SELECT a.id, a.messageId, a.name, a.type FROM attachments a
        WHERE length(a.data) = 0 AND (a.localPath IS NULL OR a.localPath = '')
      `).all();
      if (orphaned.length > 0) {
        result.ok = false;
        orphaned.forEach(a => {
          result.warnings.push('Attachment "' + a.name + '" (id=' + a.id + ', msg=' + a.messageId + ') has empty data');
        });
      }
    } catch(e) {
      result.ok = false;
      result.warnings.push('Attachment integrity check failed: ' + e.message);
    }
    return result;
  }

  cleanupBrokenAttachments() {
    try {
      const result = this.db.prepare(`
        DELETE FROM attachments WHERE length(data) = 0 AND (localPath IS NULL OR localPath = '')
      `).run();
      if (result.changes > 0) {
        dlog('Cleaned up ' + result.changes + ' broken attachment(s) with empty data');
      }
      return { ok: true, removed: result.changes };
    } catch(e) {
      console.error('Failed to clean up broken attachments:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // --- Database Health Check ---
  healthCheck() {
    const result = { ok: true, errors: [], warnings: [] };
    try {
      // Integrity check
      const integrity = this.db.pragma('integrity_check');
      if (integrity[0] && integrity[0].integrity_check !== 'ok') {
        result.ok = false;
        result.errors.push('Database integrity check failed: ' + integrity[0].integrity_check);
      }

      // Verify required tables exist
      const requiredTables = ['users', 'friends', 'messages', 'attachments', 'settings', 'groups', 'group_members'];
      const existing = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      requiredTables.forEach(tbl => {
        if (!existing.includes(tbl)) {
          result.warnings.push('Missing table: ' + tbl);
        }
      });

      // Foreign key check
      const fkStatus = this.db.pragma('foreign_key_check');
      if (fkStatus && fkStatus.length > 0) {
        result.warnings.push(fkStatus.length + ' foreign key violation(s) found');
      }

      // WAL mode check
      const journalMode = this.db.pragma('journal_mode');
      if (journalMode[0] && journalMode[0].journal_mode !== 'wal') {
        result.warnings.push('Database not in WAL mode (current: ' + journalMode[0].journal_mode + ')');
      }
    } catch (e) {
      result.ok = false;
      result.errors.push('Health check crashed: ' + e.message);
    }
    return result;
  }

  repairDatabase() {
    const result = { ok: true, repaired: [], warnings: [] };
    try {
      // 1. Check integrity
      const integrity = this.db.pragma('integrity_check');
      if (integrity[0] && integrity[0].integrity_check !== 'ok') {
        this.db.exec('VACUUM;');
        result.repaired.push('Ran VACUUM to repair integrity');
      }

      // 2. Rebuild indexes
      this.db.exec('REINDEX;');
      result.repaired.push('Rebuilt database indexes');

      // 3. Check and fix journal mode
      const journalMode = this.db.pragma('journal_mode');
      if (journalMode[0] && journalMode[0].journal_mode !== 'wal') {
        this.db.pragma('journal_mode = WAL');
        result.repaired.push('Switched journal mode to WAL');
      }

      // 4. Remove orphaned group_members (no matching group)
      const orphanedMembers = this.db.prepare(`
        SELECT gm.rowid FROM group_members gm
        LEFT JOIN groups g ON gm.groupId = g.groupId
        WHERE g.groupId IS NULL
      `).all();
      if (orphanedMembers.length > 0) {
        this.db.prepare(`
          DELETE FROM group_members WHERE rowid IN (${orphanedMembers.map(() => '?').join(',')})
        `).run(...orphanedMembers.map(r => r.rowid));
        result.repaired.push('Removed ' + orphanedMembers.length + ' orphaned group member(s)');
      }

      // 5. Remove orphaned messages (no matching friend or group)
      const orphanedMessages = this.db.prepare(`
        SELECT COUNT(*) as count FROM messages m
        LEFT JOIN friends f ON m.chatId = f.userId
        LEFT JOIN groups g ON m.chatId = g.groupId
        WHERE f.userId IS NULL AND g.groupId IS NULL AND m.chatId != 'local-echo'
      `).get();
      if (orphanedMessages.count > 0) {
        this.db.prepare(`
          DELETE FROM messages WHERE chatId IN (
            SELECT m.chatId FROM messages m
            LEFT JOIN friends f ON m.chatId = f.userId
            LEFT JOIN groups g ON m.chatId = g.groupId
            WHERE f.userId IS NULL AND g.groupId IS NULL AND m.chatId != 'local-echo'
          )
        `).run();
        result.repaired.push('Removed ' + orphanedMessages.count + ' orphaned message(s)');
      }

      // 6. Remove orphaned attachments (no matching message)
      const orphanedAttachments = this.db.prepare(`
        SELECT COUNT(*) as count FROM attachments a
        LEFT JOIN messages m ON a.messageId = m.id
        WHERE m.id IS NULL
      `).get();
      if (orphanedAttachments.count > 0) {
        this.db.prepare(`
          DELETE FROM attachments WHERE messageId IN (
            SELECT a.messageId FROM attachments a
            LEFT JOIN messages m ON a.messageId = m.id
            WHERE m.id IS NULL
          )
        `).run();
        result.repaired.push('Removed ' + orphanedAttachments.count + ' orphaned attachment(s)');
      }

      // Verify integrity after repairs
      const postIntegrity = this.db.pragma('integrity_check');
      if (postIntegrity[0] && postIntegrity[0].integrity_check !== 'ok') {
        result.warnings.push('Integrity still failing after repair: ' + postIntegrity[0].integrity_check);
      } else {
        result.ok = true;
      }
    } catch (e) {
      result.ok = false;
      result.warnings.push('Repair failed: ' + e.message);
    }
    return result;
  }

  // --- Backup & Restore ---
  buildBackupPackage() {
    const backup = {
      version: 1,
      createdAt: new Date().toISOString(),
      userDataPath: this.userDataPath,
      data: {
        users: this.db.prepare('SELECT * FROM users').all(),
        friends: this.db.prepare('SELECT * FROM friends').all(),
        messages: this.db.prepare('SELECT * FROM messages ORDER BY chatId, timestamp').all(),
        attachments: this.db.prepare('SELECT id, messageId, type, name, size, hash, localPath FROM attachments').all(),
        groups: this.db.prepare('SELECT * FROM groups').all(),
        groupMembers: this.db.prepare('SELECT * FROM group_members').all(),
        settings: this.db.prepare('SELECT * FROM settings').all()
      }
    };
    return backup;
  }

  exportBackupAsOrzip(destPath) {
    const backup = this.buildBackupPackage();
    const json = JSON.stringify(backup);
    const compressed = zlib.gzipSync(json);
    fs.writeFileSync(destPath, compressed);
    return { path: destPath, size: compressed.length };
  }

  exportBackupAsZip(destPath) {
    const archiver = require('archiver');
    const backup = this.buildBackupPackage();
    const json = JSON.stringify(backup, null, 2);

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(destPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve({ path: destPath, size: archive.pointer() }));
      archive.on('error', reject);
      archive.pipe(output);
      archive.append(json, { name: 'backup.json' });
      // Include avatar files if they exist
      const avatarDir = path.join(this.userDataPath, 'avatars');
      if (fs.existsSync(avatarDir)) {
        archive.directory(avatarDir, 'avatars');
      }
      archive.finalize();
    });
  }

  validateBackupOrzip(filePath) {
    try {
      const compressed = fs.readFileSync(filePath);
      const json = zlib.gunzipSync(compressed);
      const backup = JSON.parse(json.toString());
      if (!backup.version || !backup.data) return { valid: false, error: 'Invalid backup structure' };
      return { valid: true, backup };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  validateBackupZip(filePath) {
    try {
      const fs2 = require('fs');
      const buffer = fs2.readFileSync(filePath);
      const { inflateRawSync } = require('zlib');
      // Parse zip central directory to find and extract backup.json
      const { execSync } = require('child_process');
      const tmpDir = path.join(this.userDataPath, 'temp', '.backup_tmp_' + Date.now());
      if (!fs2.existsSync(tmpDir)) fs2.mkdirSync(tmpDir, { recursive: true });
      try {
        // Try unzip command
        const result = execSync('"'+__dirname+'/../../node_modules/.bin/unzip" -o "' + filePath + '" -d "' + tmpDir + '" 2>nul || tar -xf "' + filePath + '" -C "' + tmpDir + '"', { stdio: 'pipe', timeout: 30000 });
        const jsonPath = path.join(tmpDir, 'backup.json');
        if (!fs2.existsSync(jsonPath)) {
          // Remove tmp dir
          this._rmdir(tmpDir);
          return { valid: false, error: 'backup.json not found in archive' };
        }
        const json = fs2.readFileSync(jsonPath, 'utf-8');
        const backup = JSON.parse(json);
        if (!backup.version || !backup.data) {
          this._rmdir(tmpDir);
          return { valid: false, error: 'Invalid backup structure' };
        }
        this._rmdir(tmpDir);
        return { valid: true, backup };
      } catch (e2) {
        this._rmdir(tmpDir);
        return { valid: false, error: 'Failed to extract zip: ' + e2.message };
      }
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  validateBackup(filePath) {
    try {
      const fd = require('fs').openSync(filePath, 'r');
      const buf = Buffer.alloc(2);
      require('fs').readSync(fd, buf, 0, 2, 0);
      require('fs').closeSync(fd);

      if (buf[0] === 0x1F && buf[1] === 0x8B) {
        return this.validateBackupOrzip(filePath);
      } else if (buf[0] === 0x50 && buf[1] === 0x4B) {
        return this.validateBackupZip(filePath);
      }
      return { valid: false, error: 'Unknown file format (expected .orzip or .zip)' };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  restoreBackup(filePath) {
    const validation = this.validateBackup(filePath);
    if (!validation.valid) return { ok: false, error: validation.error };

    const backup = validation.backup;
    const data = backup.data;

    try {
      this.db.transaction(() => {
        // Clear existing data
        this.db.exec('DELETE FROM group_members');
        this.db.exec('DELETE FROM groups');
        this.db.exec('DELETE FROM attachments');
        this.db.exec('DELETE FROM messages');
        this.db.exec('DELETE FROM friends');
        this.db.exec('DELETE FROM users');
        this.db.exec('DELETE FROM settings');

        // Restore users
        if (data.users) {
          const stmt = this.db.prepare('INSERT OR REPLACE INTO users (userId, username, usertag, status, avatar, banner, bio) VALUES (@userId, @username, @usertag, @status, @avatar, @banner, @bio)');
          data.users.forEach(u => stmt.run(u));
        }

        // Restore friends
        if (data.friends) {
          const stmt = this.db.prepare('INSERT OR REPLACE INTO friends (userId, username, usertag, status, avatar, bio) VALUES (@userId, @username, @usertag, @status, @avatar, @bio)');
          data.friends.forEach(f => stmt.run(f));
        }

        // Restore messages
        if (data.messages) {
          const stmt = this.db.prepare('INSERT OR REPLACE INTO messages (id, chatId, sender, text, timestamp, replyTo, call) VALUES (@id, @chatId, @sender, @text, @timestamp, @replyTo, @call)');
          data.messages.forEach(m => stmt.run({
            id: m.id,
            chatId: m.chatId,
            sender: m.sender,
            text: m.text,
            timestamp: m.timestamp,
            replyTo: m.replyTo != null ? String(m.replyTo) : null
          }));
        }

        // Restore attachments
        if (data.attachments) {
          const stmt = this.db.prepare('INSERT OR REPLACE INTO attachments (id, messageId, type, name, size, hash, localPath) VALUES (@id, @messageId, @type, @name, @size, @hash, @localPath)');
          data.attachments.forEach(a => stmt.run(a));
        }

        // Restore groups
        // ⚠ This list has to match `saveGroup`'s. It was two columns short —
        // `avatarDataUrl` and `accountOwnerId` — so restoring a backup silently
        // dropped every group avatar and un-tagged every group from its account.
        // A backup is `SELECT * FROM groups`, so the data is right there to write.
        if (data.groups) {
          const stmt = this.db.prepare('INSERT OR REPLACE INTO groups (groupId, groupName, ownerId, createdAt, avatarPath, avatarDataUrl, description, pinned, notificationMuted, inviteCode, avatarUpdatedAt, accountOwnerId) VALUES (@groupId, @groupName, @ownerId, @createdAt, @avatarPath, @avatarDataUrl, @description, @pinned, @notificationMuted, @inviteCode, @avatarUpdatedAt, @accountOwnerId)');
          data.groups.forEach(g => stmt.run(g));
        }

        // Restore group members
        if (data.groupMembers) {
          const stmt = this.db.prepare('INSERT OR REPLACE INTO group_members (groupId, userId, username, usertag, status, avatar, ip, joinedAt) VALUES (@groupId, @userId, @username, @usertag, @status, @avatar, @ip, @joinedAt)');
          data.groupMembers.forEach(gm => stmt.run(gm));
        }

        // Restore settings
        if (data.settings) {
          const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)');
          data.settings.forEach(s => stmt.run(s));
        }
      })();

      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Restore failed: ' + e.message };
    }
  }

  _rmdir(dirPath) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch(e) {}
  }
}

/* Full-text search over message text, via the FTS5 index built in migrations v12.
 *
 * Returns [] rather than throwing when the index is missing, so a build without FTS5 degrades to
 * "no results from here" and the caller can fall back to a scan.
 *
 * The query is passed through as FTS5 syntax — "project AND deadline", quoted phrases, prefix
 * `foo*` — which is the point of using the engine rather than a LIKE. A malformed query throws
 * inside SQLite, so that is caught and reported as no results too.
 */
OrbitDatabase.prototype.searchMessages = function (query, options) {
  if (!query || !String(query).trim()) return [];
  var opts = options || {};
  var limit = Math.min(parseInt(opts.limit, 10) || 200, 1000);

  try {
    var sql = 'SELECT m.id, m.chatId, m.sender, m.text, m.timestamp ' +
      'FROM messages_fts f JOIN messages m ON m.rowid = f.rowid ' +
      'WHERE messages_fts MATCH ? ';
    var params = [String(query)];
    if (opts.chatId) {
      sql += 'AND m.chatId = ? ';
      params.push(opts.chatId);
    }
    // bm25 is FTS5's relevance ranking; lower is a better match, so ascending.
    sql += 'ORDER BY bm25(messages_fts) LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(params);
  } catch (e) {
    console.warn('[DB] searchMessages failed:', e.message);
    return [];
  }
};

module.exports = OrbitDatabase;
