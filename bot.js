require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ BOT_TOKEN topilmadi!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ============================================================
//  🚀 KEEP ALIVE - SELF PING
// ============================================================
const RENDER_URL = `https://m27-anonimbot.onrender.com`;

setInterval(async () => {
  try {
    await axios.get(RENDER_URL);
    console.log('✅ Bot uyg`oq saqlanmoqda...');
  } catch (e) {
    console.log('⚠️ Ping yuborishda xato.');
  }
}, 10 * 60 * 1000);

// ============================================================
//  📦 DATABASE TIZIMI
// ============================================================
const DB_PATH = path.join(__dirname, 'database.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { userStates: {}, replyMap: {}, messageLinker: {}, users: {}, logs: [] };
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!data.users) data.users = {};
    return data;
  } catch (e) {
    return { userStates: {}, replyMap: {}, messageLinker: {}, users: {}, logs: [] };
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Saqlashda xato:', e);
  }
}

let db = loadDB();

const TEXTS = {
  welcome: (name, link) => 
    `👋 Salom, <b>${name}</b>!\n\n` +
    `Bu 🎭 <b>@m27_AnonimBot</b> — mutlaqo anonim xabarlar botidir.\n\n` +
    `🔗 <b>Sizning havolangiz:</b>\n` +
    `<code>${link}</code>\n\n` +
    `👆 Ushbu havolani Instagram yoki Telegram'ga joylang.`,
  
  anonymousPrompt: `✍️ <b>Xabaringizni yuboring...</b>\n\nSiz hozir mutlaqo anonim tarzda yozayapsiz.`,
  sentSuccess: `✅ <b>Yuborildi!</b>\n\nSizning xabaringiz o'z egasiga yetkazildi.`,
  notSubscribed: `⚠️ <b>Kechirasiz!</b>\n\nBotdan foydalanish uchun kanalimizga a'zo bo'lishingiz kerak.`,
  profanityError: `🚫 <b>Xato!</b>\n\nXabarda haqoratli so'zlar borligi uchun yuborilmadi.`,
  blockedMessage: `⚠️ <b>Xabar yuborilmadi!</b>\n\nSiz bloklangansiz.`,
  receivedHeader: `💎 <b>Sizda yangi anonim xabar!</b>\n\n`,
  replyHeader: `💬 <b>Sizda yangi anonim javob!</b>\n\n`,
  replyHint: `\n\n<i>Javob berish uchun xabarni chapga suring.</i>`,
  stats: (users, msgs) => `📊 <b>Statistika:</b>\n\n👤 Foydalanuvchilar: ${users}\n✉️ Xabarlar: ${msgs}`,
  broadcastPrompt: `📢 <b>Broadcasting:</b> Xabaringizni yozing.`
};

const ADMIN_ID = '6756534512'; 
const CHANNEL_ID = '@m27_Anonim'; 
const BAD_WORDS = ['jalap', 'qanjiq', 'itdan tarqagan', 'skay', 'am', 'kot', 'sharmanda'];

function hasProfanity(text) {
  if (!text) return false;
  const regex = new RegExp(BAD_WORDS.join('|'), 'gi');
  return regex.test(text);
}

async function sendWelcomeMessage(chatId, firstName) {
  const myLink = `https://t.me/m27_AnonimBot?start=${chatId}`;
  return bot.sendMessage(chatId, TEXTS.welcome(firstName, myLink), {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: "📤 Havolani ulashish", url: `https://t.me/share/url?url=${encodeURIComponent(myLink)}` }]]
    }
  });
}

async function isSubscribed(userId) {
  try {
    const member = await bot.getChatMember(CHANNEL_ID, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (e) { return true; }
}

async function logToAdmin(sender, receiverId, message, isReply = false) {
  if (!ADMIN_ID) return;
  const receiver = db.users[receiverId] || { name: 'Noma`lum', id: receiverId };
  const logHeader = `📡 <b>LOG</b>\n👤 <a href="tg://user?id=${sender.id}">${sender.first_name}</a> -> 🎯 <a href="tg://user?id=${receiver.id}">${receiver.name}</a>\n\n`;
  try {
    if (message.text) await bot.sendMessage(ADMIN_ID, logHeader + message.text, { parse_mode: 'HTML' });
    else await bot.copyMessage(ADMIN_ID, sender.id, message.message_id, { caption: logHeader, parse_mode: 'HTML' });
  } catch (e) {}
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text || '';

  if (text === '/myid') return bot.sendMessage(chatId, `ID: <code>${chatId}</code>`, { parse_mode: 'HTML' });

  if (text.startsWith('/start')) {
    if (!db.users[chatId]) {
      db.users[chatId] = { id: chatId, name: msg.from.first_name, joinedAt: new Date().toISOString() };
      saveDB(db);
    }
    const sub = await isSubscribed(chatId);
    if (!sub) {
      return bot.sendMessage(chatId, TEXTS.notSubscribed, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: "📢 Kanal", url: "https://t.me/m27_Anonim" }], [{ text: "✅ Tekshirish", callback_data: "check_sub" }]]
        }
      });
    }
    if (chatId === ADMIN_ID) {
      await bot.sendMessage(chatId, "👋 Admin paneli:", {
        reply_markup: { keyboard: [["📊 Statistika", "📢 Xabar yuborish"], ["👤 Foydalanuvchilar", "🚫 Bloklar"]], resize_keyboard: true }
      });
    }
    const startParam = text.split(' ')[1];
    if (startParam && startParam !== chatId) {
      db.userStates[chatId] = { targetId: startParam };
      saveDB(db);
      return bot.sendMessage(chatId, TEXTS.anonymousPrompt, { parse_mode: 'HTML' });
    }
    return sendWelcomeMessage(chatId, msg.from.first_name);
  }

  if (chatId === ADMIN_ID) {
    if (text === '📊 Statistika') return bot.sendMessage(chatId, TEXTS.stats(Object.keys(db.users).length, Object.keys(db.replyMap).length), { parse_mode: 'HTML' });
    if (text === '📢 Xabar yuborish') {
      db.userStates[chatId] = { adminAction: 'broadcast' };
      saveDB(db);
      return bot.sendMessage(chatId, TEXTS.broadcastPrompt);
    }
    if (text === '👤 Foydalanuvchilar') {
      let users = Object.values(db.users);
      let list = `👤 <b>Foydalanuvchilar: ${users.length}</b>\n\n`;
      users.forEach((u, i) => {
        list += `${i+1}. <a href="tg://user?id=${u.id}">${u.name}</a> (ID: <code>${u.id}</code>)\n`;
      });
      return bot.sendMessage(chatId, list || "Bazada odam yo'q.", { parse_mode: 'HTML' });
    }
    if (text === '🚫 Bloklar') {
      let list = "🚫 <b>Bloklanganlar ro'yxati:</b>\n\n";
      Object.keys(db.users).forEach(uid => {
        const u = db.users[uid];
        if (u.blocked && u.blocked.length > 0) {
          list += `👤 <a href="tg://user?id=${u.id}">${u.name}</a> quyidagilarni bloklagan:\n`;
          u.blocked.forEach(bid => {
            const bu = db.users[bid] || { name: bid };
            list += `   └─ 🎯 <a href="tg://user?id=${bid}">${bu.name}</a>\n`;
          });
          list += "\n";
        }
      });
      return bot.sendMessage(chatId, list || "Hali hech kim bloklanmagan.", { parse_mode: 'HTML' });
    }
  }

  if (chatId !== ADMIN_ID && hasProfanity(text)) return bot.sendMessage(chatId, TEXTS.profanityError, { parse_mode: 'HTML' });

  if (msg.reply_to_message) {
    const targetUserId = db.replyMap[`${chatId}:${msg.reply_to_message.message_id}`];
    if (targetUserId) {
      try {
        const targetReplyToId = db.messageLinker[`${targetUserId}:${msg.reply_to_message.message_id}`];
        const options = { reply_to_message_id: targetReplyToId, parse_mode: 'HTML' };
        let sent = msg.text ? await bot.sendMessage(targetUserId, TEXTS.replyHeader + msg.text + TEXTS.replyHint, options) : await bot.copyMessage(targetUserId, chatId, msg.message_id, { ...options, caption: TEXTS.replyHeader + TEXTS.replyHint });
        db.replyMap[`${targetUserId}:${sent.message_id}`] = chatId;
        db.messageLinker[`${chatId}:${sent.message_id}`] = msg.reply_to_message.message_id;
        saveDB(db);
        logToAdmin(msg.from, targetUserId, msg, true);
        return bot.sendMessage(chatId, "✅ Javob yuborildi.", { parse_mode: 'HTML' });
      } catch (e) { return bot.sendMessage(chatId, "❌ Xato."); }
    }
  }

  const state = db.userStates[chatId];
  if (state) {
    if (state.adminAction === 'broadcast' && chatId === ADMIN_ID) {
      const users = Object.keys(db.users);
      let count = 0;
      for (const u of users) {
        try { if (u !== ADMIN_ID) { await bot.copyMessage(u, chatId, msg.message_id); count++; } } catch (e) {}
      }
      delete db.userStates[chatId];
      saveDB(db);
      return bot.sendMessage(chatId, `✅ Xabar ${count} ta foydalanuvchiga muvaffaqiyatli yuborildi.`);
    }
    if (state.targetId) {
      const targetId = state.targetId;
      if (db.users[targetId]?.blocked?.includes(chatId)) return bot.sendMessage(chatId, TEXTS.blockedMessage);
      try {
        const opt = { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🚫 Bloklash", callback_data: `block_user:${chatId}` }, { text: "💬 Javob berish", callback_data: `reply_to:${chatId}` }]] } };
        let sent = msg.text ? await bot.sendMessage(targetId, TEXTS.receivedHeader + msg.text + TEXTS.replyHint, opt) : await bot.copyMessage(targetId, chatId, msg.message_id, { ...opt, caption: TEXTS.receivedHeader + TEXTS.replyHint });
        db.replyMap[`${targetId}:${sent.message_id}`] = chatId;
        db.messageLinker[`${chatId}:${sent.message_id}`] = msg.message_id;
        delete db.userStates[chatId];
        saveDB(db);
        logToAdmin(msg.from, targetId, msg, false);
        return bot.sendMessage(chatId, TEXTS.sentSuccess, { parse_mode: 'HTML' });
      } catch (e) { return bot.sendMessage(chatId, "❌ Xato."); }
    }
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id.toString();
  const data = query.data;
  if (data === "check_sub") {
    if (await isSubscribed(chatId)) {
      await bot.deleteMessage(chatId, query.message.message_id);
      return sendWelcomeMessage(chatId, query.from.first_name);
    }
  } else if (data.startsWith("block_user:")) {
    const sId = data.split(":")[1];
    if (!db.users[chatId].blocked) db.users[chatId].blocked = [];
    if (!db.users[chatId].blocked.includes(sId)) {
      db.users[chatId].blocked.push(sId);
      saveDB(db);
      bot.answerCallbackQuery(query.id, { text: "Bloklandi" });
    }
  } else if (data.startsWith("reply_to:")) {
    bot.sendMessage(chatId, "✍️ <b>Javobingizni hoziroq yozing...</b>", { parse_mode: 'HTML', reply_markup: { force_reply: true } });
  }
  bot.answerCallbackQuery(query.id);
});

app.get('/', (req, res) => res.send('OK'));
app.listen(process.env.PORT || 3000);
