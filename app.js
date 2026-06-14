// ============= LUNA PWA v1.1 - Main App =============
class LunaApp {
  constructor() {
    this.currentPage = 'home';
    this.calendarDate = new Date();
    this.activeAlarm = null;
    this.snoozeTimer = null;
    this.greetingActive = false;
  }

  async init() {
    try {
      await lunaDB.init();
      await voiceSystem.init();

      await this.loadSettings();
      await this.applyTheme();

      this.setupEventListeners();
      await this.refreshHomeStats();
      await this.renderAll();

      this.startAlarmChecker();
      this.startReminderChecker();
      this.updateOnlineStatus();

      window.addEventListener('online', () => this.handleOnlineStatus(true));
      window.addEventListener('offline', () => this.handleOnlineStatus(false));

      this.updateStatusPanel();

      // Voice greeting
      const greetEnabled = await lunaDB.getSetting('voiceGreeting', true);
      if (greetEnabled) {
        setTimeout(() => this.doGreeting(), 800);
      }

      console.log('✓ Luna ready');
    } catch (e) {
      console.error('Init error:', e);
    }
  }

  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
    }
  }

  async loadSettings() {
    // User name
    const userName = await lunaDB.getSetting('userName', 'Saša');
    lunaAI.setUserName(userName);
    document.getElementById('user-name-display').textContent = userName;
    document.getElementById('setting-username').value = userName;

    // API keys
    const groqKey = await lunaDB.getSetting('groqApiKey', '');
    const geminiKey = await lunaDB.getSetting('geminiApiKey', '');
    if (groqKey) {
      document.getElementById('setting-groq-key').value = groqKey;
      lunaAI.setApiKey('groq', groqKey);
    }
    if (geminiKey) {
      document.getElementById('setting-gemini-key').value = geminiKey;
      lunaAI.setApiKey('gemini', geminiKey);
    }

    // Provider
    const provider = await lunaDB.getSetting('aiProvider', 'offline');
    lunaAI.setProvider(provider);
    this.setActiveProvider(provider);

    // Personality
    const p = await lunaDB.getSetting('personality', 'smart');
    lunaAI.setPersonality(p);
    this.setActivePersonality(p);

    // Theme
    const theme = await lunaDB.getSetting('theme', 'dark');
    this.setTheme(theme);

    // Checkboxes
    document.getElementById('setting-voice-greeting').checked = await lunaDB.getSetting('voiceGreeting', true);
    document.getElementById('setting-auto-mic').checked = await lunaDB.getSetting('autoMic', true);
    document.getElementById('setting-voice-notif').checked = await lunaDB.getSetting('voiceNotif', true);

    // Register SW
    this.registerSW();
  }

  // ============= GREETING & AUTO MIC =============
  async doGreeting() {
    if (this.greetingActive) return;
    this.greetingActive = true;

    try {
      const msg = await lunaAI.generateDailyGreeting();
      voiceSystem.speak(msg, {
        rate: 0.95,
        onEnd: () => this.handleGreetingEnd()
      });
    } catch (e) {
      this.handleGreetingEnd();
    }
  }

  async handleGreetingEnd() {
    const autoMic = await lunaDB.getSetting('autoMic', true);
    if (autoMic && !this.activeAlarm) {
      // Wait 1.5s, then auto-open mic
      setTimeout(() => this.startAutoMicSession(), 1500);
    }
  }

  startAutoMicSession() {
    this.showToast('🎤 Slušam... Reci komandu');
    this.handleMicPress(true);
  }

  // ============= EVENT LISTENERS =============
  setupEventListeners() {
    // Nav
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.navigateTo(btn.dataset.page));
    });

    document.querySelectorAll('.back-btn').forEach(btn => {
      btn.addEventListener('click', () => this.navigateTo(btn.dataset.page));
    });

    // Quick cards
    document.querySelectorAll('.quick-card[data-page]').forEach(card => {
      card.addEventListener('click', () => this.navigateTo(card.dataset.page));
    });

    // User badge → settings
    document.getElementById('user-name-display').addEventListener('click', () => this.navigateTo('settings'));

    // Personality pills
    document.querySelectorAll('.personality-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.personality;
        lunaAI.setPersonality(p);
        lunaDB.setSetting('personality', p);
        this.setActivePersonality(p);
        const msgs = {
          smart: 'Pametni režim aktiviran.',
          funny: 'Šaljivi režim! 😄',
          wise: 'Mudrost aktivirana.',
          business: 'Poslovni režim.',
          friendly: 'Prijateljski režim ♥️'
        };
        this.showToast(msgs[p]);
      });
    });

    // Mic button - tap to talk
    document.getElementById('mic-button').addEventListener('click', () => this.handleMicPress(false));

    // Global search
    document.getElementById('global-search').addEventListener('input', (e) => this.globalSearch(e.target.value));
    const notesSearch = document.getElementById('notes-search');
    if (notesSearch) notesSearch.addEventListener('input', (e) => this.renderNotes(e.target.value));

    // Add buttons
    document.getElementById('add-note-btn').addEventListener('click', () => this.openModal('modal-note'));
    document.getElementById('add-alarm-btn').addEventListener('click', () => this.openModal('modal-alarm'));
    document.getElementById('add-task-btn').addEventListener('click', () => this.openModal('modal-task'));
    document.getElementById('add-event-btn').addEventListener('click', () => this.openModal('modal-event'));

    // Save
    document.getElementById('save-note').addEventListener('click', () => this.saveNote());
    document.getElementById('save-alarm').addEventListener('click', () => this.saveAlarm());
    document.getElementById('save-task').addEventListener('click', () => this.saveTask());
    document.getElementById('save-event').addEventListener('click', () => this.saveEvent());

    // Modal close
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal(modal.id);
      });
    });

    // Task filters
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderTasks(tab.dataset.filter);
      });
    });

    // Calendar
    document.getElementById('cal-prev').addEventListener('click', () => {
      this.calendarDate.setMonth(this.calendarDate.getMonth() - 1);
      this.renderCalendar();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      this.calendarDate.setMonth(this.calendarDate.getMonth() + 1);
      this.renderCalendar();
    });

    // Chat
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatMicBtn = document.getElementById('chat-mic-btn');
    chatSendBtn.addEventListener('click', () => this.sendChat());
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.sendChat(); });
    chatMicBtn.addEventListener('click', () => {
      voiceSystem.startListening(
        (transcript) => {
          chatInput.value = transcript;
          this.sendChat();
        },
        () => {}
      );
    });

    document.getElementById('clear-chat-btn').addEventListener('click', async () => {
      if (confirm('Obriši sve razgovore?')) {
        await lunaDB.clear('conversations');
        this.renderChat();
      }
    });

    // Settings
    document.getElementById('setting-username').addEventListener('change', async (e) => {
      const n = e.target.value.trim() || 'Saša';
      lunaAI.setUserName(n);
      await lunaDB.setSetting('userName', n);
      document.getElementById('user-name-display').textContent = n;
    });

    // API keys
    document.getElementById('setting-groq-key').addEventListener('change', async (e) => {
      const k = e.target.value.trim();
      lunaAI.setApiKey('groq', k);
      await lunaDB.setSetting('groqApiKey', k);
      this.updateStatusPanel();
    });
    document.getElementById('setting-gemini-key').addEventListener('change', async (e) => {
      const k = e.target.value.trim();
      lunaAI.setApiKey('gemini', k);
      await lunaDB.setSetting('geminiApiKey', k);
      this.updateStatusPanel();
    });

    // AI Provider tabs
    document.querySelectorAll('.provider-tab').forEach(tab => {
      tab.addEventListener('click', () => this.selectProvider(tab.dataset.provider));
    });

    document.getElementById('test-api-btn').addEventListener('click', async () => {
      const status = document.getElementById('api-status');
      status.textContent = 'Testiram...';
      status.className = 'api-status';
      const r1 = await lunaAI.testConnection('groq');
      const r2 = await lunaAI.testConnection('gemini');
      const parts = [];
      if (lunaAI.groqKey) parts.push('Groq: ' + (r1.success ? '✓' : '✗'));
      if (lunaAI.geminiKey) parts.push('Gemini: ' + (r2.success ? '✓' : '✗'));
      if (parts.length === 0) parts.push('Nema unetih ključeva');
      const ok = (r1.success || r2.success);
      status.textContent = parts.join(' | ');
      status.className = 'api-status ' + (ok ? 'success' : 'error');
      this.updateStatusPanel();
    });

    document.getElementById('setting-personality').addEventListener('change', async (e) => {
      lunaAI.setPersonality(e.target.value);
      await lunaDB.setSetting('personality', e.target.value);
      this.setActivePersonality(e.target.value);
    });

    // Theme tabs
    document.querySelectorAll('.theme-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        const t = tab.dataset.theme;
        this.setTheme(t);
        await lunaDB.setSetting('theme', t);
        document.querySelectorAll('.theme-tab').forEach(b => b.classList.remove('active'));
        tab.classList.add('active');
      });
    });

    // Checkboxes
    document.getElementById('setting-voice-greeting').addEventListener('change', async (e) => {
      await lunaDB.setSetting('voiceGreeting', e.target.checked);
    });
    document.getElementById('setting-auto-mic').addEventListener('change', async (e) => {
      await lunaDB.setSetting('autoMic', e.target.checked);
    });
    document.getElementById('setting-voice-notif').addEventListener('change', async (e) => {
      await lunaDB.setSetting('voiceNotif', e.target.checked);
    });

    // Backup
    document.getElementById('export-btn').addEventListener('click', () => this.exportData());
    document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', (e) => this.importData(e.target.files[0]));
    document.getElementById('wipe-btn').addEventListener('click', () => this.wipeData());

    // Alarm modal
    document.getElementById('snooze-alarm').addEventListener('click', () => this.snoozeAlarm());
    document.getElementById('dismiss-alarm').addEventListener('click', () => this.dismissAlarm());
  }

  selectProvider(provider) {
    lunaAI.setProvider(provider);
    lunaDB.setSetting('aiProvider', provider);
    this.setActiveProvider(provider);
    this.updateStatusPanel();

    const info = {
      offline: '📡 Offline AI - radi bez interneta',
      groq: '⚡ Groq (Llama 3.3) - brz i besplatan',
      gemini: '✨ Gemini 2.0 Flash - Google AI'
    };
    document.getElementById('provider-info').textContent = info[provider];

    const msgs = {
      offline: 'Offline AI aktiviran',
      groq: 'Groq AI aktiviran ⚡',
      gemini: 'Gemini AI aktiviran ✨'
    };
    this.showToast(msgs[provider]);
  }

  setActiveProvider(p) {
    document.querySelectorAll('.provider-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.provider === p);
    });
    const info = {
      offline: '📡 Offline AI - radi bez interneta',
      groq: '⚡ Groq (Llama 3.3) - brz i besplatan',
      gemini: '✨ Gemini 2.0 Flash - Google AI'
    };
    const el = document.getElementById('provider-info');
    if (el) el.textContent = info[p] || info.offline;
  }

  setActivePersonality(p) {
    document.querySelectorAll('.personality-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.personality === p);
    });
    const sel = document.getElementById('setting-personality');
    if (sel) sel.value = p;
  }

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
  }

  navigateTo(page) {
    if (this.currentPage === page) return;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');
    this.currentPage = page;

    voiceSystem.stopSpeaking();
    voiceSystem.stopListening();

    if (page === 'notes') this.renderNotes();
    if (page === 'alarms') this.renderAlarms();
    if (page === 'tasks') this.renderTasks();
    if (page === 'planner') { this.renderCalendar(); this.renderEvents(); }
    if (page === 'chat') this.renderChat();
    if (page === 'settings') this.updateStatusPanel();
  }

  // ============= MIC / VOICE =============
  handleMicPress(isAuto = false) {
    if (voiceSystem.isSpeaking) {
      voiceSystem.stopSpeaking();
      return;
    }

    voiceSystem.startListening(
      (transcript) => this.processVoiceCommand(transcript),
      () => { /* end */ }
    );
  }

  async processVoiceCommand(text) {
    if (!text) return;
    const lower = text.toLowerCase().trim();
    const reply = await lunaAI.chat(text);
    this.showToast(`🌙 ${reply.substring(0, 60)}${reply.length > 60 ? '...' : ''}`);
    voiceSystem.speak(reply);

    // After reply, wait 1.5s and re-open mic (conversation mode)
    const autoMic = await lunaDB.getSetting('autoMic', true);
    if (autoMic) {
      setTimeout(() => {
        if (this.currentPage === 'home' && !this.activeAlarm) {
          this.startAutoMicSession();
        }
      }, 1500);
    }
  }

  // ============= NOTES =============
  async renderNotes(search = '') {
    const list = document.getElementById('notes-list');
    let notes = (await lunaDB.getAll('notes')).filter(n => !n.archived);
    notes.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (search) notes = notes.filter(n => n.content.toLowerCase().includes(search.toLowerCase()));

    if (!notes.length) {
      list.innerHTML = '<p class="empty-state">Nema beleški</p>';
    } else {
      list.innerHTML = notes.map(n => `
        <div class="list-item">
          <div class="list-item-content">
            <div class="item-title">${this.esc(n.content)}</div>
            <div class="item-meta">📅 ${new Date(n.date).toLocaleString('sr-RS')}</div>
          </div>
          <div class="item-actions">
            <button class="item-action-btn" onclick="lunaApp.editNote('${n.id}')">✏️</button>
            <button class="item-action-btn danger" onclick="lunaApp.deleteItem('notes','${n.id}')">🗑️</button>
          </div>
        </div>
      `).join('');
    }
    document.getElementById('notes-count').textContent = notes.length;
  }

  async saveNote() {
    const text = document.getElementById('note-text').value.trim();
    const dt = document.getElementById('note-datetime').value;
    if (!text) return alert('Unesi tekst');
    const note = { id: 'note_' + Date.now(), content: text, date: new Date().toISOString(), archived: false };
    if (dt) {
      note.remindAt = new Date(dt).toISOString();
      await lunaDB.put('reminders', { id: 'rem_' + Date.now(), content: text, dateTime: note.remindAt, fired: false });
    }
    await lunaDB.put('notes', note);
    this.closeModal('modal-note');
    document.getElementById('note-text').value = '';
    document.getElementById('note-datetime').value = '';
    this.renderNotes();
    this.refreshHomeStats();
    this.showToast('✓ Beleška sačuvana');
  }

  async editNote(id) {
    const n = await lunaDB.get('notes', id);
    document.getElementById('note-text').value = n.content;
    this.openModal('modal-note');
    await lunaDB.delete('notes', id);
  }

  // ============= ALARMS =============
  async renderAlarms() {
    const list = document.getElementById('alarms-list');
    const alarms = (await lunaDB.getAll('alarms')).sort((a, b) => a.time.localeCompare(b.time));
    if (!alarms.length) {
      list.innerHTML = '<p class="empty-state">Nema alarma</p>';
    } else {
      list.innerHTML = alarms.map(a => `
        <div class="list-item">
          <div class="item-checkbox ${a.active ? 'checked' : ''}" onclick="lunaApp.toggleAlarm('${a.id}')">${a.active ? '✓' : ''}</div>
          <div class="list-item-content">
            <div class="item-title">⏰ ${a.time} - ${this.esc(a.label)}</div>
            <div class="item-meta">${a.repeat ? '🔁 Svaki dan' : '🔕 Jednom'}</div>
          </div>
          <div class="item-actions">
            <button class="item-action-btn danger" onclick="lunaApp.deleteItem('alarms','${a.id}')">🗑️</button>
          </div>
        </div>
      `).join('');
    }
    document.getElementById('alarms-count').textContent = alarms.length;
  }

  async saveAlarm() {
    const time = document.getElementById('alarm-time').value;
    const label = document.getElementById('alarm-label').value.trim() || 'Alarm';
    const repeat = document.getElementById('alarm-repeat').checked;
    if (!time) return alert('Unesi vreme');
    await lunaDB.put('alarms', { id: 'alarm_' + Date.now(), time, label, repeat, active: true, createdAt: Date.now() });
    this.closeModal('modal-alarm');
    document.getElementById('alarm-time').value = '08:00';
    document.getElementById('alarm-label').value = '';
    this.renderAlarms();
    this.refreshHomeStats();
    this.showToast(`⏰ Alarm ${time}`);
    voiceSystem.speak(`Alarm postavljen za ${time}`);
  }

  async toggleAlarm(id) {
    const a = await lunaDB.get('alarms', id);
    a.active = !a.active;
    await lunaDB.put('alarms', a);
    this.renderAlarms();
  }

  startAlarmChecker() {
    setInterval(async () => {
      const now = new Date();
      const t = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
      const today = now.toDateString();
      const alarms = await lunaDB.getAll('alarms');
      for (const a of alarms) {
        if (a.active && a.time === t && a.lastFired !== today) {
          a.lastFired = today;
          await lunaDB.put('alarms', a);
          this.fireAlarm(a);
        }
      }
    }, 20000);
  }

  fireAlarm(alarm) {
    this.activeAlarm = alarm;
    document.getElementById('alarm-active-label').textContent = alarm.label;
    document.getElementById('alarm-active-time').textContent = alarm.time;
    this.openModal('modal-alarm-active');
    voiceSystem.speak(`Alarm! ${alarm.label}. Vreme je ${alarm.time}.`, { rate: 1.0 });
    this.playBeep();
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Luna - ${alarm.label}`, { body: `Vreme je ${alarm.time}`, icon: './icons/icon-192.png' });
    }
  }

  playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 700, 1400].forEach((delay, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = i === 0 ? 880 : 660;
        o.type = 'sine';
        g.gain.setValueAtTime(0.3, ctx.currentTime + delay / 1000);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay / 1000 + 0.5);
        o.start(ctx.currentTime + delay / 1000);
        o.stop(ctx.currentTime + delay / 1000 + 0.5);
      });
    } catch (e) {}
  }

  snoozeAlarm() {
    if (!this.activeAlarm) return;
    voiceSystem.stopSpeaking();
    this.closeModal('modal-alarm-active');
    const label = this.activeAlarm.label;
    setTimeout(() => {
      this.fireAlarm({ ...this.activeAlarm, label: label + ' (odloženo)' });
    }, 5 * 60 * 1000);
    voiceSystem.speak('Odloženo 5 minuta');
    this.showToast('😴 Odloženo 5 min');
  }

  dismissAlarm() {
    voiceSystem.stopSpeaking();
    this.closeModal('modal-alarm-active');
    this.activeAlarm = null;
    voiceSystem.speak('Alarm ugašen');
  }

  // ============= REMINDERS =============
  startReminderChecker() {
    setInterval(async () => {
      const now = new Date();
      const rems = await lunaDB.getAll('reminders');
      for (const r of rems) {
        if (!r.fired && new Date(r.dateTime) <= now) {
          r.fired = true;
          await lunaDB.put('reminders', r);
          voiceSystem.speak(`${lunaAI.userName}, podsetnik: ${r.content}`);
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Luna - Podsetnik', { body: r.content, icon: './icons/icon-192.png' });
          }
        }
      }
    }, 20000);
  }

  // ============= TASKS =============
  async renderTasks(filter = 'all') {
    const list = document.getElementById('tasks-list');
    let tasks = await lunaDB.getAll('tasks');
    if (filter === 'active') tasks = tasks.filter(t => !t.completed);
    if (filter === 'completed') tasks = tasks.filter(t => t.completed);
    tasks.sort((a, b) => ({ urgent: 0, high: 1, normal: 2, low: 3 })[a.priority] - ({ urgent: 0, high: 1, normal: 2, low: 3 })[b.priority]);

    if (!tasks.length) {
      list.innerHTML = '<p class="empty-state">Nema zadataka</p>';
    } else {
      list.innerHTML = tasks.map(t => `
        <div class="list-item ${t.completed ? 'completed' : ''}">
          <div class="item-checkbox ${t.completed ? 'checked' : ''}" onclick="lunaApp.toggleTask('${t.id}')">${t.completed ? '✓' : ''}</div>
          <div class="list-item-content">
            <div class="item-title">${this.esc(t.content)}</div>
            <div class="item-meta">
              <span class="priority-badge priority-${t.priority}">${t.priority}</span>
              ${t.due ? '📅 ' + new Date(t.due).toLocaleDateString('sr-RS') : ''}
            </div>
          </div>
          <div class="item-actions">
            <button class="item-action-btn danger" onclick="lunaApp.deleteItem('tasks','${t.id}')">🗑️</button>
          </div>
        </div>
      `).join('');
    }
    const active = (await lunaDB.getAll('tasks')).filter(t => !t.completed).length;
    document.getElementById('tasks-count').textContent = active;
  }

  async saveTask() {
    const text = document.getElementById('task-text').value.trim();
    const priority = document.getElementById('task-priority').value;
    if (!text) return alert('Unesi opis');
    await lunaDB.put('tasks', { id: 'task_' + Date.now(), content: text, priority, completed: false, createdAt: Date.now() });
    this.closeModal('modal-task');
    document.getElementById('task-text').value = '';
    this.renderTasks();
    this.refreshHomeStats();
    this.showToast('✓ Zadatak dodat');
  }

  async toggleTask(id) {
    const t = await lunaDB.get('tasks', id);
    t.completed = !t.completed;
    await lunaDB.put('tasks', t);
    this.renderTasks();
    this.refreshHomeStats();
  }

  // ============= EVENTS / CALENDAR =============
  async renderCalendar() {
    const grid = document.getElementById('cal-grid');
    const title = document.getElementById('cal-title');
    const date = this.calendarDate;
    title.textContent = date.toLocaleDateString('sr-RS', { month: 'long', year: 'numeric' });
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const startDay = (first.getDay() + 6) % 7;
    const events = await lunaDB.getAll('events');
    const today = new Date();

    let html = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned']
      .map(d => `<div class="cal-day-name">${d}</div>`).join('');

    for (let i = startDay; i > 0; i--) {
      html += `<div class="cal-day other-month">${new Date(date.getFullYear(), date.getMonth(), 1 - i).getDate()}</div>`;
    }
    for (let d = 1; d <= last.getDate(); d++) {
      const cd = new Date(date.getFullYear(), date.getMonth(), d);
      const isToday = cd.toDateString() === today.toDateString();
      const has = events.some(e => new Date(e.date).toDateString() === cd.toDateString());
      html += `<div class="cal-day ${isToday ? 'today' : ''} ${has ? 'has-events' : ''}">${d}</div>`;
    }
    const rem = (7 - ((startDay + last.getDate()) % 7)) % 7;
    for (let i = 1; i <= rem; i++) html += `<div class="cal-day other-month">${i}</div>`;
    grid.innerHTML = html;
  }

  async renderEvents() {
    const list = document.getElementById('events-list');
    const evs = await lunaDB.getAll('events');
    const today = new Date().toDateString();
    const todayEvs = evs.filter(e => new Date(e.date).toDateString() === today);
    if (!todayEvs.length) {
      list.innerHTML = '<p class="empty-state">Nema događaja</p>';
    } else {
      list.innerHTML = todayEvs.map(e => `
        <div class="list-item">
          <div class="list-item-content">
            <div class="item-title">📌 ${this.esc(e.title)}</div>
            <div class="item-meta">${e.time ? '🕐 ' + e.time : '📅 Ceo dan'}</div>
          </div>
          <div class="item-actions">
            <button class="item-action-btn danger" onclick="lunaApp.deleteItem('events','${e.id}')">🗑️</button>
          </div>
        </div>
      `).join('');
    }
    document.getElementById('events-count').textContent = evs.length;
  }

  async saveEvent() {
    const title = document.getElementById('event-title').value.trim();
    const date = document.getElementById('event-date').value;
    const time = document.getElementById('event-time').value;
    if (!title || !date) return alert('Unesi naziv i datum');
    await lunaDB.put('events', { id: 'event_' + Date.now(), title, date: new Date(date).toISOString(), time });
    this.closeModal('modal-event');
    document.getElementById('event-title').value = '';
    document.getElementById('event-date').value = '';
    document.getElementById('event-time').value = '';
    this.renderCalendar();
    this.renderEvents();
    this.showToast('✓ Događaj dodat');
  }

  // ============= CHAT =============
  async renderChat() {
    const c = document.getElementById('chat-messages');
    const convos = await lunaDB.getAll('conversations');
    c.innerHTML = '';
    if (!convos.length) {
      c.innerHTML = '<div class="chat-message luna"><div class="msg-avatar">🌙</div><div class="msg-bubble">Zdravo! Pitaj bilo šta.</div></div>';
      return;
    }
    convos.forEach(co => this.addChatMessage(co.role === 'user' ? 'user' : 'luna', co.content));
    c.scrollTop = c.scrollHeight;
  }

  addChatMessage(role, text) {
    const c = document.getElementById('chat-messages');
    const m = document.createElement('div');
    m.className = 'chat-message ' + role;
    m.innerHTML = `<div class="msg-avatar ${role === 'user' ? 'user-avatar' : ''}">${role === 'user' ? lunaAI.userName.charAt(0).toUpperCase() : '🌙'}</div><div class="msg-bubble">${this.esc(text).replace(/\n/g, '<br>')}</div>`;
    c.appendChild(m);
    c.scrollTop = c.scrollHeight;
  }

  async sendChat() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    this.addChatMessage('user', text);
    const typing = document.createElement('div');
    typing.className = 'chat-message luna';
    typing.innerHTML = '<div class="msg-avatar">🌙</div><div class="msg-bubble">...</div>';
    document.getElementById('chat-messages').appendChild(typing);
    const reply = await lunaAI.chat(text);
    typing.remove();
    this.addChatMessage('luna', reply);
    voiceSystem.speak(reply);
  }

  // ============= HOME STATS =============
  async refreshHomeStats() {
    const notes = (await lunaDB.getAll('notes')).filter(n => !n.archived);
    const tasks = (await lunaDB.getAll('tasks')).filter(t => !t.completed);
    const alarms = (await lunaDB.getAll('alarms')).filter(a => a.active);
    const events = await lunaDB.getAll('events');

    document.getElementById('notes-count').textContent = notes.length;
    document.getElementById('tasks-count').textContent = tasks.length;
    document.getElementById('alarms-count').textContent = alarms.length;
    document.getElementById('events-count').textContent = events.length;
  }

  async renderAll() {
    await this.refreshHomeStats();
  }

  async globalSearch(q) {
    if (!q || q.length < 2) return;
    const n = (await lunaDB.getAll('notes')).filter(x => x.content.toLowerCase().includes(q.toLowerCase()));
    const t = (await lunaDB.getAll('tasks')).filter(x => x.content.toLowerCase().includes(q.toLowerCase()));
    const e = (await lunaDB.getAll('events')).filter(x => x.title.toLowerCase().includes(q.toLowerCase()));
    return [...n, ...t, ...e];
  }

  // ============= BACKUP =============
  async exportData() {
    const data = await lunaDB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `luna-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('📤 Exportovano');
  }

  async importData(file) {
    if (!file) return;
    if (!confirm('Zameniti sve podatke?')) return;
    try {
      const data = JSON.parse(await file.text());
      await lunaDB.importAll(data);
      this.showToast('📥 Uvezeni podaci');
      await this.renderAll();
    } catch (e) {
      alert('Greška: ' + e.message);
    }
  }

  async wipeData() {
    if (!confirm('Obrisati SVE?')) return;
    if (!confirm('Sigurno?')) return;
    await lunaDB.wipeAll();
    location.reload();
  }

  async deleteItem(store, id) {
    if (!confirm('Obriši?')) return;
    await lunaDB.delete(store, id);
    if (store === 'notes') this.renderNotes();
    if (store === 'alarms') this.renderAlarms();
    if (store === 'tasks') this.renderTasks();
    if (store === 'events') { this.renderCalendar(); this.renderEvents(); }
    this.refreshHomeStats();
  }

  // ============= MODALS =============
  openModal(id) {
    document.getElementById(id).classList.add('active');
  }
  closeModal(id) {
    document.getElementById(id).classList.remove('active');
  }

  // ============= TOAST =============
  showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ============= STATUS =============
  updateOnlineStatus() {
    this.handleOnlineStatus(navigator.onLine);
  }

  handleOnlineStatus(online) {
    lunaAI.setOnlineStatus(online);
    this.updateStatusPanel();
  }

  updateStatusPanel() {
    const p = lunaAI.getActiveProvider();
    const online = navigator.onLine;
    const m = document.getElementById('mode-badge');
    if (m) {
      m.textContent = p === 'offline' ? '📡 Offline' : (p === 'groq' ? '⚡ Groq' : '✨ Gemini');
      m.className = 'badge-mode' + (p !== 'offline' ? ' online' : '');
    }
    document.getElementById('status-internet').textContent = online ? '🟢' : '🔴';
    document.getElementById('status-mode').textContent = p === 'offline' ? '📡 Offline' : (p === 'groq' ? '⚡ Groq' : '✨ Gemini');
    document.getElementById('status-groq').textContent = lunaAI.groqKey ? '🟢' : '⚪';
    document.getElementById('status-gemini').textContent = lunaAI.geminiKey ? '🟢' : '⚪';
    document.getElementById('status-mic').textContent = voiceSystem.micPermission ? '🟢' : '🔴';
    document.getElementById('status-db').textContent = lunaDB.db ? '🟢' : '🔴';
  }
}

const lunaApp = new LunaApp();
document.addEventListener('DOMContentLoaded', () => lunaApp.init());
