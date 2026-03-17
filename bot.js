require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');

// ============================================================
//  🔑 TOKENS & CONFIG
// ============================================================
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ BOT_TOKEN topilmadi! .env faylini tekshiring.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ============================================================
//  📦 DATABASE (Simple JSON Storage)
// ============================================================
// Real loyihada MongoDB yoki PostgreSQL tavsiya etiladi.
const DB_PATH = path.join(__dirname, 'users.json');

function readDB() {
  if (!fs.existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// { replyToId: originalSenderId }
const replyMap = new Map(); 

// ============================================================
//  💬 TEXTS (O'zbekcha dizayn)
// =================================)
const TEXTS = {
  welcome: (name, link) => 
    `👋 Salom, <b>${name}</b>!\n\n` +
    `Bu 🎭 <b>@m27_AnonimBot</b> — mutlaqo anonim xabarlar, rasmlar va videolar yuborish botidir.\n\n` +
    `🔗 <b>Sizning shaxsiy havolangiz:</b>\n` +
    `<code>${link}</code>\n\n` +
    `👆 Ushbu havolani Instagram bio/story yoki Telegram kanalingizga joylang.\n` +
    `Odamlar sizga kimligini bildirmasdan <b>xabar, rasm, video, audio va musiqalar</b> yubora olishadi!`,
  
  anonymousPrompt: `✍️ <b>Xabaringizni yuboring...</b>\n\nSiz hozir mutlaqo anonim tarzda yozayapsiz.\n\n✅ <b>Nimalar yubora olasiz:</b>\n• 📝 Matn va Emojilar\n• 📸 Rasm (Photo)\n• 🎥 Video va Reels\n• 🎵 Musiqa (Audio/Music)\n• 🎤 Ovozli xabar (Voice)`,
  
  sentSuccess: `✅ <b>Yuborildi!</b>\n\nSizning anonim xabaringiz o'z egasiga yetkazildi.`,
  
  receivedMsg: `📩 <b>Sizga yangi anonim xabar keldi:</b>\n\n`,
  
  error: `❌ Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.`,
  
  replyHint: `\n\n<i>💬 Javob berish uchun ushbu xabarni "Reply" (Otvet) qiling.</i>`
};

// ============================================================
//  📩 MESSAGE HANDLER
// ============================================================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  // 1. /start buyrug'i (Havola orqali yoki to'g'ridan-to'g'ri)
  if (text.startsWith('/start')) {
    const startParam = text.split(' ')[1]; // t.me/bot?start=USERID
    
    // Agar foydalanuvchi boshqa birovning havolasiga bosgan bo'lsa
    if (startParam && startParam !== chatId.toString()) {
      userStates.set(chatId, { targetId: startParam });
      return bot.sendMessage(chatId, TEXTS.anonymousPrompt, { parse_mode: 'HTML' });
    }

    // O'zining linkini olish
    const myLink = `https://t.me/m27_AnonimBot?start=${chatId}`;
    return bot.sendMessage(chatId, TEXTS.welcome(msg.from.first_name, myLink), { parse_mode: 'HTML' });
  }

  // 2. Javob berish (Reply) - Egasi boshqaga anonim javob yo'llaganda
  if (msg.reply_to_message) {
    const originalSenderId = replyMap.get(msg.reply_to_message.message_id);
    if (originalSenderId) {
      try {
        await bot.copyMessage(originalSenderId, chatId, msg.message_id, {
          caption: `<b>💬 Sizga anonim javob keldi:</b>\n\n` + (msg.caption || ''),
          parse_mode: 'HTML'
        });
        return bot.sendMessage(chatId, `✅ Javobingiz yuborildi.`);
      } catch (e) {
        return bot.sendMessage(chatId, `❌ Foydalanuvchi botni bloklagan bo'lishi mumkin.`);
      }
    }
  }

  // 3. Anonim xabar yuborish (State orqali)
  const state = userStates.get(chatId);
  if (state && state.targetId) {
    const targetId = state.targetId;

    try {
      // Xabarni nusxalash (Text, Photo, Video, Voice hamma narsa o'tadi)
      const sent = await bot.copyMessage(targetId, chatId, msg.message_id, {
        caption: TEXTS.receivedMsg + (msg.caption || '') + TEXTS.replyHint,
        parse_mode: 'HTML'
      });

      // Javob berish uchun IDni saqlab qo'yamiz
      replyMap.set(sent.message_id, chatId);

      // State'ni tozalaymiz (xabar ketdi)
      userStates.delete(chatId);
      
      return bot.sendMessage(chatId, TEXTS.sentSuccess, { parse_mode: 'HTML' });
    } catch (e) {
      console.error('[Forward Error]', e.message);
      return bot.sendMessage(chatId, `❌ Xabarni yuborib bo'lmadi. Bot bloklangan bo'lishi mumkin.`);
    }
  }

  // Oddiy matn bo'lsa (linkisiz)
  if (!text.startsWith('/')) {
    bot.sendMessage(chatId, `ℹ️ Anonim xabar yuborish uchun birovning havolasiga (link) bosing.\n\nO'z havolangizni olish uchun /start bosing.`);
  }
});

// User holatlarini saqlash
const userStates = new Map();

// ============================================================
//  🌐 HEALTH CHECK SERVER (Render uchun)
// ============================================================
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('m27_Anonimbot is live! 🎭'));
app.listen(PORT, () => console.log(`📡 Server: ${PORT}`));

console.log('🎭 @m27_AnonimBot ishga tushdi!');
