require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ BOT_TOKEN topilmadi!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// Xotirada saqlash
const userStates = new Map();
const replyMap = new Map(); // { "targetChatId:sentMessageId": originalSenderChatId }
const messageLinker = new Map(); // { "senderChatId:originalMessageId": targetMessageIdInTargetChat }

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

  // 2. Reply (Surish orqali javob berish)
  if (msg.reply_to_message) {
    const key = `${chatId}:${msg.reply_to_message.message_id}`;
    const targetUserId = replyMap.get(key);
    
    if (targetUserId) {
      try {
        // Qaysi xabarga reply qilinganini topish (Vizual reply uchun)
        const targetReplyToId = messageLinker.get(`${targetUserId}:${msg.reply_to_message.message_id}`);

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

        // Keyingi javoblar uchun bog'lanishlarni saqlash
        replyMap.set(`${targetUserId}:${sent.message_id}`, chatId);
        messageLinker.set(`${chatId}:${sent.message_id}`, msg.reply_to_message.message_id);

        return bot.sendMessage(chatId, `✅ Javobingiz yuborildi.`);
      } catch (e) {
        console.error(e);
        return bot.sendMessage(chatId, `❌ Xabarni yuborib bo'lmadi.`);
      }
    } else {
        return bot.sendMessage(chatId, `ℹ️ Kechirasiz, ushbu xabarga javob berish muddati tugagan.`);
    }
  }

  // 3. Birinchi marta anonim xabar yuborish
  const state = userStates.get(chatId);
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

      // Javob qaytarish tizimi uchun saqlash
      replyMap.set(`${targetId}:${sent.message_id}`, chatId);
      // Bu yerda messageLinker ga xabarni o'zaro bog'liqligini qo'shamiz (reply ko'rinishi uchun)
      messageLinker.set(`${chatId}:${sent.message_id}`, msg.message_id);

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

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('m27_Anonimbot: Visual Reply Active! 🎭'));
app.listen(PORT, () => console.log(`Server: ${PORT}`));
