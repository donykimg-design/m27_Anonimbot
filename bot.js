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

const RENDER_URL = `https://m27-anonimbot.onrender.com`;
setInterval(async () => {
  try { await axios.get(RENDER_URL); } catch (e) {}
}, 10 * 60 * 1000);

const DB_PATH = path.join(__dirname, 'database.json');
function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { userStates: {}, replyMap: {}, messageLinker: {}, users: {}, logs: [] };
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!data.users) data.users = {};
    return data;
  } catch (e) { return { userStates: {}, replyMap: {}, messageLinker: {}, users: {}, logs: [] }; }
}
function saveDB(data) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); } catch (e) {}
}

let db = loadDB();

const ADMIN_ID = '6756534512'; 
const CHANNEL_ID = '@m27_Anonim'; 
const BAD_WORDS = ['jalap', 'qanjiq', 'itdan tarqagan', 'skay', 'am', 'kot', 'sharmanda'];

function hasProfanity(text) {
  if (!text) return false;
  return new RegExp(BAD_WORDS.join('|'), 'gi').test(text);
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
  const typeText = isReply ? "💬 Yangi javob!" : "✍️ Yangi anonim xabar!";
  
  const logText = `📣 <b>${typeText}</b>\n\n` +
            `🆔 <b>ID:</b> <code>${sender.id}</code>\n` +
            `👤 <b>Ismi:</b> ${sender.first_name}\n` +
            `🌐 <b>Username:</b> ${sender.username ? '@'+sender.username : 'Mavjud emas'}\n\n` +
            `🎯 <b>Kimga:</b> ${receiver.name} (ID: ${receiver.id})\n` +
            `📝 <b>Xabar:</b> ${message.text || '[Media]'}`;

  const opt = { 
    parse_mode: 'HTML', 
    reply_markup: { 
      inline_keyboard: [
        [{ text: "🔗 Akkauntga kirish", url: `tg://user?id=${sender.id}` }],
        [{ text: "💬 Javob berish", callback_data: `reply_to:${sender.id}` }]
      ]
    }
  };

  try {
    if (message.text) await bot.sendMessage(ADMIN_ID, logText, opt);
    else await bot.copyMessage(ADMIN_ID, sender.id, message.message_id, { ...opt, caption: logText });
  } catch (e) {}
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text || '';

  if (text === '/myid') return bot.sendMessage(chatId, `ID: <code>${chatId}</code>`, { parse_mode: 'HTML' });

  if (text.startsWith('/start')) {
    db.users[chatId] = { id: chatId, name: msg.from.first_name, username: msg.from.username, joinedAt: new Date().toISOString() };
    saveDB(db);
    
    if (!(await isSubscribed(chatId))) {
      return bot.sendMessage(chatId, "⚠️ <b>Botdan foydalanish uchun kanalga a'zo bo'ling!</b>", {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: "📢 Kanal", url: "https://t.me/m27_Anonim" }], [{ text: "✅ Tekshirish", callback_data: "check_sub" }]] }
      });
    }

    if (chatId === ADMIN_ID) {
      return bot.sendMessage(chatId, "👋 <b>Admin paneli:</b>", {
        reply_markup: { keyboard: [["📊 Statistika", "📢 Xabar yuborish"], ["👤 Foydalanuvchilar", "🚫 Bloklar"]], resize_keyboard: true }
      });
    }

    const startParam = text.split(' ')[1];
    if (startParam && startParam !== chatId) {
      db.userStates[chatId] = { targetId: startParam };
      saveDB(db);
      return bot.sendMessage(chatId, "✍️ <b>Xabaringizni yozing...</b>", { parse_mode: 'HTML' });
    }

    const myLink = `https://t.me/m27_AnonimBot?start=${chatId}`;
    return bot.sendMessage(chatId, `👋 Salom <b>${msg.from.first_name}</b>!\n\n🔗 Havolangiz:\n<code>${myLink}</code>`, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: "📤 Ulashish", url: `https://t.me/share/url?url=${encodeURIComponent(myLink)}` }]] }
    });
  }

  if (chatId === ADMIN_ID) {
    if (text === '📊 Statistika') return bot.sendMessage(chatId, `📊 <b>Statistika:</b>\n\n👤 Foydalanuvchilar: ${Object.keys(db.users).length}\n✉️ Xabarlar: ${Object.keys(db.replyMap).length}`, { parse_mode: 'HTML' });
    if (text === '📢 Xabar yuborish') {
      db.userStates[chatId] = { adminAction: 'broadcast' };
      saveDB(db);
      return bot.sendMessage(chatId, "📢 <b>Broadcasting:</b> Xabarni yozing.");
    }
    if (text === '👤 Foydalanuvchilar') {
      const users = Object.values(db.users);
      if (users.length === 0) return bot.sendMessage(chatId, "Bazada foydalanuvchilar yo'q.");
      const buttons = users.map(u => [{ text: `👤 ${u.name}`, callback_data: `view_user:${u.id}` }]);
      return bot.sendMessage(chatId, "👥 <b>Bot foydalanuvchilari:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
    }
    if (text === '🚫 Bloklar') {
      let list = "🚫 <b>Bloklar:</b>\n\n";
      Object.keys(db.users).forEach(uid => {
        if (db.users[uid].blocked) list += `👤 ${db.users[uid].name} bloklaganlar: ${db.users[uid].blocked.length} ta\n`;
      });
      return bot.sendMessage(chatId, list || "Bloklar yo'q.", { parse_mode: 'HTML' });
    }
  }

  if (chatId !== ADMIN_ID && hasProfanity(text)) return bot.sendMessage(chatId, "🚫 So'kinmang!", { parse_mode: 'HTML' });

  if (msg.reply_to_message) {
    const targetUserId = db.replyMap[`${chatId}:${msg.reply_to_message.message_id}`];
    if (targetUserId) {
      try {
        const targetReplyToId = db.messageLinker[`${targetUserId}:${msg.reply_to_message.message_id}`];
        const opt = { reply_to_message_id: targetReplyToId, parse_mode: 'HTML' };
        let sent = msg.text ? await bot.sendMessage(targetUserId, `💬 <b>Yangi javob!</b>\n\n${msg.text}\n\n<i>Javob uchun suring.</i>`, opt) : await bot.copyMessage(targetUserId, chatId, msg.message_id, { ...opt, caption: `💬 <b>Yangi javob!</b>` });
        db.replyMap[`${targetUserId}:${sent.message_id}`] = chatId;
        db.messageLinker[`${chatId}:${sent.message_id}`] = msg.reply_to_message.message_id;
        saveDB(db);
        logToAdmin(msg.from, targetUserId, msg, true);
        return bot.sendMessage(chatId, "✅ Yuborildi.");
      } catch (e) { return bot.sendMessage(chatId, "❌ Xato."); }
    }
  }

  const state = db.userStates[chatId];
  if (state) {
    if (state.adminAction === 'broadcast' && chatId === ADMIN_ID) {
      const users = Object.keys(db.users);
      let count = 0;
      for (const u of users) { try { if (u !== ADMIN_ID) { await bot.copyMessage(u, chatId, msg.message_id); count++; } } catch (e) {} }
      delete db.userStates[chatId];
      saveDB(db);
      return bot.sendMessage(chatId, `✅ Xabar ${count} kishiga yuborildi.`);
    }
    if (state.targetId) {
      const targetId = state.targetId;
      if (db.users[targetId]?.blocked?.includes(chatId)) return bot.sendMessage(chatId, "⚠️ Siz bloklangansiz.");
      try {
        const opt = { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🚫 Bloklash", callback_data: `block_user:${chatId}` }, { text: "💬 Javob berish", callback_data: `reply_to:${chatId}` }]] } };
        let sent = msg.text ? await bot.sendMessage(targetId, `💎 <b>Yangi anonim xabar!</b>\n\n${msg.text}\n\n<i>Javob uchun suring.</i>`, opt) : await bot.copyMessage(targetId, chatId, msg.message_id, { ...opt, caption: `💎 <b>Yangi anonim xabar!</b>` });
        db.replyMap[`${targetId}:${sent.message_id}`] = chatId;
        db.messageLinker[`${chatId}:${sent.message_id}`] = msg.message_id;
        delete db.userStates[chatId];
        saveDB(db);
        logToAdmin(msg.from, targetId, msg, false);
        return bot.sendMessage(chatId, "✅ Yuborildi.");
      } catch (e) { return bot.sendMessage(chatId, "❌ Xatolik."); }
    }
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id.toString();
  const data = query.data;
  if (data === "check_sub") {
    if (await isSubscribed(chatId)) {
        await bot.deleteMessage(chatId, query.message.message_id);
        return bot.sendMessage(chatId, "✅ Tasdiqlandi! /start bosing.");
    }
  } else if (data.startsWith("view_user:")) {
    const uId = data.split(":")[1];
    const u = db.users[uId];
    if (u) {
        const info = `👤 <b>Foydalanuvchi ma'lumotlari:</b>\n\n` +
                     `🆔 <b>ID:</b> <code>${u.id}</code>\n` +
                     `👤 <b>Ism:</b> ${u.name}\n` +
                     `🌐 <b>Username:</b> ${u.username ? '@'+u.username : 'Mavjud emas'}\n` +
                     `📅 <b>Qo'shilgan vaqti:</b> ${new Date(u.joinedAt).toLocaleString()}`;
        bot.sendMessage(chatId, info, { 
            parse_mode: 'HTML', 
            reply_markup: { inline_keyboard: [[{ text: "🔗 Profilga kirish", url: `tg://user?id=${u.id}` }]] } 
        });
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
    bot.sendMessage(chatId, "✍️ <b>Javobingizni yozing...</b>", { parse_mode: 'HTML', reply_markup: { force_reply: true } });
  }
  bot.answerCallbackQuery(query.id);
});

app.get('/', (req, res) => res.send('OK'));
app.listen(process.env.PORT || 3000);
