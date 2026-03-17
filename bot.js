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
  if (!fs.existsSync(DB_PATH)) return { userStates: {}, replyMap: {}, messageLinker: {} };
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    return { userStates: {}, replyMap: {}, messageLinker: {} };
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
  
  receivedHeader: `💎 <b>Sizda yangi anonim xabar!</b>\n\n`,
  replyHeader: `💬 <b>Sizda yangi anonim javob!</b>\n\n`,
  
  replyHint: `\n\n<i>Javob berish uchun suring.</i>`
};

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text || '';

  // 1. /start buyrug'i
  if (text.startsWith('/start')) {
    const startParam = text.split(' ')[1];
    if (startParam && startParam !== chatId) {
      db.userStates[chatId] = { targetId: startParam };
      saveDB(db);
      return bot.sendMessage(chatId, TEXTS.anonymousPrompt, { parse_mode: 'HTML' });
    }
    const myLink = `https://t.me/m27_AnonimBot?start=${chatId}`;
    return bot.sendMessage(chatId, TEXTS.welcome(msg.from.first_name, myLink), { parse_mode: 'HTML' });
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
  if (state && state.targetId) {
    const targetId = state.targetId;
    try {
      let sent;
      const options = { parse_mode: 'HTML' };

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

      return bot.sendMessage(chatId, TEXTS.sentSuccess, { parse_mode: 'HTML' });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ Xatolik yuz berdi.`);
    }
  }

  // Yuzaki matn
  if (!text.startsWith('/') && !msg.reply_to_message) {
    bot.sendMessage(chatId, `ℹ️ O'z havolangizni olish uchun /start bosing.\nAnonim xabar yuborish uchun do'stingizning havolasiga bosing.`);
  }
});

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('m27_Anonimbot: Database Persistence Active! 🎭'));
app.listen(PORT, () => console.log(`Server: ${PORT}`));
