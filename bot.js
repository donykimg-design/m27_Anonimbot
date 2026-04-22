require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ BOT_TOKEN topilmadi!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const axios = require('axios');

// ============================================================
//  🚀 KEEP ALIVE - SELF PING (O'zini uyg'otib turish)
// ============================================================
const RENDER_URL = `https://m27-anonimbot.onrender.com`; // O'zingizning Render URL manzilingizni shu yerga yozing

setInterval(async () => {
  try {
    await axios.get(RENDER_URL);
    console.log('✅ Bot uyg\'oq saqlanmoqda...');
  } catch (e) {
    console.log('⚠️ Ping yuborishda xato (Bot hali Live emas yoki manzil noto\'g\'ri).');
  }
}, 10 * 60 * 1000); // Har 10 daqiqada o'zini turtib qo'yadi

// ============================================================
//  📦 DOIMIY XOTIRA (DATABASE) TIZIMI
// ============================================================
const DB_PATH = path.join(__dirname, 'database.json');

// Xotiradan o'qish
function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { userStates: {}, replyMap: {}, messageLinker: {}, users: {}, logs: [] };
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!data.users) data.users = {};
    if (!data.logs) data.logs = [];
    return data;
  } catch (e) {
    return { userStates: {}, replyMap: {}, messageLinker: {}, users: {}, logs: [] };
  }
}

// Xotiraga saqlash
function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Xabarlarni saqlashda xato:', e);
  }
}

// Ma'lumotlarni yuklab olamiz
let db = loadDB();

const TEXTS = {
  welcome: (name, link) => 
    `👋 Salom, <b>${name}</b>!\n\n` +
    `Bu 🎭 <b>@m27_AnonimBot</b> — mutlaqo anonim xabarlar botidir.\n\n` +
    `🔗 <b>Sizning shaxsiy havolangiz:</b>\n` +
    `<code>${link}</code>\n\n` +
    `👆 Ushbu havolani Instagram bio/story yoki Telegram'ga joylang.\n` +
    `Odamlar sizga kimligini bildirmasdan xabar yubora olishadi!`,
  
  anonymousPrompt: `✍️ <b>Xabaringizni yuboring...</b>\n\nSiz hozir mutlaqo anonim tarzda yozayapsiz. Shaxsingiz sir saqlanadi.`,
  
  sentSuccess: `✅ <b>Yuborildi!</b>\n\nSizning anonim xabaringiz o'z egasiga yetkazildi.`,
  
  notSubscribed: `⚠️ <b>Kechirasiz!</b>\n\nBotdan foydalanish uchun kanalimizga a'zo bo'lishingiz kerak. Member bo'lganingizdan so'ng botni qayta ishga tushiring.`,
  
  profanityError: `🚫 <b>Xato!</b>\n\nXabaringizda haqoratli so'zlar borligi uchun yuborilmadi. Iltimos, odob doirasida yozing.`,
  
  blockedMessage: `⚠️ <b>Xabar yuborilmadi!</b>\n\nSiz bu foydalanuvchi tomonidan bloklangansiz yoki admin tomonidan blok qo'yilgan.`,
  
  receivedHeader: `💎 <b>Sizda yangi anonim xabar!</b>\n\n`,
  replyHeader: `💬 <b>Sizda yangi anonim javob!</b>\n\n`,
  
  replyHint: `\n\n<i>Javob berish uchun xabarni chapga suring yoki Reply (javob berish) bosing.</i>`,
  stats: (users, msgs) => `📊 <b>Bot Statistikasi:</b>\n\n👤 Foydalanuvchilar: ${users}\n✉️ Jami xabarlar: ${msgs}`,
  broadcastPrompt: `📢 <b>Broadcasting:</b> Xabaringizni yozing (barcha foydalanuvchilarga yuboriladi).`
};

const ADMIN_ID = process.env.ADMIN_ID; 
const CHANNEL_ID = '@m27_Anonim'; 

// Haqoratli so'zlar ro'yxati (Buni o'zingiz to'ldirishingiz mumkin)
const BAD_WORDS = ['jalap', 'qanjiq', 'itdan tarqagan', 'skay', 'am', 'kot', 'shalpang', 'sharmanda'];

function hasProfanity(text) {
  if (!text) return false;
  const regex = new RegExp(BAD_WORDS.join('|'), 'gi');
  return regex.test(text);
}

// Obunani tekshirish funksiyasi
async function isSubscribed(userId) {
  try {
    const member = await bot.getChatMember(CHANNEL_ID, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (e) {
    return true; 
  }
}

// Admin monitoring funksiyasi
async function logToAdmin(sender, receiverId, message, isReply = false) {
  if (!ADMIN_ID) return;
  
  const receiver = db.users[receiverId] || { name: 'Noma\'lum', id: receiverId };
  let typeText = "📝 MATN";
  
  if (message.photo) typeText = "🖼 FOTO";
  else if (message.video) typeText = "📹 VIDEO";
  else if (message.sticker) typeText = "✨ STIKER";
  else if (message.animation) typeText = "🎞 GIF";
  else if (message.voice) typeText = "🎤 OVOZLI XABAR";
  else if (message.video_note) typeText = "🎬 DUMALOQ VIDEO";
  else if (message.document) typeText = "📄 HUJJAT";
  else if (message.audio) typeText = "🎵 AUDIO";

  const modeText = isReply ? "💬 JAVOB" : "✍️ ANONIM XABAR";
  
  const logHeader = `📡 <b>ADMIN MONITORING</b>\n\n` +
                 `📂 Turi: ${typeText} (${modeText})\n` +
                 `👤 Kimdan: <a href="tg://user?id=${sender.id}">${sender.first_name}</a> (ID: ${sender.id})\n` +
                 `🎯 Kimga: <a href="tg://user?id=${receiver.id}">${receiver.name}</a> (ID: ${receiver.id})\n` +
                 `⏰ Vaqt: ${new Date().toLocaleString('uz-UZ')}\n\n`;

  try {
    if (message.text) {
      await bot.sendMessage(ADMIN_ID, logHeader + "<b>Xabar:</b> " + message.text, { parse_mode: 'HTML' });
    } else {
      await bot.copyMessage(ADMIN_ID, sender.id, message.message_id, {
        caption: logHeader + "<b>Izoh:</b> " + (message.caption || ''),
        parse_mode: 'HTML'
      });
    }
  } catch (e) {
    console.error('Logging failed:', e);
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text || '';

  // 1. /start buyrug'i
  if (text.startsWith('/start')) {
    // Foydalanuvchini bazaga qo'shish
    if (!db.users[chatId]) {
      db.users[chatId] = {
        id: chatId,
        name: msg.from.first_name,
        username: msg.from.username,
        joinedAt: new Date().toISOString()
      };
      saveDB(db);
    }

    // Obunani tekshirish
    const subscribed = await isSubscribed(chatId);
    if (!subscribed) {
        return bot.sendMessage(chatId, TEXTS.notSubscribed, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📢 Kanalga a'zo bo'lish", url: `https://t.me/m27_Anonim` }],
                    [{ text: "✅ Tekshirish", callback_data: `check_sub` }]
                ]
            }
        });
    }

    const startParam = text.split(' ')[1];
    if (startParam && startParam !== chatId) {
      db.userStates[chatId] = { targetId: startParam };
      saveDB(db);
      return bot.sendMessage(chatId, TEXTS.anonymousPrompt, { 
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: "cancel_send" }]]
        }
      });
    }

    const myLink = `https://t.me/m27_AnonimBot?start=${chatId}`;
    const options = {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: "📤 Havolani ulashish", url: `https://t.me/share/url?url=${encodeURIComponent(myLink)}&text=${encodeURIComponent("Men bilan anonim gaplashish uchun bosing!")}` }],
          [{ text: "❓ Yordam", callback_data: "help_info" }]
        ]
      }
    };
    return bot.sendMessage(chatId, TEXTS.welcome(msg.from.first_name, myLink), options);
  }

  // 2. Admin buyruqlari
  if (chatId === ADMIN_ID) {
    if (text === '/stats') {
      const userCount = Object.keys(db.users).length;
      const msgCount = Object.keys(db.replyMap).length;
      return bot.sendMessage(chatId, TEXTS.stats(userCount, msgCount), { parse_mode: 'HTML' });
    }

    if (text === '/send') {
      db.userStates[chatId] = { adminAction: 'broadcast' };
      saveDB(db);
      return bot.sendMessage(chatId, TEXTS.broadcastPrompt, { parse_mode: 'HTML' });
    }

    if (text === '/view_blocks') {
      let list = "🚫 <b>Barcha bloklar ro'yxati:</b>\n\n";
      Object.keys(db.users).forEach(uid => {
        const u = db.users[uid];
        if (u.blocked && u.blocked.length > 0) {
          list += `👤 <a href="tg://user?id=${u.id}">${u.name}</a> quyidagilarni bloklagan:\n`;
          u.blocked.forEach(bid => {
            const bu = db.users[bid] || { name: bid };
            list += `   └─ 🎯 <a href="tg://user?id=${bid}">${bu.name || bid}</a>\n`;
          });
          list += "\n";
        }
      });
      return bot.sendMessage(chatId, list || "Hali hech kim hech kimni bloklamagan.", { parse_mode: 'HTML' });
    }

    if (text.startsWith('/force_unblock')) {
        const parts = text.split(' ');
        if (parts.length === 3) {
            const userId = parts[1];
            const targetId = parts[2];
            if (db.users[userId] && db.users[userId].blocked) {
                db.users[userId].blocked = db.users[userId].blocked.filter(id => id !== targetId);
                saveDB(db);
                return bot.sendMessage(chatId, `✅ Admin tomonidan unblock qilindi.`);
            }
        }
        return bot.sendMessage(chatId, `Format: /force_unblock [userId] [targetId]`);
    }

    if (text.startsWith('/force_block')) {
        const parts = text.split(' ');
        if (parts.length === 3) {
            const userId = parts[1];
            const targetId = parts[2];
            if (db.users[userId]) {
                if (!db.users[userId].blocked) db.users[userId].blocked = [];
                if (!db.users[userId].blocked.includes(targetId)) {
                    db.users[userId].blocked.push(targetId);
                    saveDB(db);
                }
                return bot.sendMessage(chatId, `✅ Admin tomonidan bloklandi.`);
            }
        }
        return bot.sendMessage(chatId, `Format: /force_block [userId] [targetId]`);
    }
  }

  // Sokinishni tekshirish
  if (hasProfanity(text)) {
    return bot.sendMessage(chatId, TEXTS.profanityError, { parse_mode: 'HTML' });
  }

  // 2. Reply (Surish orqali javob berish) - MUDDATSIZ
  if (msg.reply_to_message) {
    const key = `${chatId}:${msg.reply_to_message.message_id}`;
    const targetUserId = db.replyMap[key];
    
    if (targetUserId) {
      try {
        const targetReplyToId = db.messageLinker[`${targetUserId}:${msg.reply_to_message.message_id}`];

        let sent;
        const options = {
          reply_to_message_id: targetReplyToId,
          parse_mode: 'HTML'
        };

        if (msg.text) {
          sent = await bot.sendMessage(targetUserId, TEXTS.replyHeader + msg.text + TEXTS.replyHint, options);
        } else {
          sent = await bot.copyMessage(targetUserId, chatId, msg.message_id, {
            ...options,
            caption: TEXTS.replyHeader + (msg.caption || '') + TEXTS.replyHint,
          });
        }

        // Yangi xabarlarni bog'laymiz
        db.replyMap[`${targetUserId}:${sent.message_id}`] = chatId;
        db.messageLinker[`${chatId}:${sent.message_id}`] = msg.reply_to_message.message_id;
        saveDB(db);

        // Adminga log qilish
        logToAdmin(msg.from, targetUserId, msg, true);

        return bot.sendMessage(chatId, `✅ Javobingiz yuborildi.`);
      } catch (e) {
        return bot.sendMessage(chatId, `❌ Xabarni yuborib bo'lmadi.`);
      }
    } else {
        return bot.sendMessage(chatId, `ℹ️ Kechirasiz, bu xabarga javob berib bo'lmaydi (Fayl o'chirilgan bo'lishi mumkin).`);
    }
  }

  // 3. Birinchi marta anonim xabar yuborish
  const state = db.userStates[chatId];
  if (state) {
    // Admin broadcast
    if (state.adminAction === 'broadcast' && chatId === ADMIN_ID) {
      const users = Object.keys(db.users);
      let success = 0;
      for (const u of users) {
        try {
          await bot.copyMessage(u, chatId, msg.message_id);
          success++;
        } catch (e) {}
      }
      delete db.userStates[chatId];
      saveDB(db);
      return bot.sendMessage(chatId, `✅ Xabar ${success} ta foydalanuvchiga yuborildi.`);
    }

    // Anonim xabar yuborish
    if (state.targetId) {
      const targetId = state.targetId;
      
      // Obunani tekshirish
      const subscribed = await isSubscribed(chatId);
      if (!subscribed) {
          return bot.sendMessage(chatId, TEXTS.notSubscribed, {
              parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: "📢 Kanalga a'zo bo'lish", url: `https://t.me/m27_Anonim` }],
                      [{ text: "✅ Tekshirish", callback_data: `check_sub` }]
                  ]
              }
          });
      }

      // Bloklanganmi tekshirish
      if (db.users[targetId] && db.users[targetId].blocked && db.users[targetId].blocked.includes(chatId)) {
        delete db.userStates[chatId];
        saveDB(db);
        return bot.sendMessage(chatId, TEXTS.blockedMessage, { parse_mode: 'HTML' });
      }

      try {
        let sent;
        const options = { 
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: "🚫 Bloklash", callback_data: `block_user:${chatId}` }]]
            }
        };

        if (msg.text) {
          sent = await bot.sendMessage(targetId, TEXTS.receivedHeader + msg.text + TEXTS.replyHint, options);
        } else {
          sent = await bot.copyMessage(targetId, chatId, msg.message_id, {
              ...options,
              caption: TEXTS.receivedHeader + (msg.caption || '') + TEXTS.replyHint,
          });
        }

        // Xabar va javoblarni bog'lab qo'yamiz
        db.replyMap[`${targetId}:${sent.message_id}`] = chatId;
        db.messageLinker[`${chatId}:${sent.message_id}`] = msg.message_id;
        
        delete db.userStates[chatId];
        saveDB(db);

        // Adminga log qilish
        logToAdmin(msg.from, targetId, msg, false);

        return bot.sendMessage(chatId, TEXTS.sentSuccess, { parse_mode: 'HTML' });
      } catch (e) {
        return bot.sendMessage(chatId, `❌ Xatolik yuz berdi. (Bloklangan bo'lishi mumkin)`);
      }
    }
  }

  // Yuzaki matn
  if (!text.startsWith('/') && !msg.reply_to_message) {
    bot.sendMessage(chatId, `ℹ️ O'z havolangizni olish uchun /start bosing.\nAnonim xabar yuborish uchun do'stingizning havolasiga bosing.`, {
        reply_markup: {
            inline_keyboard: [[{ text: "🔗 Mening havolam", callback_data: "my_link" }]]
        }
    });
  }
});

// Inline tugmalar bilan ishlash
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id.toString();
  const data = query.data;

  if (data === "cancel_send") {
    delete db.userStates[chatId];
    saveDB(db);
    bot.editMessageText("❌ Yuborish bekor qilindi.", { chat_id: chatId, message_id: query.message.message_id });
  } else if (data === "my_link") {
    const myLink = `https://t.me/m27_AnonimBot?start=${chatId}`;
    bot.sendMessage(chatId, `🔗 <b>Sizning havolangiz:</b>\n<code>${myLink}</code>`, { parse_mode: 'HTML' });
  } else if (data === "help_info") {
    bot.sendMessage(chatId, `📖 <b>Bot yo'riqnomasi:</b>\n\n1. Havolani ulashing.\n2. Do'stlaringiz sizga xabar yuboradi.\n3. Siz ularga javob bera olasiz (reply orqali).\n\nHammasi 100% anonim!`, { parse_mode: 'HTML' });
  } else if (data === "check_sub") {
    const subscribed = await isSubscribed(chatId);
    if (subscribed) {
        bot.deleteMessage(chatId, query.message.message_id);
        bot.sendMessage(chatId, "✅ Rahmat! Endi botdan to'liq foydalanishingiz mumkin. /start bosing.");
    } else {
        bot.answerCallbackQuery(query.id, { text: "⚠️ Siz hali kanalga a'zo emassiz!", show_alert: true });
    }
  } else if (data.startsWith("block_user:")) {
    const senderId = data.split(":")[1];
    if (!db.users[chatId].blocked) db.users[chatId].blocked = [];
    
    if (!db.users[chatId].blocked.includes(senderId)) {
        db.users[chatId].blocked.push(senderId);
        saveDB(db);
        bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "🔒 Bloklandi", callback_data: "done" }]] }, { chat_id: chatId, message_id: query.message.message_id });
        bot.answerCallbackQuery(query.id, { text: "Foydalanuvchi bloklandi!", show_alert: true });
    }
  }
  
  bot.answerCallbackQuery(query.id);
});

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('m27_Anonimbot: Database Persistence Active! 🎭'));
app.listen(PORT, () => console.log(`Server: ${PORT}`));


