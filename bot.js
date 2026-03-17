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
  console.error('❌ BOT_TOKEN topilmadi!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// User xolatlari va javoblar xaritasi
const userStates = new Map();
const replyMap = new Map(); // { sentMessageId: originalSenderChatId }

// ============================================================
//  💬 TEXTS (Dizayn yangilandi)
// ============================================================
const TEXTS = {
  welcome: (name, link) => 
    `👋 Salom, <b>${name}</b>!\n\n` +
    `Bu 🎭 <b>@m27_AnonimBot</b> — mutlaqo anonim xabarlar botidir.\n\n` +
    `🔗 <b>Sizning shaxsiy havolangiz:</b>\n` +
    `<code>${link}</code>\n\n` +
    `👆 Ushbu havolani Instagram bio/story yoki Telegram'ga joylang.\n` +
    `Odamlar sizga kimligini bildirmasdan xabar yoki media yubora olishadi!`,
  
  anonymousPrompt: `✍️ <b>Xabaringizni yuboring...</b>\n\nSiz hozir mutlaqo anonim tarzda yozayapsiz. Shaxsingiz sir saqlanadi.`,
  
  sentSuccess: `✅ <b>Yuborildi!</b>\n\nSizning anonim xabaringiz o'z egasiga yetkazildi.`,
  
  receivedHeader: `💎 <b>Sizda yangi anonim xabar!</b>\n\n`,
  
  replyHint: `\n\n<i>Javob berish uchun suring.</i>`
};

// ============================================================
//  📩 MESSAGE HANDLER
// ============================================================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  // 1. /start buyrug'i
  if (text.startsWith('/start')) {
    const startParam = text.split(' ')[1];
    
    if (startParam && startParam !== chatId.toString()) {
      userStates.set(chatId, { targetId: startParam });
      return bot.sendMessage(chatId, TEXTS.anonymousPrompt, { parse_mode: 'HTML' });
    }

    const myLink = `https://t.me/m27_AnonimBot?start=${chatId}`;
    return bot.sendMessage(chatId, TEXTS.welcome(msg.from.first_name, myLink), { parse_mode: 'HTML' });
  }

  // 2. Reply (Otvet) funksiyasi - Surish orqali javob berish
  if (msg.reply_to_message) {
    // Reply qilingan xabar bot yuborgan xabar bo'lishi kerak
    const originalSenderId = replyMap.get(msg.reply_to_message.message_id);
    if (originalSenderId) {
      try {
        await bot.copyMessage(originalSenderId, chatId, msg.message_id, {
          caption: `<b>💬 Sizga anonim javob keldi:</b>\n\n` + (msg.caption || ''),
          parse_mode: 'HTML'
        });
        return bot.sendMessage(chatId, `✅ Javobingiz yuborildi.`);
      } catch (e) {
        return bot.sendMessage(chatId, `❌ Xabarni yuborib bo'lmadi (bloklangan bo'lishi mumkin).`);
      }
    }
  }

  // 3. Anonim xabar yuborish
  const state = userStates.get(chatId);
  if (state && state.targetId) {
    const targetId = state.targetId;

    try {
      // Xabarni nusxalash (Text, Photo, Video, Voice...)
      let commonOptions = {
        parse_mode: 'HTML'
      };

      let sent;
      if (msg.text) {
        sent = await bot.sendMessage(targetId, TEXTS.receivedHeader + msg.text + TEXTS.replyHint, commonOptions);
      } else {
        sent = await bot.copyMessage(targetId, chatId, msg.message_id, {
            caption: TEXTS.receivedHeader + (msg.caption || '') + TEXTS.replyHint,
            parse_mode: 'HTML'
        });
      }

      // Javob qaytarish uchun xabar ID-sini eslab qolamiz
      replyMap.set(sent.message_id, chatId);

      userStates.delete(chatId);
      return bot.sendMessage(chatId, TEXTS.sentSuccess, { parse_mode: 'HTML' });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ Xatolik yuz berdi.`);
    }
  }

  // Yordamchi matn
  if (!text.startsWith('/') && !msg.reply_to_message) {
    bot.sendMessage(chatId, `ℹ️ O'z havolangizni olish uchun /start bosing.\nAnonim xabar yuborish uchun do'stingizning havolasiga bosing.`);
  }
});

// ============================================================
//  🌐 SERVER (Render uchun)
// ============================================================
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('m27_Anonimbot is Active! 🎭'));
app.listen(PORT, () => console.log(`Server: ${PORT}`));
