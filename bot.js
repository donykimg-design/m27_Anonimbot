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

// Xotirada saqlash (Key: "chatId:messageId")
const userStates = new Map();
const replyMap = new Map(); 

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

  // 2. Reply (Surish orqali javob berish) - Uzoq suhbatlar uchun
  if (msg.reply_to_message) {
    const key = `${chatId}:${msg.reply_to_message.message_id}`;
    const targetUserId = replyMap.get(key);
    
    if (targetUserId) {
      try {
        // Xabarni nusxalash
        const sent = await bot.copyMessage(targetUserId, chatId, msg.message_id, {
          caption: `<b>💬 Sizga anonim javob keldi:</b>\n\n` + (msg.caption || ''),
          parse_mode: 'HTML'
        });

        // MUHIM: Uzoq suhbat uchun yangi xabar ID-sini ham xaritaga qo'shamiz
        // Endi u odam ham bu javobga reply qila oladi
        replyMap.set(`${targetUserId}:${sent.message_id}`, chatId);

        return bot.sendMessage(chatId, `✅ Javobingiz yuborildi.`);
      } catch (e) {
        return bot.sendMessage(chatId, `❌ Xabarni yuborib bo'lmadi (Bloklangan bo'lishi mumkin).`);
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
      if (msg.text) {
        sent = await bot.sendMessage(targetId, TEXTS.receivedHeader + msg.text + TEXTS.replyHint, { parse_mode: 'HTML' });
      } else {
        sent = await bot.copyMessage(targetId, chatId, msg.message_id, {
            caption: TEXTS.receivedHeader + (msg.caption || '') + TEXTS.replyHint,
            parse_mode: 'HTML'
        });
      }

      // Xabar tizimda saqlanadi, u odam javob yo'llashi uchun
      replyMap.set(`${targetId}:${sent.message_id}`, chatId);

      userStates.delete(chatId);
      return bot.sendMessage(chatId, TEXTS.sentSuccess, { parse_mode: 'HTML' });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ Xatolik yuz berdi.`);
    }
  }

  // Hech qanday amal bo'lmasa yordamchi matn
  if (!text.startsWith('/') && !msg.reply_to_message) {
    bot.sendMessage(chatId, `ℹ️ O'z havolangizni olish uchun /start bosing.\nAnonim xabar yuborish uchun do'stingizning havolasiga bosing.`);
  }
});

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('m27_Anonimbot logic fixed! 🎭'));
app.listen(PORT, () => console.log(`Server: ${PORT}`));
