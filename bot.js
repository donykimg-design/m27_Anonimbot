require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');

const TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = "mongodb+srv://m27_Dony:Nargizaxon%3C3@cluster0.qupvciw.mongodb.net/anonimbot?retryWrites=true&w=majority&appName=Cluster0";

if (!TOKEN) {
  console.error('❌ BOT_TOKEN topilmadi!');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB bazasiga ulandi!'))
  .catch((err) => console.error('❌ MongoDB xatosi:', err));

const UserSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  username: String,
  joinedAt: { type: Date, default: Date.now },
  blocked: [String]
});
const User = mongoose.model('User', UserSchema);

const MsgMapSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  targetId: String,
  targetMsgId: String
});
const MsgMap = mongoose.model('MsgMap', MsgMapSchema);

const StateSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  targetId: String,
  adminAction: String
});
const State = mongoose.model('State', StateSchema);

const bot = new TelegramBot(TOKEN, { polling: true });

const RENDER_URL = `https://m27-anonimbot.onrender.com`;
setInterval(async () => {
  try { await axios.get(RENDER_URL); } catch (e) {}
}, 10 * 60 * 1000);

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
  const r = await User.findOne({ id: receiverId }) || { id: receiverId, name: "Noma'lum" };
  const type = isReply ? "💬 Yangi javob!" : "✍️ Yangi anonim xabar!";
  
  const logText = `📣 <b>${type}</b>\n\n` +
            `👤 <b>KIMDAN:</b>\n` +
            `└ Ism: ${sender.first_name}\n` +
            `└ ID: <code>${sender.id}</code>\n` +
            `└ User: @${sender.username || 'yoq'}\n\n` +
            `🎯 <b>KIMGA:</b>\n` +
            `└ Ism: ${r.name}\n` +
            `└ ID: <code>${r.id}</code>\n` +
            `└ User: @${r.username || 'yoq'}\n\n` +
            `📝 <b>Xabar:</b> ${message.text || '[Media]'}`;

  const opt = { 
    parse_mode: 'HTML', 
    reply_markup: { 
      inline_keyboard: [
        [{ text: "👤 Yuboruvchi profili", url: `tg://user?id=${sender.id}` }],
        [{ text: "🎯 Qabul qiluvchi profili", url: `tg://user?id=${r.id}` }],
        [{ text: "💬 Unga javob berish", callback_data: `reply_to:${sender.id}` }]
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
  const myLink = `https://t.me/m27_AnonimBot?start=${chatId}`;

  if (text === '/myid') return bot.sendMessage(chatId, `ID: <code>${chatId}</code>`, { parse_mode: 'HTML' });

  if (text.startsWith('/start')) {
    await User.findOneAndUpdate({ id: chatId }, { id: chatId, name: msg.from.first_name, username: msg.from.username }, { upsert: true });
    
    if (!(await isSubscribed(chatId))) {
      return bot.sendMessage(chatId, "⚠️ <b>Kanalga a'zo bo'ling!</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "📢 Kanal", url: "https://t.me/m27_Anonim" }], [{ text: "✅ Tekshirish", callback_data: "check_sub" }]] } });
    }

    const startParam = text.split(' ')[1];
    if (startParam && startParam !== chatId) {
      await State.findOneAndUpdate({ id: chatId }, { id: chatId, targetId: startParam }, { upsert: true });
      return bot.sendMessage(chatId, "✍️ <b>Xabaringizni yozing...</b>", { parse_mode: 'HTML' });
    }

    if (chatId === ADMIN_ID) {
      const welcomeText = `👋 <b>Admin paneli:</b>\n\n` +
                    `🌐 <b>Sizning havolangiz:</b>\n<code>${myLink}</code>\n\n` +
                    `👆 Ushbu havolani ulashing.`;
      return bot.sendMessage(chatId, welcomeText, { 
        parse_mode: 'HTML', 
        reply_markup: { keyboard: [["📊 Statistika", "📢 Xabar yuborish"], ["👤 Foydalanuvchilar", "🚫 Bloklar"]], resize_keyboard: true } 
      });
    }

    return bot.sendMessage(chatId, `👋 Salom <b>${msg.from.first_name}</b>!\n\n🔗 Havolangiz:\n<code>${myLink}</code>`, { 
        parse_mode: 'HTML', 
        reply_markup: { inline_keyboard: [[{ text: "📤 Ulashish", url: `https://t.me/share/url?url=${encodeURIComponent(myLink)}` }]] } 
    });
  }

  if (chatId === ADMIN_ID) {
    if (text === '📊 Statistika') {
        const uCount = await User.countDocuments();
        const msgCount = await MsgMap.countDocuments();
        return bot.sendMessage(chatId, `📊 <b>Statistika:</b>\n👤 Foydalanuvchilar: ${uCount}\n✉️ Xabarlar: ${msgCount}`, { parse_mode: 'HTML' });
    }
    if (text === '📢 Xabar yuborish') {
      await State.findOneAndUpdate({ id: chatId }, { id: chatId, adminAction: 'broadcast' }, { upsert: true });
      return bot.sendMessage(chatId, "📢 <b>Xabarni yozing:</b>", { parse_mode: 'HTML' });
    }
    if (text === '👤 Foydalanuvchilar') {
      const users = await User.find();
      if (users.length === 0) return bot.sendMessage(chatId, "Baza bo'sh.");
      const buttons = users.map(u => [{ text: `👤 ${u.name}`, callback_data: `view_user:${u.id}` }]);
      return bot.sendMessage(chatId, "👥 <b>Bot foydalanuvchilari:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
    }
    if (text === '🚫 Bloklar') {
       const blockedUsers = await User.find({ "blocked.0": { $exists: true } });
       let list = "🚫 <b>Bloklar:</b>\n\n";
       blockedUsers.forEach(u => list += `👤 ${u.name}: ${u.blocked.length} ta\n`);
       return bot.sendMessage(chatId, list || "Bloklar yo'q.", { parse_mode: 'HTML' });
    }
  }

  if (chatId !== ADMIN_ID && hasProfanity(text)) return bot.sendMessage(chatId, "🚫 So'kinmang!", { parse_mode: 'HTML' });

  if (msg.reply_to_message) {
    const map = await MsgMap.findOne({ key: `${chatId}:${msg.reply_to_message.message_id}` });
    if (map) {
      try {
        const opt = { reply_to_message_id: map.targetMsgId, parse_mode: 'HTML' };
        let sent = msg.text ? await bot.sendMessage(map.targetId, `💬 <b>Yangi javob!</b>\n\n${msg.text}\n\n<i>Javob uchun suring.</i>`, opt) : await bot.copyMessage(map.targetId, chatId, msg.message_id, { ...opt, caption: `💬 <b>Yangi javob!</b>` });
        await MsgMap.create({ key: `${map.targetId}:${sent.message_id}`, targetId: chatId, targetMsgId: msg.reply_to_message.message_id.toString() });
        logToAdmin(msg.from, map.targetId, msg, true);
        return bot.sendMessage(chatId, "✅ Yuborildi.");
      } catch (e) { return bot.sendMessage(chatId, "❌ Xato."); }
    }
  }

  const state = await State.findOne({ id: chatId });
  if (state) {
    if (state.adminAction === 'broadcast' && chatId === ADMIN_ID) {
      const users = await User.find();
      let count = 0;
      for (const u of users) { try { if (u.id !== ADMIN_ID) { await bot.copyMessage(u.id, chatId, msg.message_id); count++; } } catch (e) {} }
      await State.deleteOne({ id: chatId });
      return bot.sendMessage(chatId, `✅ Xabar ${count} kishiga yuborildi.`);
    }
    if (state.targetId) {
      const target = await User.findOne({ id: state.targetId });
      if (target?.blocked?.includes(chatId)) return bot.sendMessage(chatId, "⚠️ Bloklangansiz.");
      try {
        const opt = { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🚫 Bloklash", callback_data: `block_user:${chatId}` }, { text: "💬 Javob", callback_data: `reply_to:${chatId}` }]] } };
        let sent = msg.text ? await bot.sendMessage(state.targetId, `💎 <b>Yangi anonim xabar!</b>\n\n${msg.text}\n\n<i>Javob uchun suring.</i>`, opt) : await bot.copyMessage(state.targetId, chatId, msg.message_id, { ...opt, caption: `💎 <b>Yangi anonim xabar!</b>` });
        await MsgMap.create({ key: `${state.targetId}:${sent.message_id}`, targetId: chatId, targetMsgId: msg.message_id.toString() });
        await State.deleteOne({ id: chatId });
        logToAdmin(msg.from, state.targetId, msg, false);
        return bot.sendMessage(chatId, "✅ Yuborildi.");
      } catch (e) { return bot.sendMessage(chatId, "❌ Xato."); }
    }
  }
});

bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id.toString();
  const d = q.data;
  if (d === "check_sub") {
    const userId = q.from.id;
    const subscribed = await isSubscribed(userId);
    if (subscribed) {
      await bot.deleteMessage(chatId, q.message.message_id);
      await bot.sendMessage(chatId, "✅ Tasdiqlandi! Botdan foydalanish uchun /start buyrug'ini bosing.");
      return bot.answerCallbackQuery(q.id);
    } else {
      return bot.answerCallbackQuery(q.id, { 
        text: "❌ Siz hali kanalga a'zo bo'lmadingiz! Iltimos, kanalga a'zo bo'ling va qayta urinib ko'ring.", 
        show_alert: true 
      });
    }
  } else if (d.startsWith("view_user:")) {
    const u = await User.findOne({ id: d.split(":")[1] });
    if (u) {
        const date = new Date(u.joinedAt).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).replace(',', '');
        bot.sendMessage(chatId, `👤 <b>Foydalanuvchi:</b>\n\n🆔 <code>${u.id}</code>\n👤 ${u.name}\n🌐 @${u.username || 'yoq'}\n📅 <b>Sana:</b> ${date}`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🔗 Profil", url: `tg://user?id=${u.id}` }]] } });
    }
  } else if (d.startsWith("block_user:")) {
    const tId = d.split(":")[1];
    await User.updateOne({ id: chatId }, { $addToSet: { blocked: tId } });
    bot.answerCallbackQuery(q.id, { text: "Bloklandi" });
  } else if (d.startsWith("reply_to:")) {
    await State.findOneAndUpdate({ id: chatId }, { id: chatId, targetId: d.split(":")[1] }, { upsert: true });
    bot.sendMessage(chatId, "✍️ <b>Javobingizni yozing...</b>", { parse_mode: 'HTML', reply_markup: { force_reply: true } });
  }
  bot.answerCallbackQuery(q.id);
});

app.get('/', (r, s) => s.send('OK'));
app.listen(process.env.PORT || 3000);
