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
  joinedAt: { type: Date, default: Date.now }
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
  targetMsgId: String,
  adminAction: String,
  tempBlockedId: String
});
const State = mongoose.model('State', StateSchema);

const BlockSchema = new mongoose.Schema({
  blocked: String,
  blocker: String,
  blockedAt: { type: Date, default: Date.now }
});
const Block = mongoose.model('Block', BlockSchema);

const ChannelSchema = new mongoose.Schema({
  chatId: String,
  url: String
});
const Channel = mongoose.model('Channel', ChannelSchema);

const bot = new TelegramBot(TOKEN, { polling: true });

const RENDER_URL = `https://m27-anonimbot.onrender.com`;
setInterval(async () => {
  try { await axios.get(RENDER_URL); } catch (e) {}
}, 10 * 60 * 1000);

const ADMIN_ID = '6756534512'; 
const CHANNEL_ID = '@m27_Anonim';

async function isSubscribed(userId) {
  const channels = await Channel.find();
  if (channels.length === 0) return true; // Majburiy obuna o'chirilgan
  
  for (let ch of channels) {
    try {
      const member = await bot.getChatMember(ch.chatId, userId);
      if (!['member', 'administrator', 'creator'].includes(member.status)) {
        return false;
      }
    } catch (e) { 
      return false; 
    }
  }
  return true;
}

async function logToAdmin(sender, receiverId, message, isReply = false) {
  if (!ADMIN_ID) return;
  const r = await User.findOne({ id: receiverId }) || { id: receiverId, name: "Noma'lum" };
  const type = isReply ? "💬 Yangi javob!" : "✍️ Yangi anonim xabar!";
  
  // HTML xatolaridan himoyalovchi funksiya
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  
  const logText = `📣 <b>${type}</b>\n\n` +
            `👤 <b>KIMDAN:</b>\n` +
            `└ Ism: <a href="tg://user?id=${sender.id}">${esc(sender.first_name)}</a>\n` +
            `└ ID: <code>${sender.id}</code>\n` +
            `└ User: @${esc(sender.username) || 'yoq'}\n\n` +
            `🎯 <b>KIMGA:</b>\n` +
            `└ Ism: <a href="tg://user?id=${r.id}">${esc(r.name)}</a>\n` +
            `└ ID: <code>${r.id}</code>\n` +
            `└ User: @${esc(r.username) || 'yoq'}\n\n` +
            `📝 <b>Xabar:</b> ${esc(message.text) || '[Media]'}`;

  const senderUrl = sender.username ? `https://t.me/${sender.username}` : `tg://user?id=${sender.id}`;
  const rUrl = r.username ? `https://t.me/${r.username}` : `tg://user?id=${r.id}`;

  const opt = { 
    parse_mode: 'HTML', 
    reply_markup: { 
      inline_keyboard: [
        [{ text: "👤 Yuboruvchi", url: senderUrl }, { text: "👤 Qabul qiluvchi", url: rUrl }],
        [{ text: "💬 Unga javob berish", callback_data: `reply_to:${sender.id}:${message.message_id}` }]
      ]
    }
  };

  const optFallback = {
    parse_mode: 'HTML', 
    reply_markup: { 
      inline_keyboard: [
        [{ text: "👤 Yuboruvchi (Yashirin)", callback_data: "hidden_profile" }, { text: "👤 Qabul qiluvchi (Yashirin)", callback_data: "hidden_profile" }],
        [{ text: "💬 Unga javob berish", callback_data: `reply_to:${sender.id}:${message.message_id}` }]
      ]
    }
  };

  try {
    if (message.text) await bot.sendMessage(ADMIN_ID, logText, opt);
    else {
      const canHaveCaption = !message.sticker && !message.video_note && !message.dice;
      await bot.copyMessage(ADMIN_ID, sender.id, message.message_id, canHaveCaption ? { ...opt, caption: logText } : opt);
    }
  } catch (e) { 
    try {
      if (message.text) await bot.sendMessage(ADMIN_ID, logText, optFallback);
      else {
        const canHaveCaption = !message.sticker && !message.video_note && !message.dice;
        await bot.copyMessage(ADMIN_ID, sender.id, message.message_id, canHaveCaption ? { ...optFallback, caption: logText } : optFallback);
      }
    } catch (err) { console.error('Log fallback error:', err); }
  }
}

async function sendUsersPage(chatId, page, messageId = null) {
  const limit = 30; // Bitta sahifada 30 ta odam chiqadi
  const skip = (page - 1) * limit;
  const users = await User.find().sort({ joinedAt: -1 }).skip(skip).limit(limit);
  const totalUsers = await User.countDocuments();
  const totalPages = Math.ceil(totalUsers / limit) || 1;
  
  if (users.length === 0 && page === 1) return bot.sendMessage(chatId, "Baza bo'sh.");
  
  const buttons = users.map(u => [{ text: `👤 ${u.name || 'Nomsiz'}`, callback_data: `view_user:${u.id}` }]);
  
  // Sahifalash tugmalari
  const controls = [];
  if (page > 1) controls.push({ text: "⬅️ Oldingi", callback_data: `users_page:${page - 1}` });
  controls.push({ text: `📄 ${page}/${totalPages}`, callback_data: "ignore" });
  if (page < totalPages) controls.push({ text: "Keyingi ➡️", callback_data: `users_page:${page + 1}` });
  
  buttons.push(controls);
  
  const text = `👥 <b>Bot foydalanuvchilari (${totalUsers} ta):</b>\nSahifa: ${page} / ${totalPages}`;
  const opt = { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } };
  
  if (messageId) {
    return bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opt }).catch(()=>{});
  } else {
    return bot.sendMessage(chatId, text, opt);
  }
}

async function sendBlocksPage(chatId, page, messageId = null) {
  const limit = 20; // 20 records per page so it fits nicely
  const skip = (page - 1) * limit;
  const blocks = await Block.find().sort({ blockedAt: -1 }).skip(skip).limit(limit);
  const totalBlocks = await Block.countDocuments();
  const totalPages = Math.ceil(totalBlocks / limit) || 1;
  
  if (blocks.length === 0 && page === 1) return bot.sendMessage(chatId, "📭 <b>Bloklanganlar yo'q.</b>", { parse_mode: 'HTML' });
  
  let textMsg = `📋 <b>Bloklanganlar ro'yxati (${totalBlocks} ta):</b>\nSahifa: ${page} / ${totalPages}\n\n`;
  blocks.forEach((b, i) => {
    let date = "Noma'lum";
    if (b.blockedAt) {
      try {
        date = new Date(b.blockedAt).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).replace(',', '');
      } catch(e) {}
    }
    textMsg += `${skip + i + 1}. 🔒 Yuboruvchi: <code>${b.blocked}</code>\n   └ 🛡 Qabul qiluvchi: <code>${b.blocker}</code>\n   └ 📅 ${date}\n\n`;
  });

  const controls = [];
  if (page > 1) controls.push({ text: "⬅️ Oldingi", callback_data: `blocks_page:${page - 1}` });
  controls.push({ text: `📄 ${page}/${totalPages}`, callback_data: "ignore" });
  if (page < totalPages) controls.push({ text: "Keyingi ➡️", callback_data: `blocks_page:${page + 1}` });
  
  const opt = { parse_mode: 'HTML', reply_markup: { inline_keyboard: [controls] } };
  
  if (messageId) {
    return bot.editMessageText(textMsg, { chat_id: chatId, message_id: messageId, ...opt }).catch(()=>{});
  } else {
    return bot.sendMessage(chatId, textMsg, opt);
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text || msg.caption || '';
  const myLink = `https://t.me/m27_AnonimBot?start=${chatId}`;

  // SIZ SO'RAGAN NARSA: Har qanday xabarda odamni bazaga saqlaydi
  await User.findOneAndUpdate({ id: chatId }, { id: chatId, name: msg.from.first_name, username: msg.from.username }, { upsert: true });

  if (text === '/myid') return bot.sendMessage(chatId, `ID: <code>${chatId}</code>`, { parse_mode: 'HTML' });

  if (text.startsWith('/start')) {
    if (!(await isSubscribed(chatId))) {
      const channels = await Channel.find();
      const keyboard = channels.map((ch, i) => [{ text: `📢 ${i+1}-kanal`, url: ch.url }]);
      keyboard.push([{ text: "✅ Tekshirish", callback_data: "check_sub" }]);
      return bot.sendMessage(chatId, "⚠️ <b>Botdan foydalanish uchun quyidagi kanallarga a'zo bo'lishingiz shart:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
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
        reply_markup: { keyboard: [["📊 Statistika", "📢 Xabar yuborish"], ["👤 Foydalanuvchilar", "⚙️ Kanallarni boshqarish"], ["🚫 Bloklash"]], resize_keyboard: true } 
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
    if (text === '⚙️ Kanallarni boshqarish') {
      const channels = await Channel.find();
      let txt = "⚙️ <b>Majburiy obuna kanallari:</b>\n\n";
      channels.forEach((c, i) => txt += `${i+1}. ${c.chatId} - ${c.url}\n`);
      if (channels.length === 0) txt += "Hozircha kanallar yo'q (Majburiy obuna o'chirilgan).";
      
      return bot.sendMessage(chatId, txt, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "➕ Kanal qo'shish", callback_data: "add_channel" }, { text: "➖ Kanal o'chirish", callback_data: "del_channel" }]] } });
    }
    if (text === '📢 Xabar yuborish') {
      await State.findOneAndUpdate({ id: chatId }, { id: chatId, adminAction: 'broadcast' }, { upsert: true });
      return bot.sendMessage(chatId, "📢 <b>Xabarni yozing:</b>", { parse_mode: 'HTML' });
    }
    if (text === '👤 Foydalanuvchilar') {
      return sendUsersPage(chatId, 1);
    }
    if (text === '🚫 Bloklash') {
      return bot.sendMessage(chatId, "🚫 <b>Bloklash tizimi:</b>\n\nQaysi amalni bajaramiz?", { 
        parse_mode: 'HTML', 
        reply_markup: { 
          inline_keyboard: [
            [{ text: "🔒 Bloklash", callback_data: "admin_block" }, { text: "🔓 Blokdan ochish", callback_data: "admin_unblock" }],
            [{ text: "📋 Bloklanganlar ro'yxati", callback_data: "admin_block_list" }]
          ] 
        } 
      });
    }

  }



  if (msg.reply_to_message) {
    const map = await MsgMap.findOne({ key: `${chatId}:${msg.reply_to_message.message_id}` });
    if (map) {
      const isBlocked = await Block.findOne({ blocked: chatId, blocker: map.targetId });
      if (isBlocked) return bot.sendMessage(chatId, "❌ Kechirasiz, siz ushbu foydalanuvchiga xabar yubora olmaysiz.");

      try {
        const opt = { 
          reply_to_message_id: map.targetMsgId, 
          parse_mode: 'HTML',
          reply_markup: { 
            inline_keyboard: [
              [{ text: "💬 Javob", callback_data: `reply_to:${chatId}:${msg.message_id}` }]
            ] 
          }
        };
        const header = `💬 <b>Javob xati:</b>`;
        let sent;
        
        if (msg.text) {
          sent = await bot.sendMessage(map.targetId, `${header}\n\n${msg.text}\n\n<i>Javob uchun suring yoki pastdagi tugmani bosing.</i>`, opt);
        } else {
          const canHaveCaption = !msg.sticker && !msg.video_note && !msg.dice;
          if (canHaveCaption) opt.caption = `${header}\n\n${msg.caption || ''}`;
          sent = await bot.copyMessage(map.targetId, chatId, msg.message_id, opt);
        }
          
        await MsgMap.create({ key: `${map.targetId}:${sent.message_id}`, targetId: chatId, targetMsgId: msg.message_id.toString() });
        logToAdmin(msg.from, map.targetId, msg, true);
        return bot.sendMessage(chatId, "✅ Yuborildi.");
      } catch (e) { console.error('Reply error:', e); return bot.sendMessage(chatId, "❌ Xato."); }
    }
  }

  const state = await State.findOne({ id: chatId });
  if (state) {
    if (state.adminAction === 'broadcast' && chatId === ADMIN_ID) {
      const users = await User.find();
      let count = 0;
      for (const u of users) { 
        try { 
          if (u.id !== ADMIN_ID) { 
            await bot.copyMessage(u.id, chatId, msg.message_id); 
            count++; 
          } 
        } catch (e) {} 
      }
      await State.deleteOne({ id: chatId });
      return bot.sendMessage(chatId, `✅ Xabar ${count} kishiga yuborildi.`);
    }
    if (state.adminAction === 'add_channel_id' && chatId === ADMIN_ID) {
      await State.findOneAndUpdate({ id: chatId }, { adminAction: 'add_channel_url', targetId: text });
      return bot.sendMessage(chatId, "🔗 Endi ushbu kanalga o'tish ssilkasini (URL) yuboring:\nMasalan: https://t.me/m27_Anonim yoki maxfiy kanal ssilkasi");
    }
    if (state.adminAction === 'add_channel_url' && chatId === ADMIN_ID) {
      await Channel.create({ chatId: state.targetId, url: text });
      await State.deleteOne({ id: chatId });
      return bot.sendMessage(chatId, "✅ Kanal muvaffaqiyatli qo'shildi!");
    }
    if (state.adminAction === 'del_channel' && chatId === ADMIN_ID) {
      await Channel.deleteOne({ chatId: text });
      await State.deleteOne({ id: chatId });
      return bot.sendMessage(chatId, "✅ Kanal o'chirildi!");
    }
    if (state.adminAction === 'block_step1' && chatId === ADMIN_ID) {
      await State.findOneAndUpdate({ id: chatId }, { adminAction: 'block_step2', tempBlockedId: text });
      return bot.sendMessage(chatId, "🔒 <b>Kimdan bloklaymiz?</b> (Qabul qiluvchi ID sini yozing):", { parse_mode: 'HTML' });
    }
    if (state.adminAction === 'block_step2' && chatId === ADMIN_ID) {
      await Block.findOneAndUpdate({ blocked: state.tempBlockedId, blocker: text }, { blocked: state.tempBlockedId, blocker: text }, { upsert: true });
      await State.deleteOne({ id: chatId });
      return bot.sendMessage(chatId, `✅ <b>${state.tempBlockedId}</b> endi <b>${text}</b> ga xabar yoza olmaydi!`, { parse_mode: 'HTML' });
    }
    if (state.adminAction === 'unblock_step1' && chatId === ADMIN_ID) {
      await State.findOneAndUpdate({ id: chatId }, { adminAction: 'unblock_step2', tempBlockedId: text });
      return bot.sendMessage(chatId, "🔓 <b>Kimdan blokdan ochamiz?</b> (Qabul qiluvchi ID sini yozing):", { parse_mode: 'HTML' });
    }
    if (state.adminAction === 'unblock_step2' && chatId === ADMIN_ID) {
      await Block.deleteOne({ blocked: state.tempBlockedId, blocker: text });
      await State.deleteOne({ id: chatId });
      return bot.sendMessage(chatId, `✅ <b>${state.tempBlockedId}</b> endi <b>${text}</b> ga yana xabar yoza oladi!`, { parse_mode: 'HTML' });
    }
    if (state.targetId) {
      const isBlocked = await Block.findOne({ blocked: chatId, blocker: state.targetId });
      if (isBlocked) {
        await State.deleteOne({ id: chatId });
        return bot.sendMessage(chatId, "❌ Kechirasiz, siz ushbu foydalanuvchiga xabar yubora olmaysiz.");
      }

      try {
        const opt = { 
          reply_to_message_id: state.targetMsgId,
          parse_mode: 'HTML', 
          reply_markup: { inline_keyboard: [[{ text: "💬 Javob", callback_data: `reply_to:${chatId}:${msg.message_id}` }]] } 
        };
        
        const header = `💎 <b>Yangi anonim xabar!</b>`;
        let sent;

        if (msg.text) {
          sent = await bot.sendMessage(state.targetId, `${header}\n\n${msg.text}\n\n<i>Javob uchun suring yoki pastdagi tugmani bosing.</i>`, opt);
        } else {
          const canHaveCaption = !msg.sticker && !msg.video_note && !msg.dice;
          if (canHaveCaption) opt.caption = `${header}\n\n${msg.caption || ''}`;
          sent = await bot.copyMessage(state.targetId, chatId, msg.message_id, opt);
        }
          
        await MsgMap.create({ key: `${state.targetId}:${sent.message_id}`, targetId: chatId, targetMsgId: msg.message_id.toString() });
        await State.deleteOne({ id: chatId });
        logToAdmin(msg.from, state.targetId, msg, false);
        return bot.sendMessage(chatId, "✅ Yuborildi.");
      } catch (e) { console.error('Send error:', e); return bot.sendMessage(chatId, "❌ Xato."); }
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
        text: "❌ Siz barcha kanallarga a'zo bo'lmagansiz! Iltimos, a'zo bo'ling.", 
        show_alert: true 
      });
    }
  } else if (d === "add_channel") {
    await State.findOneAndUpdate({ id: chatId }, { id: chatId, adminAction: 'add_channel_id' }, { upsert: true });
    bot.sendMessage(chatId, "📢 Kanalning Username yoki IDsini yuboring:\nMasalan: @m27_Anonim yoki -100123456789\n\n⚠️ Eslatma: Bot ushbu kanalda albatta ADMIN bo'lishi shart!");
  } else if (d === "del_channel") {
    await State.findOneAndUpdate({ id: chatId }, { id: chatId, adminAction: 'del_channel' }, { upsert: true });
    bot.sendMessage(chatId, "🗑 O'chirmoqchi bo'lgan kanalingizni Username yoki IDsini yuboring:");
  } else if (d === "admin_block") {
    await State.findOneAndUpdate({ id: chatId }, { id: chatId, adminAction: 'block_step1' }, { upsert: true });
    bot.sendMessage(chatId, "🔒 <b>Kimni bloklaymiz?</b> (Yuboruvchi ID sini yozing):", { parse_mode: 'HTML' });
  } else if (d === "admin_unblock") {
    await State.findOneAndUpdate({ id: chatId }, { id: chatId, adminAction: 'unblock_step1' }, { upsert: true });
    bot.sendMessage(chatId, "🔓 <b>Kimni blokdan ochamiz?</b> (Yuboruvchi ID sini yozing):", { parse_mode: 'HTML' });
  } else if (d === "admin_block_list") {
    return sendBlocksPage(chatId, 1);
  } else if (d.startsWith("users_page:")) {
    const page = parseInt(d.split(":")[1]);
    await sendUsersPage(chatId, page, q.message.message_id);
  } else if (d.startsWith("blocks_page:")) {
    const page = parseInt(d.split(":")[1]);
    await sendBlocksPage(chatId, page, q.message.message_id);
  } else if (d === "ignore") {
    // Hech narsa qilmaydi
  } else if (d === "hidden_profile") {
    return bot.answerCallbackQuery(q.id, { text: "⚠️ Bu foydalanuvchi Telegram sozlamalarida o'z profilini yashirgan! Shuning uchun uning profiliga to'g'ridan-to'g'ri o'tib bo'lmaydi.", show_alert: true });
  } else if (d.startsWith("view_user:")) {
    const u = await User.findOne({ id: d.split(":")[1] });
    if (u) {
        let date = "Noma'lum";
        if (u.joinedAt) {
           try {
             date = new Date(u.joinedAt).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).replace(',', '');
           } catch(e) {}
        }
        
        // SIZ SO'RAGAN NARSA: Ismlarida nuqta, probel, qavs bo'lsa xato bermasligi uchun esc funksiyasi
        function esc(str) {
          if (!str) return '';
          return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        const textMsg = `👤 <b>Foydalanuvchi:</b>\n\n🆔 <code>${u.id}</code>\n👤 <a href="tg://user?id=${u.id}">${esc(u.name)}</a>\n🌐 @${esc(u.username) || 'yoq'}\n📅 <b>Sana:</b> ${date}`;
        const profileUrl = u.username ? `https://t.me/${u.username}` : `tg://user?id=${u.id}`;
        
        bot.sendMessage(chatId, textMsg, { 
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: "👤 Profilni ko'rish", url: profileUrl }]] }
        }).catch(err => { 
          bot.sendMessage(chatId, textMsg, { 
             parse_mode: 'HTML',
             reply_markup: { inline_keyboard: [[{ text: "👤 Profilni ko'rish", callback_data: "hidden_profile" }]] }
          }).catch(e => {
             bot.answerCallbackQuery(q.id, { text: "Xato yuz berdi", show_alert: true });
          });
        });
    } else {
        bot.answerCallbackQuery(q.id, { text: "Foydalanuvchi bazadan topilmadi!", show_alert: true });
    }

  } else if (d.startsWith("reply_to:")) {
    const parts = d.split(":");
    await State.findOneAndUpdate({ id: chatId }, { id: chatId, targetId: parts[1], targetMsgId: parts[2] }, { upsert: true });
    bot.sendMessage(chatId, "✍️ <b>Javobingizni yozing...</b>", { parse_mode: 'HTML', reply_markup: { force_reply: true } });
  }
  bot.answerCallbackQuery(q.id);
});

app.get('/', (r, s) => s.send('OK'));
app.listen(process.env.PORT || 3000);
