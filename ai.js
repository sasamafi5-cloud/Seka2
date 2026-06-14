// ============= Luna AI - Multi-Provider (Groq + Gemini + Offline) =============
class LunaAI {
  constructor() {
    this.groqKey = null;
    this.geminiKey = null;
    this.provider = 'offline'; // 'offline' | 'groq' | 'gemini'
    this.autoMode = true; // auto-fallback
    this.online = navigator.onLine;
    this.userName = 'Saša';
    this.personality = 'smart';

    this.systemPrompts = {
      smart: 'Ti si Luna, pametna AI sekretarica. Kratko, precizno i korisno. Srpski jezik.',
      funny: 'Ti si Luna, šaljiva AI sekretarica. Duhovita, koristi humor. Ali i dalje od pomoći. Srpski.',
      wise: 'Ti si Luna, sveznalica. Deli mudrosti i zanimljivosti. Budi inspirativna. Srpski.',
      business: 'Ti si Luna, poslovna AI sekretarica. Profesionalna i efikasna. Srpski.',
      friendly: 'Ti si Luna, prijateljska sekretarica. Tople reči, nežna i podržavajuća. Srpski.'
    };
  }

  setApiKey(provider, key) {
    if (provider === 'groq') this.groqKey = key;
    if (provider === 'gemini') this.geminiKey = key;
  }

  setProvider(p) {
    this.provider = p;
    this.autoMode = (p === 'offline');
  }

  setPersonality(p) {
    this.personality = p;
  }

  setUserName(name) {
    this.userName = name || 'prijatelju';
  }

  setOnlineStatus(online) {
    const wasOnline = this.online;
    this.online = online;
    if (this.autoMode) {
      if (online) {
        // Try to use best available
        if (this.geminiKey) this.provider = 'gemini';
        else if (this.groqKey) this.provider = 'groq';
        else this.provider = 'offline';
      } else {
        this.provider = 'offline';
      }
    }
    return { wasOnline, isOnline: online, provider: this.provider };
  }

  getActiveProvider() {
    if (!this.online) return 'offline';
    if (this.provider === 'groq' && this.groqKey) return 'groq';
    if (this.provider === 'gemini' && this.geminiKey) return 'gemini';
    if (this.geminiKey) return 'gemini';
    if (this.groqKey) return 'groq';
    return 'offline';
  }

  async testConnection(provider) {
    const key = provider === 'groq' ? this.groqKey : this.geminiKey;
    if (!key) return { success: false, message: 'Nema API ključa' };
    if (!this.online) return { success: false, message: 'Nema interneta' };

    try {
      if (provider === 'groq') {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Zdravo' }],
            max_tokens: 5
          })
        });
        if (r.ok) return { success: true, message: 'Groq ✓' };
        const e = await r.json().catch(() => ({}));
        return { success: false, message: e.error?.message || 'Greška' };
      } else if (provider === 'gemini') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Zdravo' }] }]
          })
        });
        if (r.ok) return { success: true, message: 'Gemini ✓' };
        const e = await r.json().catch(() => ({}));
        return { success: false, message: e.error?.message || 'Greška' };
      }
    } catch (e) {
      return { success: false, message: 'Mrežna greška' };
    }
  }

  async chat(userMessage) {
    const provider = this.getActiveProvider();

    if (provider === 'groq') {
      try { return await this.groqChat(userMessage); }
      catch (e) { console.error('Groq fail:', e); }
    }
    if (provider === 'gemini') {
      try { return await this.geminiChat(userMessage); }
      catch (e) { console.error('Gemini fail:', e); }
    }
    return this.offlineChat(userMessage);
  }

  async groqChat(userMessage) {
    const systemPrompt = this.systemPrompts[this.personality] + ` Korisnik: ${this.userName}.`;
    const convos = await lunaDB.getAll('conversations');
    const recent = convos.slice(-10);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recent.map(c => ({ role: c.role, content: c.content })),
      { role: 'user', content: userMessage }
    ];

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 400,
        temperature: 0.7
      })
    });

    if (!r.ok) throw new Error('Groq error');
    const data = await r.json();
    const reply = data.choices[0].message.content;

    await lunaDB.add('conversations', { role: 'user', content: userMessage, timestamp: Date.now() });
    await lunaDB.add('conversations', { role: 'assistant', content: reply, timestamp: Date.now() });

    return reply;
  }

  async geminiChat(userMessage) {
    const systemPrompt = this.systemPrompts[this.personality] + ` Korisnik: ${this.userName}.`;
    const convos = await lunaDB.getAll('conversations');
    const recent = convos.slice(-10);

    let contents = systemPrompt + '\n\n';
    recent.forEach(c => {
      contents += (c.role === 'user' ? 'Korisnik: ' : 'Luna: ') + c.content + '\n';
    });
    contents += 'Korisnik: ' + userMessage + '\nLuna:';

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: contents }] }],
        generationConfig: { maxOutputTokens: 400, temperature: 0.7 }
      })
    });

    if (!r.ok) throw new Error('Gemini error');
    const data = await r.json();
    const reply = data.candidates[0].content.parts[0].text;

    await lunaDB.add('conversations', { role: 'user', content: userMessage, timestamp: Date.now() });
    await lunaDB.add('conversations', { role: 'assistant', content: reply, timestamp: Date.now() });

    return reply;
  }

  offlineChat(userMessage) {
    const msg = userMessage.toLowerCase().trim();
    const replies = {
      smart: '', funny: '', wise: '', business: '', friendly: ''
    };

    let reply = '';

    // Greetings
    if (this.match(msg, ['zdravo', 'ćao', 'hej', 'hello', 'hi'])) {
      reply = this.ps(
        `Zdravo ${this.userName}! Kako mogu pomoći?`,
        `Ćao ${this.userName}! 😄 Šta ima?`,
        `Dobrodošao ${this.userName}.`,
        `Zdravo ${this.userName}. Tu sam za pomoć.`,
        `Hej ${this.userName} ♥️ Drago mi je!`
      );
    }
    // Time
    else if (this.match(msg, ['koliko je sati', 'vreme', 'time'])) {
      const t = new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' });
      reply = `Trenutno je ${t}.`;
    }
    // Date
    else if (this.match(msg, ['koji je datum', 'datum', 'date'])) {
      const d = new Date().toLocaleDateString('sr-RS', { weekday: 'long', day: 'numeric', month: 'long' });
      reply = `Danas je ${d}.`;
    }
    // Note
    else if (msg.startsWith('beleška ') || msg.startsWith('zapiši ')) {
      const text = userMessage.replace(/^(beleška|zapiši)\s*/i, '');
      lunaDB.put('notes', { id: 'note_' + Date.now(), content: text, date: new Date().toISOString(), archived: false });
      reply = this.ps(`Beleška: "${text}"`, `Zapisano! 📝 "${text}"`, `Sačuvano: "${text}"`, `Beleška kreirana.`, `Sačuvala sam: "${text}" ♥️`);
    }
    // Task
    else if (msg.startsWith('zadatak ')) {
      const text = userMessage.replace(/^zadatak\s*/i, '');
      lunaDB.put('tasks', { id: 'task_' + Date.now(), content: text, priority: 'normal', completed: false, createdAt: Date.now() });
      reply = `Zadatak dodat: "${text}". Srećno! 💪`;
    }
    // Alarm
    else if (msg.startsWith('alarm ')) {
      const time = this.extractTime(msg);
      if (time) {
        const label = userMessage.replace(/^alarm\s*/i, '').replace(time, '').trim() || 'Alarm';
        lunaDB.put('alarms', { id: 'alarm_' + Date.now(), label, time, active: true, repeat: false, createdAt: Date.now() });
        reply = `⏰ Alarm postavljen za ${time}: "${label}".`;
      } else reply = `Reci mi vreme, npr. "alarm 14:30".`;
    }
    // Reminder
    else if (msg.startsWith('podsetnik ')) {
      const time = this.extractTime(msg);
      const text = userMessage.replace(/^podsetnik\s*/i, '').replace(time || '', '').trim();
      if (time && text) {
        const today = new Date();
        const [h, m] = time.split(':').map(Number);
        today.setHours(h, m, 0, 0);
        lunaDB.put('reminders', { id: 'rem_' + Date.now(), content: text, dateTime: today.toISOString(), fired: false });
        reply = `🔔 Podsetnik: "${text}" za ${time}.`;
      } else reply = `Probaj: "podsetnik kupi hleb 18:00".`;
    }
    // Joke
    else if (this.match(msg, ['vic', 'šala', 'joke'])) {
      const jokes = [
        'Zašto programeri mrze prirodu? Previše bagova. 🐛',
        'Kako se zove optimista koji je pao sa 10. sprata? Neočekivano srećan. 📉',
        'Šta je zajedničko mrazu i laži? Kratko traju. ❄️',
        'Zašto kompjuter ide kod doktora? Ima virus. 🦠'
      ];
      reply = jokes[Math.floor(Math.random() * jokes.length)];
    }
    // Help
    else if (this.match(msg, ['pomoć', 'help', 'komande'])) {
      reply = `Komande:\n• beleška [tekst]\n• zadatak [tekst]\n• alarm [vreme]\n• podsetnik [tekst] [vreme]\n• vic\n• koliko je sati\n• koji je datum`;
    }
    // Status
    else if (this.match(msg, ['status', 'kako si'])) {
      reply = this.ps('Sve radi.', 'Odlično! 😎', 'U redu sam.', 'Spremna.', 'Super, hvala! ♥️');
    }
    // Default
    else {
      reply = this.ps(
        `Razumem. Probaj: beleška, zadatak, alarm, podsetnik, vic, vreme. Ili unesi Groq/Gemini ključ u podešavanja za napredniji razgovor.`,
        `Hmm, nisam sigurna 😅 Probaj: "beleška kupi mleko" ili "vic"!`,
        `Mudrost zahteva internet ili jednostavne komande. Probaj: beleška, zadatak.`,
        `Nisam mogla da procesiram. Komande: beleška, zadatak, alarm, podsetnik.`,
        `Razumem, ali bez interneta sam malo ograničena ♥️ Probaj komande.`
      );
    }

    // Save
    lunaDB.add('conversations', { role: 'user', content: userMessage, timestamp: Date.now() });
    lunaDB.add('conversations', { role: 'assistant', content: reply, timestamp: Date.now() });

    return reply;
  }

  ps(smart, funny, wise, business, friendly) {
    return { smart, funny, wise, business, friendly }[this.personality] || smart;
  }

  match(text, keywords) {
    return keywords.some(k => text.includes(k));
  }

  extractTime(text) {
    const m = text.match(/(\d{1,2}):(\d{2})/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
    const m2 = text.match(/(\d{1,2})\s*sati/);
    if (m2) return `${m2[1].padStart(2, '0')}:00`;
    return null;
  }

  async generateDailyGreeting() {
    const hour = new Date().getHours();
    const tasks = (await lunaDB.getAll('tasks')).filter(t => !t.completed);
    const alarms = (await lunaDB.getAll('alarms')).filter(a => a.active);
    const reminders = await lunaDB.getAll('reminders');
    const today = new Date().toDateString();
    const todayReminders = reminders.filter(r => !r.fired && new Date(r.dateTime).toDateString() === today);

    let g;
    if (hour < 6) g = 'Dobra noć';
    else if (hour < 12) g = 'Dobro jutro';
    else if (hour < 18) g = 'Dobar dan';
    else g = 'Dobro veče';

    let msg = `${g} ${this.userName}.`;

    const parts = [];
    if (tasks.length) parts.push(`${tasks.length} ${tasks.length === 1 ? 'zadatak' : 'zadatka'}`);
    if (todayReminders.length) parts.push(`${todayReminders.length} ${todayReminders.length === 1 ? 'podsetnik' : 'podsetnika'}`);
    if (alarms.length) parts.push(`${alarms.length} ${alarms.length === 1 ? 'alarm' : 'alarma'}`);

    if (parts.length > 0) {
      msg += ` Danas imaš ${parts.join(', ')}.`;
    } else {
      msg += ' Danas nema zakazanih obaveza.';
    }

    return msg;
  }
}

const lunaAI = new LunaAI();
